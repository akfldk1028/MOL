"""Interest check endpoints — LLM judges if an agent is interested in a post.

Uses the configured LLM provider (Ollama local or Workers AI production).
Falls back to keyword matching if the provider is unavailable.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from core.config import MAX_CONTENT_LENGTH
from core.llm import get_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/interest", tags=["interest"])

_registry = None

def set_registry(registry):
    global _registry
    _registry = registry


# ── Models ───────────────────────────────────────────────

class AgentInfo(BaseModel):
    id: str
    name: str
    display_name: Optional[str] = None
    persona: Optional[str] = None
    expertise_topics: List[str] = []

class PostInfo(BaseModel):
    id: Optional[str] = None
    title: str = ""
    content: str = ""
    post_type: str = "general"

class InterestCheckRequest(BaseModel):
    agent: Optional[AgentInfo] = None
    agent_name: Optional[str] = None  # Alternative: just send name, registry loads the rest
    post: PostInfo

class BatchInterestCheckRequest(BaseModel):
    agent: Optional[AgentInfo] = None
    agent_name: Optional[str] = None
    posts: List[PostInfo]

class InterestCheckResponse(BaseModel):
    interested: bool
    score: float
    reason: str
    provider: str  # "ollama", "workers_ai", "fallback"


# ── Prompts ──────────────────────────────────────────────

SYSTEM_PROMPT = """당신은 AI 커뮤니티 에이전트입니다. 게시글을 보고 당신의 성격과 관심사에 맞는지 판단합니다.
반드시 JSON만 출력하세요. 다른 텍스트는 절대 포함하지 마세요."""

USER_PROMPT = """당신은 '{name}'입니다.
성격: {persona}
관심 분야: {topics}

다음 게시글에 대한 관심도를 판단하세요:
제목: {title}
내용: {content}

JSON 출력: {{"interested": true/false, "score": 0.0~1.0, "reason": "한줄이유"}}"""


# ── Endpoints ────────────────────────────────────────────

def _resolve_agent(agent: Optional[AgentInfo], agent_name: Optional[str]) -> AgentInfo:
    """Resolve agent info from request body or registry.

    Priority: 1) agent with persona 2) registry lookup by name 3) agent without persona 4) error
    """
    if agent and agent.persona:
        return agent
    name = agent_name or (agent.name if agent else None)
    if name and _registry:
        profile = _registry.get(name)
        if profile:
            return AgentInfo(
                id=profile.agent_id,
                name=profile.name,
                display_name=profile.display_name,
                persona=profile.persona,
                expertise_topics=profile.expertise_topics,
            )
    if agent:
        return agent
    from fastapi import HTTPException
    raise HTTPException(400, "Either 'agent' or 'agent_name' is required")


@router.post("/check", response_model=InterestCheckResponse)
async def check_interest(req: InterestCheckRequest) -> InterestCheckResponse:
    """Single post interest check."""
    agent = _resolve_agent(req.agent, req.agent_name)
    return await _check_one(agent, req.post)


@router.post("/check/batch")
async def batch_interest_check(req: BatchInterestCheckRequest):
    """Batch interest check — multiple posts, one agent."""
    agent = _resolve_agent(req.agent, req.agent_name)
    results = await asyncio.gather(*[_check_one(agent, p) for p in req.posts])
    return {
        "results": [
            {"post_id": req.posts[i].id, **r.model_dump()}
            for i, r in enumerate(results)
        ]
    }


# ── Core logic ───────────────────────────────────────────

async def _check_one(agent: AgentInfo, post: PostInfo) -> InterestCheckResponse:
    """Ask LLM provider whether this agent is interested in this post."""
    provider = get_provider()

    name = agent.display_name or agent.name
    topics = ", ".join(agent.expertise_topics) if agent.expertise_topics else "다양한 주제"

    prompt = USER_PROMPT.format(
        name=name,
        persona=agent.persona or "일반적인 커뮤니티 참여자",
        topics=topics,
        title=post.title or "(제목 없음)",
        content=(post.content or "")[:MAX_CONTENT_LENGTH] or "(내용 없음)",
    )

    result = await provider.generate_json(prompt, system=SYSTEM_PROMPT, temperature=0.3, max_tokens=128)

    if result and "score" in result:
        return InterestCheckResponse(
            interested=bool(result.get("interested", False)),
            score=max(0.0, min(1.0, float(result.get("score", 0.0)))),
            reason=str(result.get("reason", "")),
            provider=provider.provider_name(),
        )

    return _keyword_fallback(agent, post)


def _keyword_fallback(agent: AgentInfo, post: PostInfo) -> InterestCheckResponse:
    """Keyword matching fallback when LLM is unavailable."""
    topics = agent.expertise_topics
    if not topics:
        return InterestCheckResponse(interested=False, score=0.2, reason="no topics", provider="fallback")

    text = f"{post.title} {post.content}".lower()
    matches = sum(1 for t in topics if t.lower().replace("_", " ") in text)
    score = min(1.0, matches / max(1, len(topics)) + 0.2)

    return InterestCheckResponse(
        interested=score >= 0.4,
        score=round(score, 3),
        reason=f"keyword match {matches}/{len(topics)}",
        provider="fallback",
    )
