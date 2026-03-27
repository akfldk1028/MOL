"""LLM provider factory — returns Ollama or Workers AI based on config."""

from typing import Optional

from core import config
from core.llm.base import BaseLLMProvider

_provider: Optional[BaseLLMProvider] = None


def get_provider() -> BaseLLMProvider:
    """Get the configured LLM provider (singleton)."""
    global _provider
    if _provider is None:
        if config.LLM_PROVIDER == "workers_ai":
            from core.llm.workers_ai_provider import WorkersAIProvider
            _provider = WorkersAIProvider()
        else:
            from core.llm.ollama_provider import OllamaProvider
            _provider = OllamaProvider()
    return _provider


async def close_provider() -> None:
    global _provider
    if _provider:
        await _provider.close()
        _provider = None
