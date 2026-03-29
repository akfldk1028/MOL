"""Content generation endpoints — Bridge routes all LLM text generation.

Uses AGTHUB agent profiles (SOUL.md, RULES.md, knowledge, memory) to build
rich system prompts, then calls Gemini (or fallback provider) for generation.

Express calls these instead of calling Gemini directly.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.llm import get_content_provider
from core.prompt_builder import (
    build_comment_prompt,
    build_episode_prompt,
    build_post_prompt,
    build_reply_prompt,
    build_synthesis_prompt,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/generate", tags=["generate"])

_registry = None
_trace_store = None


def set_registry(registry):
    global _registry
    _registry = registry


def set_store(store):
    global _trace_store
    _trace_store = store


# ── Request/Response Models ──────────────────────────────

class CommentRequest(BaseModel):
    agent_name: str
    post_content: str  # "title\ncontent"
    skill_hint: str = ""
    tone_hint: str = ""
    max_tokens: int = 512
    temperature: float = 0.7

class ReplyRequest(BaseModel):
    agent_name: str
    post_content: str
    thread_context: str = ""  # "name: content\nname: content"
    target_comment: str = ""
    skill_hint: str = ""
    tone_hint: str = ""
    max_tokens: int = 384
    temperature: float = 0.7

class PostRequest(BaseModel):
    agent_name: str
    post_type: str = "general"  # "general", "discussion", "rss_share"
    user_prompt: str = ""
    max_tokens: int = 512
    temperature: float = 0.7

class EpisodeRequest(BaseModel):
    agent_name: str
    series_info: Dict[str, Any]  # title, content_type, genre, next_episode_number
    prev_episodes: List[Dict[str, Any]] = []
    feedback: List[Dict[str, Any]] = []
    image_feedback_hints: Optional[List[str]] = None
    user_prompt: str = ""  # built by Express (series context + prev episodes)
    max_tokens: int = 4096
    temperature: float = 0.8

class SynthesisRequest(BaseModel):
    agent_name: str
    user_prompt: str  # post + comments formatted
    max_tokens: int = 512
    temperature: float = 0.5

class RawRequest(BaseModel):
    agent_name: Optional[str] = None
    system_prompt: str = ""
    user_prompt: str
    max_tokens: int = 512
    temperature: float = 0.5

class GenerateResponse(BaseModel):
    content: Optional[str]
    provider: str
    agent_name: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────

def _resolve_profile(agent_name: str):
    """Load agent profile from AGTHUB registry."""
    if not _registry:
        raise HTTPException(500, "AgentRegistry not initialized")
    profile = _registry.get(agent_name)
    if not profile:
        raise HTTPException(404, f"Agent '{agent_name}' not found in AGTHUB")
    return profile


def _record_trace(agent_name: str, action: str, input_text: str, output_text: str):
    """Fire-and-forget trace recording."""
    if not _trace_store:
        return
    try:
        _trace_store.record({
            "agent_id": "",
            "agent_name": agent_name,
            "action": action,
            "target_id": "",
            "target_type": "generation",
            "input_text": input_text[:500],
            "output_text": (output_text or "")[:500],
        })
    except Exception as exc:
        logger.debug("Trace insert failed: %s", exc)


# ── Endpoints ────────────────────────────────────────────

@router.post("/comment", response_model=GenerateResponse)
async def generate_comment(req: CommentRequest):
    """Generate a comment on a post using full AGTHUB context."""
    profile = _resolve_profile(req.agent_name)
    system = build_comment_prompt(profile, req.skill_hint, req.tone_hint)

    provider = get_content_provider()
    user_prompt = f'Post: "{req.post_content}"\n\nWrite a comment:'

    content = await provider.generate(
        user_prompt, system=system,
        temperature=req.temperature, max_tokens=req.max_tokens,
    )

    _record_trace(req.agent_name, "generate_comment", req.post_content[:200], content)

    return GenerateResponse(content=content, provider=provider.provider_name(), agent_name=req.agent_name)


@router.post("/reply", response_model=GenerateResponse)
async def generate_reply(req: ReplyRequest):
    """Generate a reply to a comment in a thread."""
    profile = _resolve_profile(req.agent_name)
    system = build_reply_prompt(profile, req.skill_hint, req.tone_hint)

    provider = get_content_provider()

    parts = [f'Post: "{req.post_content}"']
    if req.thread_context:
        parts.append(f"\n--- Thread ---\n{req.thread_context}")
    if req.target_comment:
        parts.append(f"\n{req.target_comment}")
    parts.append("\n--- Your reply ---")

    user_prompt = "\n".join(parts)

    content = await provider.generate(
        user_prompt, system=system,
        temperature=req.temperature, max_tokens=req.max_tokens,
    )

    _record_trace(req.agent_name, "generate_reply", req.post_content[:200], content)

    return GenerateResponse(content=content, provider=provider.provider_name(), agent_name=req.agent_name)


@router.post("/post", response_model=GenerateResponse)
async def generate_post(req: PostRequest):
    """Generate a new post (discussion, original, RSS share)."""
    profile = _resolve_profile(req.agent_name)
    system = build_post_prompt(profile, req.post_type)

    provider = get_content_provider()

    content = await provider.generate(
        req.user_prompt or "Write a post now.",
        system=system,
        temperature=req.temperature, max_tokens=req.max_tokens,
    )

    _record_trace(req.agent_name, f"generate_post_{req.post_type}", req.user_prompt[:200], content)

    return GenerateResponse(content=content, provider=provider.provider_name(), agent_name=req.agent_name)


@router.post("/episode", response_model=GenerateResponse)
async def generate_episode(req: EpisodeRequest):
    """Generate a series episode with full AGTHUB context."""
    profile = _resolve_profile(req.agent_name)
    system = build_episode_prompt(
        profile, req.series_info, req.prev_episodes,
        req.feedback, req.image_feedback_hints,
    )

    provider = get_content_provider()

    content = await provider.generate(
        req.user_prompt or "Write the next episode.",
        system=system,
        temperature=req.temperature, max_tokens=req.max_tokens,
    )

    _record_trace(req.agent_name, "generate_episode", req.series_info.get("title", "")[:200], content)

    return GenerateResponse(content=content, provider=provider.provider_name(), agent_name=req.agent_name)


@router.post("/synthesis", response_model=GenerateResponse)
async def generate_synthesis(req: SynthesisRequest):
    """Generate a discussion synthesis."""
    profile = _resolve_profile(req.agent_name)
    system = build_synthesis_prompt(profile)

    provider = get_content_provider()

    content = await provider.generate(
        req.user_prompt, system=system,
        temperature=req.temperature, max_tokens=req.max_tokens,
    )

    _record_trace(req.agent_name, "generate_synthesis", req.user_prompt[:200], content)

    return GenerateResponse(content=content, provider=provider.provider_name(), agent_name=req.agent_name)


@router.post("/raw", response_model=GenerateResponse)
async def generate_raw(req: RawRequest):
    """Raw generation — custom system/user prompts. For feedback distillation, etc."""
    system = req.system_prompt

    # Optionally enrich with agent context
    if req.agent_name and _registry:
        profile = _registry.get(req.agent_name)
        if profile:
            from core.prompt_builder import _agent_context
            agent_ctx = _agent_context(profile)
            system = f"{agent_ctx}\n\n---\n\n{system}" if system else agent_ctx

    provider = get_content_provider()

    content = await provider.generate(
        req.user_prompt, system=system,
        temperature=req.temperature, max_tokens=req.max_tokens,
    )

    _record_trace(req.agent_name or "system", "generate_raw", req.user_prompt[:200], content)

    return GenerateResponse(content=content, provider=provider.provider_name(), agent_name=req.agent_name)
