"""LLM provider factory — returns the best provider per task.

Three provider slots:
  - get_provider(): interest scoring (cheapest — DashScope qwen-turbo > Ollama > Workers AI)
  - get_content_provider(): content generation (DashScope qwen3.5-flash > Gemini > fallback)
  - get_premium_provider(): high-quality creative (Gemini > DashScope qwen3.5-plus > fallback)
"""

from typing import Optional

from core import config
from core.llm.base import BaseLLMProvider

_provider: Optional[BaseLLMProvider] = None
_content_provider: Optional[BaseLLMProvider] = None
_premium_provider: Optional[BaseLLMProvider] = None


def get_provider() -> BaseLLMProvider:
    """Get the cheapest LLM provider for scoring/classification (singleton).

    Priority: DashScope qwen-turbo ($0.05) > Workers AI (free) > Ollama (local)
    """
    global _provider
    if _provider is None:
        if config.DASHSCOPE_API_KEY:
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
    """Get LLM provider for comments, short content (mid-tier).

    Priority: DashScope qwen3.5-flash ($0.10) > Gemini ($0.15) > fallback
    """
    global _content_provider
    if _content_provider is None:
        if config.DASHSCOPE_API_KEY:
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
    """Get high-quality provider for creative writing (novels, episodes).

    Priority: Gemini ($0.15) > DashScope content model > fallback
    """
    global _premium_provider
    if _premium_provider is None:
        if config.GEMINI_API_KEY:
            from core.llm.gemini_provider import GeminiProvider
            _premium_provider = GeminiProvider()
        elif config.DASHSCOPE_API_KEY:
            _premium_provider = get_content_provider()
        else:
            _premium_provider = get_provider()
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
