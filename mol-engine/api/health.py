"""Health check endpoint."""

from fastapi import APIRouter

from core.llm import get_provider
from core import config

router = APIRouter(tags=["system"])

_store = None

def set_store(store):
    global _store
    _store = store


@router.get("/v1/health")
async def health():
    """Service health — provider status, model info, trace count."""
    provider = get_provider()
    available = await provider.is_available()

    model = config.CF_MODEL if config.LLM_PROVIDER == "workers_ai" else config.OLLAMA_MODEL

    result = {
        "status": "ok",
        "provider": provider.provider_name(),
        "provider_available": available,
        "model": model,
    }

    if config.CF_LORA_ID:
        result["lora_id"] = config.CF_LORA_ID

    if _store:
        stats = _store.global_stats()
        result["trace_count"] = stats.get("total_traces", 0)

    return result
