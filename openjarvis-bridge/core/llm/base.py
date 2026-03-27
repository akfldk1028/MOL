"""Base LLM provider interface."""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class BaseLLMProvider(ABC):
    """Abstract base for LLM providers (Ollama, Workers AI, etc.)."""

    @abstractmethod
    async def generate(self, prompt: str, *, system: str = "", temperature: float = 0.3, max_tokens: int = 256) -> Optional[str]:
        """Generate text completion. Returns raw text or None on failure."""
        ...

    @abstractmethod
    async def generate_json(self, prompt: str, *, system: str = "", temperature: float = 0.3, max_tokens: int = 128) -> Optional[Dict[str, Any]]:
        """Generate and parse JSON response. Returns dict or None on failure."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if the provider is reachable and has the configured model."""
        ...

    @abstractmethod
    def provider_name(self) -> str:
        """Return provider identifier: 'ollama', 'workers_ai', etc."""
        ...

    async def close(self) -> None:
        """Cleanup resources. Override if needed."""
        pass
