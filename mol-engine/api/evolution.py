"""Evolution API — trigger and manage agent evolution.

Endpoints:
  POST /v1/evolution/analyze    — analyze traces, get recommendations
  POST /v1/evolution/fix-soul   — fix an agent's SOUL.md
  POST /v1/evolution/fix-rules  — fix an agent's RULES.md
  POST /v1/evolution/capture    — capture behavioral pattern
  GET  /v1/evolution/history    — get evolution history
  GET  /v1/evolution/versions/{agent_name} — list config versions
  POST /v1/evolution/rollback   — rollback to previous version
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/evolution", tags=["evolution"])

_evolver = None      # AgentConfigEvolver
_soul_evolver = None  # SoulEvolver
_adapter = None       # AGTHUBSkillAdapter
_trace_store = None   # core TraceStore


def set_dependencies(evolver, soul_evolver, adapter, trace_store):
    global _evolver, _soul_evolver, _adapter, _trace_store
    _evolver = evolver
    _soul_evolver = soul_evolver
    _adapter = adapter
    _trace_store = trace_store


# ── Request Models ──────────────────────────────

class AnalyzeRequest(BaseModel):
    agent_name: Optional[str] = None  # None = all agents
    limit: int = 500

class FixSoulRequest(BaseModel):
    agent_name: str
    issue: str

class FixRulesRequest(BaseModel):
    agent_name: str
    issue: str

class CaptureRequest(BaseModel):
    agent_name: str
    pattern: str

class RollbackRequest(BaseModel):
    agent_name: str
    version: int


# ── Endpoints ───────────────────────────────────

@router.post("/analyze")
async def analyze_traces(req: AnalyzeRequest):
    """Analyze recent traces and return evolution recommendations."""
    if not _evolver or not _trace_store:
        raise HTTPException(500, "Evolution system not initialized")

    traces = _trace_store.list_traces(limit=req.limit)
    if req.agent_name:
        traces = [t for t in traces if t.get("agent_name") == req.agent_name]

    recommendations = _evolver.analyze(traces)
    return {
        "recommendations": recommendations,
        "trace_count": len(traces),
    }


@router.post("/fix-soul")
async def fix_soul(req: FixSoulRequest):
    """Fix an agent's SOUL.md based on an identified issue."""
    if not _soul_evolver:
        raise HTTPException(500, "SoulEvolver not initialized")

    evo = await _soul_evolver.fix_soul(req.agent_name, req.issue)
    if not evo:
        raise HTTPException(404, f"Agent '{req.agent_name}' not found")

    return {
        "agent_name": evo.agent_name,
        "type": evo.evolution_type.value,
        "target": evo.target,
        "reason": evo.reason,
        "old_length": len(evo.old_content),
        "new_length": len(evo.new_content),
    }


@router.post("/fix-rules")
async def fix_rules(req: FixRulesRequest):
    """Fix an agent's RULES.md."""
    if not _soul_evolver:
        raise HTTPException(500, "SoulEvolver not initialized")

    evo = await _soul_evolver.fix_rules(req.agent_name, req.issue)
    if not evo:
        raise HTTPException(404, f"Agent '{req.agent_name}' not found")

    return {
        "agent_name": evo.agent_name,
        "type": evo.evolution_type.value,
        "target": evo.target,
        "reason": evo.reason,
    }


@router.post("/capture")
async def capture_pattern(req: CaptureRequest):
    """Capture a successful behavioral pattern into RULES.md."""
    if not _soul_evolver or not _trace_store:
        raise HTTPException(500, "Evolution system not initialized")

    # Get recent successful traces for this agent
    all_traces = _trace_store.list_traces(limit=100)
    agent_traces = [
        t for t in all_traces
        if t.get("agent_name") == req.agent_name and t.get("outcome") == "success"
    ]

    evo = await _soul_evolver.capture_pattern(req.agent_name, req.pattern, agent_traces)
    if not evo:
        raise HTTPException(404, f"Agent '{req.agent_name}' not found")

    return {
        "agent_name": evo.agent_name,
        "type": evo.evolution_type.value,
        "pattern": req.pattern,
        "trace_count": len(agent_traces),
    }


@router.get("/history")
async def get_history(agent_name: Optional[str] = None):
    """Get evolution history."""
    if not _soul_evolver:
        raise HTTPException(500, "SoulEvolver not initialized")

    history = _soul_evolver.get_history(agent_name)
    return {
        "history": [
            {
                "agent_name": e.agent_name,
                "type": e.evolution_type.value,
                "target": e.target,
                "reason": e.reason,
                "created_at": e.created_at,
            }
            for e in history
        ],
        "count": len(history),
    }


@router.get("/versions/{agent_name}")
async def list_versions(agent_name: str):
    """List config version history for an agent."""
    if not _evolver:
        raise HTTPException(500, "AgentConfigEvolver not initialized")

    versions = _evolver.list_versions(agent_name)
    return {"agent_name": agent_name, "versions": versions}


@router.post("/rollback")
async def rollback(req: RollbackRequest):
    """Rollback agent config to a previous version."""
    if not _evolver:
        raise HTTPException(500, "AgentConfigEvolver not initialized")

    success = _evolver.rollback(req.agent_name, req.version)
    if not success:
        raise HTTPException(404, f"Version {req.version} not found for '{req.agent_name}'")

    return {"agent_name": req.agent_name, "rolled_back_to": req.version}
