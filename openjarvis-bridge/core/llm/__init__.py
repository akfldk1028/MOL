"""LLM provider factory — returns Ollama, Workers AI, or Gemini based on config.

Two provider slots:
  - get_provider(): interest scoring (lightweight — Ollama/Workers AI)
  - get_content_provider(): content generation (Gemini preferred, fallback to get_provider)
"""

from typing import Optional

from core import config
from core.llm.base import BaseLLMProvider

_provider: Optional[BaseLLMProvider] = None
_content_provider: Optional[BaseLLMProvider] = None


def get_provider() -> BaseLLMProvider:
    """Get the configured LLM provider for interest scoring (singleton)."""
    global _provider
    if _provider is None:
        if config.LLM_PROVIDER == "workers_ai":
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
    """Get the LLM provider for content generation (Gemini preferred).

    Falls back to the default provider if Gemini is not configured.
    """
    global _content_provider
    if _content_provider is None:
        if config.GEMINI_API_KEY:
            from core.llm.gemini_provider import GeminiProvider
            _content_provider = GeminiProvider()
        else:
            _content_provider = get_provider()
    return _content_provider


async def close_provider() -> None:
    global _provider, _content_provider
    if _provider:
        await _provider.close()
        _provider = None
    if _content_provider:
        await _content_provider.close()
        _content_provider = None
