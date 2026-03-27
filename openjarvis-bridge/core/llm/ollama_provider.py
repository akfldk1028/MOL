"""Ollama LLM provider — local inference via Ollama REST API."""

import json
import logging
from typing import Any, Dict, Optional

import httpx

from core.config import OLLAMA_BASE, OLLAMA_MODEL, OLLAMA_TIMEOUT
from core.llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)


class OllamaProvider(BaseLLMProvider):
    """Ollama local LLM provider (qwen2.5:3b default)."""

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(base_url=OLLAMA_BASE, timeout=OLLAMA_TIMEOUT)
        return self._client

    def provider_name(self) -> str:
        return "ollama"

    async def generate(self, prompt: str, *, system: str = "", temperature: float = 0.3, max_tokens: int = 256) -> Optional[str]:
        client = self._get_client()
        body: Dict[str, Any] = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        if system:
            body["system"] = system

        try:
            resp = await client.post("/api/generate", json=body)
            resp.raise_for_status()
            return resp.json().get("response", "").strip()
        except Exception as exc:
            logger.warning("Ollama generate failed: %s", exc)
            return None

    async def generate_json(self, prompt: str, *, system: str = "", temperature: float = 0.3, max_tokens: int = 128) -> Optional[Dict[str, Any]]:
        raw = await self.generate(prompt, system=system, temperature=temperature, max_tokens=max_tokens)
        if not raw:
            return None
        return _parse_json(raw)

    async def is_available(self) -> bool:
        try:
            client = self._get_client()
            resp = await client.get("/api/tags")
            if resp.status_code != 200:
                return False
            models = [m.get("name", "") for m in resp.json().get("models", [])]
            return any(OLLAMA_MODEL in m for m in models)
        except Exception:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None


def _parse_json(raw: str) -> Optional[Dict[str, Any]]:
    """Extract JSON from LLM response (handles markdown wrapping)."""
    text = raw
    if "```" in text:
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else parts[0]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    start = text.find("{")
    end = text.rfind("}") + 1
    if start >= 0 and end > start:
        text = text[start:end]

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Failed to parse JSON: %s", raw[:200])
        return None
