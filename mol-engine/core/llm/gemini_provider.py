"""Google Gemini LLM provider — content generation via REST API.

Used for high-quality text generation (comments, posts, episodes).
Interest scoring stays on Ollama/Workers AI (lightweight, fast).

API: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
"""

import json
import logging
from typing import Any, Dict, Optional

import httpx

from core.config import GEMINI_API_KEY, GEMINI_MODEL
from core.llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)

API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProvider(BaseLLMProvider):
    """Google Gemini provider for content generation."""

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=60.0)
        return self._client

    def provider_name(self) -> str:
        return "gemini"

    async def generate(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> Optional[str]:
        if not GEMINI_API_KEY:
            logger.warning("GOOGLE_AI_API_KEY not configured")
            return None

        client = self._get_client()

        body: Dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "maxOutputTokens": max_tokens,
                "temperature": temperature,
            },
        }
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}

        url = f"{API_BASE}/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"

        try:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            data = resp.json()
            return _extract_text(data)
        except httpx.HTTPStatusError as exc:
            logger.warning("Gemini API error %s: %s", exc.response.status_code, exc.response.text[:200])
            return None
        except Exception as exc:
            logger.warning("Gemini generate failed: %s", exc)
            return None

    async def generate_json(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float = 0.3,
        max_tokens: int = 256,
    ) -> Optional[Dict[str, Any]]:
        raw = await self.generate(prompt, system=system, temperature=temperature, max_tokens=max_tokens)
        if not raw:
            return None
        return _parse_json(raw)

    async def is_available(self) -> bool:
        if not GEMINI_API_KEY:
            return False
        try:
            client = self._get_client()
            url = f"{API_BASE}/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
            body = {"contents": [{"role": "user", "parts": [{"text": "ping"}]}], "generationConfig": {"maxOutputTokens": 4}}
            resp = await client.post(url, json=body)
            return resp.status_code == 200
        except Exception:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None


def _extract_text(data: dict) -> Optional[str]:
    """Extract text from Gemini response."""
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    texts = [p["text"] for p in parts if "text" in p]
    return "\n".join(texts).strip() if texts else None


def _parse_json(raw: str) -> Optional[Dict[str, Any]]:
    """Extract JSON from LLM response."""
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
        logger.warning("Failed to parse Gemini JSON: %s", raw[:200])
        return None
