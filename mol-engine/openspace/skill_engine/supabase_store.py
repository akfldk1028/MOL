"""Supabase SkillStore — replaces SQLite with Supabase skill_records table.

@origin: new file for MOL Phase 3

Tracks skill evolution metrics, version history, and performance data.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_pool = None


async def _get_pool():
    global _pool
    if _pool is not None:
        return _pool

    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from core.config import SUPABASE_DATABASE_URL

    if not SUPABASE_DATABASE_URL:
        return None

    import asyncpg
    _pool = await asyncpg.create_pool(SUPABASE_DATABASE_URL, min_size=1, max_size=3, ssl="require")
    logger.info("Supabase SkillStore connected")
    return _pool


class SupabaseSkillStore:
    """Async Supabase-backed store for skill_records table."""

    async def record_evolution(
        self,
        agent_name: str,
        skill_type: str,        # "soul" or "rules"
        origin: str,            # "initial", "fix", "derived", "captured"
        content_snapshot: str,
        *,
        parent_skill_id: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> str:
        """Record a skill evolution event."""
        pool = await _get_pool()
        if not pool:
            return ""

        skill_id = f"{agent_name}__{skill_type}"

        # Get next version
        row = await pool.fetchrow(
            "SELECT COALESCE(MAX(version), 0) + 1 as next_ver FROM skill_records WHERE skill_id = $1",
            skill_id,
        )
        version = row["next_ver"]

        await pool.execute("""
            INSERT INTO skill_records
                (skill_id, agent_name, skill_type, origin, version,
                 content_snapshot, parent_skill_id, last_evolved_at, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
        """,
            skill_id, agent_name, skill_type, origin, version,
            content_snapshot, parent_skill_id,
            json.dumps(metadata or {}),
        )
        logger.info("Recorded %s evolution: %s v%d (%s)", skill_type, agent_name, version, origin)
        return skill_id

    async def update_metrics(
        self,
        agent_name: str,
        skill_type: str,
        success: bool,
        feedback: Optional[float] = None,
    ):
        """Update success/failure counts for latest version of a skill."""
        pool = await _get_pool()
        if not pool:
            return

        skill_id = f"{agent_name}__{skill_type}"
        col = "success_count" if success else "failure_count"
        if col not in ("success_count", "failure_count"):
            return  # guard against unexpected values

        await pool.execute(f"""
            UPDATE skill_records SET {col} = {col} + 1,
                avg_feedback = CASE
                    WHEN $2 IS NOT NULL THEN
                        (avg_feedback * (success_count + failure_count) + $2) / (success_count + failure_count + 1)
                    ELSE avg_feedback
                END
            WHERE skill_id = $1 AND version = (
                SELECT MAX(version) FROM skill_records WHERE skill_id = $1
            )
        """, skill_id, feedback)

    async def get_history(
        self,
        agent_name: Optional[str] = None,
        skill_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Get evolution history."""
        pool = await _get_pool()
        if not pool:
            return []

        query = "SELECT * FROM skill_records WHERE 1=1"
        params = []
        idx = 1

        if agent_name:
            query += f" AND agent_name = ${idx}"
            params.append(agent_name)
            idx += 1
        if skill_type:
            query += f" AND skill_type = ${idx}"
            params.append(skill_type)
            idx += 1

        query += f" ORDER BY created_at DESC LIMIT ${idx}"
        params.append(limit)

        rows = await pool.fetch(query, *params)
        return [dict(row) for row in rows]

    async def get_latest(self, agent_name: str, skill_type: str) -> Optional[Dict[str, Any]]:
        """Get latest version of a skill."""
        pool = await _get_pool()
        if not pool:
            return None

        row = await pool.fetchrow("""
            SELECT * FROM skill_records
            WHERE agent_name = $1 AND skill_type = $2
            ORDER BY version DESC LIMIT 1
        """, agent_name, skill_type)
        return dict(row) if row else None

    async def close(self):
        global _pool
        if _pool:
            await _pool.close()
            _pool = None


__all__ = ["SupabaseSkillStore"]
