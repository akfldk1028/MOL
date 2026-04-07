"""LLM provider factory — GLM free primary → DashScope fallback.

Three provider slots (all with GLM→DashScope fallback when GLM_API_KEY set):
  - get_provider(): scoring (GLM-4.7-Flash free → qwen-turbo fallback)
  - get_content_provider(): content (GLM-4.7-Flash free → qwen3.5-flash fallback)
  - get_premium_provider(): creative = content provider (qwen3.5-plus 사용 금지)
"""

import logging
from typing import Optional

from core import config
from core.llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)

_provider: Optional[BaseLLMProvider] = None
_content_provider: Optional[BaseLLMProvider] = None
_premium_provider: Optional[BaseLLMProvider] = None


def _make_glm_fallback(dashscope_model: str) -> BaseLLMProvider:
    """Create GLM primary → DashScope fallback provider."""
    from core.llm.glm_provider import GLMProvider
    from core.llm.dashscope_provider import DashScopeProvider
    from core.llm.fallback_provider import FallbackProvider

    glm = GLMProvider(
        api_key=config.GLM_API_KEY,
        model=config.GLM_MODEL,
    )
    dashscope = DashScopeProvider(
        api_key=config.DASHSCOPE_API_KEY,
        model=dashscope_model,
        base_url=config.DASHSCOPE_BASE_URL,
    )
    return FallbackProvider(glm, dashscope)


def get_provider() -> BaseLLMProvider:
    """Get scoring provider (cheapest).

    Priority: GLM-4.7-Flash (free) → DashScope qwen-turbo ($0.05) → Ollama
    """
    global _provider
    if _provider is None:
        if config.GLM_API_KEY and config.DASHSCOPE_API_KEY:
            _provider = _make_glm_fallback(config.DASHSCOPE_MODEL)
            logger.info("LLM scoring: GLM %s (free) → DashScope %s (fallback)", config.GLM_MODEL, config.DASHSCOPE_MODEL)
        elif config.DASHSCOPE_API_KEY:
            from core.llm.dashscope_provider import DashScopeProvider
            _provider = DashScopeProvider(
                api_key=config.DASHSCOPE_API_KEY,
                model=config.DASHSCOPE_MODEL,
                base_url=config.DASHSCOPE_BASE_URL,
            )
        elif config.LLM_PROVIDER == "workers_ai":
            from core.llm.workers_ai_provider import WorkersAIProvider
            _provider = WorkersAIProvider()
        elif config.LLM_PROVIDER == "gemini":
            from core.llm.gemini_provider import GeminiProvider
            _provider = GeminiProvider()
        else:
            from core.llm.ollama_provider import OllamaProvider
            _provider = OllamaProvider()
    return _provider


def get_content_provider() -> BaseLLMProvider:
    """Get content provider (comments, posts).

    Priority: GLM-4.7-Flash (free) → DashScope qwen3.5-flash ($0.065) → Gemini
    """
    global _content_provider
    if _content_provider is None:
        if config.GLM_API_KEY and config.DASHSCOPE_API_KEY:
            _content_provider = _make_glm_fallback(config.DASHSCOPE_CONTENT_MODEL)
            logger.info("LLM content: GLM %s (free) → DashScope %s (fallback)", config.GLM_MODEL, config.DASHSCOPE_CONTENT_MODEL)
        elif config.DASHSCOPE_API_KEY:
            from core.llm.dashscope_provider import DashScopeProvider
            _content_provider = DashScopeProvider(
                api_key=config.DASHSCOPE_API_KEY,
                model=config.DASHSCOPE_CONTENT_MODEL,
                base_url=config.DASHSCOPE_BASE_URL,
            )
        elif config.GEMINI_API_KEY:
            from core.llm.gemini_provider import GeminiProvider
            _content_provider = GeminiProvider()
        else:
            _content_provider = get_provider()
    return _content_provider


def get_premium_provider() -> BaseLLMProvider:
    """Get premium provider = content provider (qwen3.5-plus 사용 금지)."""
    global _premium_provider
    if _premium_provider is None:
        _premium_provider = get_content_provider()
    return _premium_provider


async def close_provider() -> None:
    global _provider, _content_provider, _premium_provider
    if _provider:
        await _provider.close()
        _provider = None
    if _content_provider:
        await _content_provider.close()
        _content_provider = None
    if _premium_provider:
        await _premium_provider.close()
        _premium_provider = None
