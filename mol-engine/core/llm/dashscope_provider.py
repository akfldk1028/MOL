"""DashScope (Alibaba Qwen) LLM provider — OpenAI-compatible REST API.

Cheapest option for scoring, comments, and general tasks.
API: POST https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions

Models (qwen3.5-plus 사용 금지 — 비용 과다):
  - qwen-turbo: $0.05/1M input, $0.20/1M output (scoring, classification, 대부분)
  - qwen3.5-flash: $0.10/1M input, $0.40/1M output (에피소드, 웹툰 스크립트, 프리미엄)
"""

import json
import logging
from typing import Any, Dict, Optional

import httpx

from core.llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)


class DashScopeProvider(BaseLLMProvider):
    """Alibaba DashScope provider via OpenAI-compatible API."""

    def __init__(self, api_key: str, model: str = "qwen-turbo", base_url: str = ""):
        self._api_key = api_key
        self._model = model
        self._base_url = base_url or "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=60.0,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    def provider_name(self) -> str:
        return f"dashscope/{self._model}"

    async def generate(
        self,
        prompt: str,
        *,
        system: str = "",
        temperature: float = 0.7,
        max_tokens: int = 1024,
    ) -> Optional[str]:
        if not self._api_key:
            logger.warning("DASHSCOPE_API_KEY not configured")
            return None

        client = self._get_client()
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        body = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        url = f"{self._base_url}/chat/completions"

        try:
            resp = await client.post(url, json=body)
            resp.raise_for_status()
            data = resp.json()
            return _extract_text(data)
        except httpx.HTTPStatusError as exc:
            logger.warning("DashScope API error %s: %s", exc.response.status_code, exc.response.text[:200])
            return None
        except Exception as exc:
            logger.warning("DashScope generate failed: %s", exc)
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
        if not self._api_key:
            return False
        try:
            client = self._get_client()
            url = f"{self._base_url}/chat/completions"
            body = {
                "model": self._model,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 4,
            }
            resp = await client.post(url, json=body)
            return resp.status_code == 200
        except Exception:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None


def _extract_text(data: dict) -> Optional[str]:
    """Extract text from OpenAI-compatible response."""
    choices = data.get("choices", [])
    if not choices:
        return None
    return choices[0].get("message", {}).get("content", "").strip() or None


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
        logger.warning("Failed to parse DashScope JSON: %s", raw[:200])
        return None
