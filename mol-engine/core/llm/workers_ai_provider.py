"""Cloudflare Workers AI provider — serverless LLM inference via REST API.

Free tier: 10,000 Neurons/day.
Supports LoRA adapters for fine-tuned inference.

API: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}
Docs: https://developers.cloudflare.com/workers-ai/
"""

import json
import logging
from typing import Any, Dict, Optional

import httpx

from core.config import CF_ACCOUNT_ID, CF_API_TOKEN, CF_LORA_ID, CF_MODEL
from core.llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)

CF_API_BASE = "https://api.cloudflare.com/client/v4/accounts"


class WorkersAIProvider(BaseLLMProvider):
    """Cloudflare Workers AI provider (qwq-32b default, LoRA support)."""

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    def _url(self) -> str:
        return f"{CF_API_BASE}/{CF_ACCOUNT_ID}/ai/run/{CF_MODEL}"

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {CF_API_TOKEN}"}

    def provider_name(self) -> str:
        return "workers_ai"

    async def generate(self, prompt: str, *, system: str = "", temperature: float = 0.3, max_tokens: int = 256) -> Optional[str]:
        client = self._get_client()

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        body: Dict[str, Any] = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        # Add LoRA adapter if configured
        if CF_LORA_ID:
            body["lora"] = CF_LORA_ID

        try:
            resp = await client.post(self._url(), json=body, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()

            # Workers AI response: { result: { response: "..." }, success: true }
            if data.get("success"):
                return data.get("result", {}).get("response", "").strip()

            # Some models return directly
            result = data.get("result", {})
            if isinstance(result, str):
                return result.strip()

            logger.warning("Workers AI unexpected response: %s", str(data)[:200])
            return None

        except Exception as exc:
            logger.warning("Workers AI generate failed: %s", exc)
            return None

    async def generate_json(self, prompt: str, *, system: str = "", temperature: float = 0.3, max_tokens: int = 128) -> Optional[Dict[str, Any]]:
        raw = await self.generate(prompt, system=system, temperature=temperature, max_tokens=max_tokens)
        if not raw:
            return None
        return _parse_json(raw)

    async def is_available(self) -> bool:
        if not CF_ACCOUNT_ID or not CF_API_TOKEN:
            return False
        try:
            client = self._get_client()
            # Simple test: list models (lightweight call)
            resp = await client.get(
                f"{CF_API_BASE}/{CF_ACCOUNT_ID}/ai/models/search",
                headers=self._headers(),
                params={"search": "qwen"},
            )
            return resp.status_code == 200
        except Exception:
            return False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None


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
        logger.warning("Failed to parse Workers AI JSON: %s", raw[:200])
        return None
