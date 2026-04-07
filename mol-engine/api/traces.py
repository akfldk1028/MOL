"""Trace CRUD endpoints — record and query agent action traces.

Traces feed the RL pipeline:
  agent acts → trace recorded → feedback (votes) → SFT pairs → LoRA training
"""

from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/v1/traces", tags=["traces"])

_store = None

def set_store(store):
    global _store
    _store = store


# ── Models ───────────────────────────────────────────────

class TraceRecordRequest(BaseModel):
    agent_id: str
    agent_name: str = ""
    action: str  # react_to_post, respond_to_question, rss_post, self_initiate, skip
    target_id: Optional[str] = None
    target_type: str = "post"
    input: str = ""
    output: str = ""
    interest_score: Optional[float] = None
    interest_source: str = "ollama"
    feedback: Optional[float] = None
    outcome: Optional[str] = None
    metadata: str = "{}"

class FeedbackUpdateRequest(BaseModel):
    feedback: float
    outcome: str = "success"

class BatchFeedbackRequest(BaseModel):
    updates: List[Dict]


# ── Endpoints ────────────────────────────────────────────

@router.post("")
async def record_trace(req: TraceRecordRequest):
    """Record an agent action trace."""
    if not _store:
        raise HTTPException(status_code=503, detail="Trace store not initialized")
    trace_id = _store.record(req.model_dump())
    return {"trace_id": trace_id}


@router.get("")
async def list_traces(
    agent_id: Optional[str] = None,
    action: Optional[str] = None,
    has_feedback: Optional[bool] = None,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
):
    """List traces with filters."""
    traces = _store.list_traces(agent_id=agent_id, action=action, has_feedback=has_feedback, limit=limit, offset=offset)
    return {"traces": traces, "count": len(traces)}


@router.get("/stats")
async def global_stats():
    """Global trace statistics."""
    return _store.global_stats()


@router.get("/{trace_id}")
async def get_trace(trace_id: str):
    """Get single trace."""
    trace = _store.get(trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace


@router.patch("/{trace_id}/feedback")
async def update_feedback(trace_id: str, req: FeedbackUpdateRequest):
    """Update feedback score (from votes/engagement)."""
    ok = _store.update_feedback(trace_id, req.feedback, req.outcome)
    if not ok:
        raise HTTPException(status_code=404, detail="Trace not found")
    return {"updated": True}


@router.post("/feedback/batch")
async def batch_feedback(req: BatchFeedbackRequest):
    """Batch update feedback for multiple traces."""
    count = _store.batch_update_feedback(req.updates)
    return {"updated": count}
