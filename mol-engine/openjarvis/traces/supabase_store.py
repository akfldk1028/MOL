"""Supabase TraceStore — replaces SQLite with Supabase agent_traces table.

@origin: new file for MOL Phase 3

Uses asyncpg for async DB access. Falls back to SQLite TraceStoreAdapter
if SUPABASE_DATABASE_URL is not set.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from .types import Trace, TraceStep, StepType

logger = logging.getLogger(__name__)

_pool = None


async def _get_pool():
    """Lazy-init asyncpg pool."""
    global _pool
    if _pool is not None:
        return _pool

    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from core.config import SUPABASE_DATABASE_URL

    if not SUPABASE_DATABASE_URL:
        logger.warning("SUPABASE_DATABASE_URL not set, Supabase traces unavailable")
        return None

    import asyncpg
    _pool = await asyncpg.create_pool(SUPABASE_DATABASE_URL, min_size=1, max_size=5, ssl="require")
    logger.info("Supabase TraceStore connected")
    return _pool


class SupabaseTraceStore:
    """Async Supabase-backed trace store for agent_traces table."""

    async def record(self, data: Dict[str, Any]) -> str:
        """Record a trace to Supabase."""
        pool = await _get_pool()
        if not pool:
            return ""

        trace_id = data.get("trace_id") or uuid.uuid4().hex[:16]
        await pool.execute("""
            INSERT INTO agent_traces
                (trace_id, agent_id, agent_name, action, target_id, target_type,
                 input_text, output_text, interest_score, interest_source,
                 feedback, outcome, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (trace_id) DO NOTHING
        """,
            trace_id,
            data.get("agent_id", ""),
            data.get("agent_name", ""),
            data.get("action", ""),
            data.get("target_id"),
            data.get("target_type", "post"),
            data.get("input_text", ""),
            data.get("output_text", ""),
            data.get("interest_score"),
            data.get("interest_source", "dashscope"),
            data.get("feedback"),
            data.get("outcome"),
            data.get("metadata", "{}") if isinstance(data.get("metadata"), str) else "{}",
        )
        return trace_id

    async def list_traces(
        self,
        *,
        agent_name: Optional[str] = None,
        action: Optional[str] = None,
        since: Optional[float] = None,
        until: Optional[float] = None,
        limit: int = 1000,
    ) -> List[Trace]:
        """Query traces from Supabase, return as OJ Trace objects."""
        pool = await _get_pool()
        if not pool:
            return []

        query = "SELECT * FROM agent_traces WHERE 1=1"
        params = []
        idx = 1

        if agent_name:
            query += f" AND agent_name = ${idx}"
            params.append(agent_name)
            idx += 1
        if action:
            query += f" AND action = ${idx}"
            params.append(action)
            idx += 1
        if since:
            query += f" AND created_at >= to_timestamp(${idx})"
            params.append(since)
            idx += 1
        if until:
            query += f" AND created_at <= to_timestamp(${idx})"
            params.append(until)
            idx += 1

        query += f" ORDER BY created_at DESC LIMIT ${idx}"
        params.append(limit)

        rows = await pool.fetch(query, *params)

        traces = []
        for row in rows:
            created = row["created_at"].timestamp() if row["created_at"] else 0
            traces.append(Trace(
                trace_id=row["trace_id"],
                query=row["input_text"] or "",
                agent=row["agent_name"] or "",
                model=row["interest_source"] or "",
                outcome=row["outcome"],
                feedback=row["feedback"],
                steps=[TraceStep(
                    step_type=StepType.GENERATE,
                    timestamp=created,
                    input={"text": row["input_text"] or "", "action": row["action"] or ""},
                    output={"text": row["output_text"] or ""},
                )],
                started_at=created,
                ended_at=created,
            ))
        return traces

    async def list_traces_raw(
        self,
        *,
        agent_name: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Query traces as raw dicts (for evolution API compatibility)."""
        pool = await _get_pool()
        if not pool:
            return []

        query = "SELECT * FROM agent_traces"
        params = []
        idx = 1

        if agent_name:
            query += f" WHERE agent_name = ${idx}"
            params.append(agent_name)
            idx += 1

        query += f" ORDER BY created_at DESC LIMIT ${idx}"
        params.append(limit)

        rows = await pool.fetch(query, *params)
        return [dict(row) for row in rows]

    async def update_feedback(self, trace_id: str, feedback: float, outcome: str = "success") -> bool:
        pool = await _get_pool()
        if not pool:
            return False
        result = await pool.execute(
            "UPDATE agent_traces SET feedback = $1, outcome = $2 WHERE trace_id = $3",
            feedback, outcome, trace_id,
        )
        return "UPDATE 1" in result

    async def close(self):
        global _pool
        if _pool:
            await _pool.close()
            _pool = None


__all__ = ["SupabaseTraceStore"]
