"""FallbackProvider — try primary, fall back to secondary on failure.

Usage:
  primary = GLMProvider(key, "GLM-4.7-Flash")
  secondary = DashScopeProvider(key, "qwen-turbo")
  provider = FallbackProvider(primary, secondary)
"""

import logging
from typing import Any, Dict, Optional

from core.llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)


class FallbackProvider(BaseLLMProvider):
    """Wraps two providers: tries primary first, falls back to secondary."""

    def __init__(self, primary: BaseLLMProvider, secondary: BaseLLMProvider):
        self._primary = primary
        self._secondary = secondary
        self._primary_failures = 0
        self._total_calls = 0

    def provider_name(self) -> str:
        return f"fallback({self._primary.provider_name()}→{self._secondary.provider_name()})"

    async def generate(self, prompt: str, *, system: str = "", temperature: float = 0.7, max_tokens: int = 1024) -> Optional[str]:
        self._total_calls += 1
        result = await self._primary.generate(prompt, system=system, temperature=temperature, max_tokens=max_tokens)
        if result:
            return result

        self._primary_failures += 1
        if self._primary_failures % 10 == 1:
            logger.info("FallbackProvider: %s failed (%d/%d), using %s",
                        self._primary.provider_name(), self._primary_failures, self._total_calls,
                        self._secondary.provider_name())
        return await self._secondary.generate(prompt, system=system, temperature=temperature, max_tokens=max_tokens)

    async def generate_json(self, prompt: str, *, system: str = "", temperature: float = 0.3, max_tokens: int = 128) -> Optional[Dict[str, Any]]:
        self._total_calls += 1
        result = await self._primary.generate_json(prompt, system=system, temperature=temperature, max_tokens=max_tokens)
        if result:
            return result

        self._primary_failures += 1
        return await self._secondary.generate_json(prompt, system=system, temperature=temperature, max_tokens=max_tokens)

    async def is_available(self) -> bool:
        return await self._primary.is_available() or await self._secondary.is_available()

    async def close(self) -> None:
        await self._primary.close()
        await self._secondary.close()

    @property
    def stats(self) -> Dict[str, Any]:
        return {
            "total_calls": self._total_calls,
            "primary_failures": self._primary_failures,
            "fallback_rate": round(self._primary_failures / max(self._total_calls, 1), 3),
        }
