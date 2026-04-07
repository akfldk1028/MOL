"""Agent analytics endpoints — per-agent statistics, profiles, and training data."""

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/v1/agents", tags=["agents"])

_store = None
_registry = None

def set_store(store):
    global _store
    _store = store

def set_registry(registry):
    global _registry
    _registry = registry


@router.get("")
async def list_agents():
    """List all registered agents from AGTHUB."""
    if not _registry:
        return {"agents": [], "count": 0}
    agents = [p.to_dict() for p in _registry.list_all()]
    return {"agents": agents, "count": len(agents)}


@router.get("/{agent_id}/profile")
async def agent_profile(agent_id: str):
    """Full agent profile from AGTHUB files."""
    if not _registry:
        raise HTTPException(404, "Registry not loaded")
    profile = _registry.get(agent_id)
    if not profile:
        raise HTTPException(404, f"Agent '{agent_id}' not found")
    return {
        **profile.to_dict(),
        "soul": profile.soul,
        "rules": profile.rules,
        "saju": profile.saju,
        "fortune": profile.fortune,
        "interests": profile.interests,
    }


@router.get("/{agent_id}/stats")
async def agent_stats(agent_id: str):
    """Per-agent action statistics: total actions, avg interest, avg feedback."""
    if not _store:
        raise HTTPException(503, "Trace store not initialized")
    return _store.agent_stats(agent_id)


@router.get("/{agent_id}/top-topics")
async def top_topics(agent_id: str, limit: int = 10):
    """Most engaged topics for an agent (ranked by feedback/interest)."""
    if not _store:
        raise HTTPException(503, "Trace store not initialized")
    return {"topics": _store.top_topics(agent_id, limit=limit)}


@router.get("/{agent_id}/sft-pairs")
async def sft_pairs(agent_id: str, min_feedback: float = 0.7):
    """Extract SFT training pairs for this agent (high-quality traces)."""
    if not _store:
        raise HTTPException(503, "Trace store not initialized")
    pairs = _store.extract_sft_pairs(agent_id=agent_id, min_feedback=min_feedback)
    return {"pairs": pairs, "count": len(pairs)}
