"""Supabase config version store — tracks brain_config evolution history.

@origin: new file for MOL Phase 3

Records every brain_config change with reason, diff, and metrics.
Enables rollback to any previous version.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_pool = None


async def _get_pool():
    global _pool
    if _pool is not None:
        return _pool

    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))
    from core.config import SUPABASE_DATABASE_URL

    if not SUPABASE_DATABASE_URL:
        return None

    import asyncpg
    _pool = await asyncpg.create_pool(SUPABASE_DATABASE_URL, min_size=1, max_size=3, ssl="require")
    logger.info("Supabase ConfigVersionStore connected")
    return _pool


class ConfigVersionStore:
    """Track brain_config version history in Supabase."""

    async def save_version(
        self,
        agent_name: str,
        config_snapshot: Dict[str, Any],
        *,
        change_reason: str = "manual",
        change_diff: Optional[Dict] = None,
        metrics: Optional[Dict] = None,
    ) -> int:
        """Save a new config version. Returns version number."""
        pool = await _get_pool()
        if not pool:
            return 0

        import json

        # Get next version
        row = await pool.fetchrow(
            "SELECT COALESCE(MAX(version), 0) + 1 as next_ver FROM agent_config_versions WHERE agent_name = $1",
            agent_name,
        )
        version = row["next_ver"]

        await pool.execute("""
            INSERT INTO agent_config_versions
                (agent_name, version, config_snapshot, change_reason, change_diff, metrics)
            VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb)
        """,
            agent_name, version,
            json.dumps(config_snapshot),
            change_reason,
            json.dumps(change_diff or {}),
            json.dumps(metrics or {}),
        )
        logger.info("Saved config v%d for '%s' (reason: %s)", version, agent_name, change_reason)
        return version

    async def list_versions(self, agent_name: str) -> List[Dict[str, Any]]:
        """List all config versions for an agent."""
        pool = await _get_pool()
        if not pool:
            return []

        rows = await pool.fetch(
            "SELECT version, change_reason, metrics, created_at FROM agent_config_versions WHERE agent_name = $1 ORDER BY version",
            agent_name,
        )
        return [dict(row) for row in rows]

    async def get_version(self, agent_name: str, version: int) -> Optional[Dict[str, Any]]:
        """Get a specific config version."""
        pool = await _get_pool()
        if not pool:
            return None

        row = await pool.fetchrow(
            "SELECT * FROM agent_config_versions WHERE agent_name = $1 AND version = $2",
            agent_name, version,
        )
        return dict(row) if row else None

    async def get_latest(self, agent_name: str) -> Optional[Dict[str, Any]]:
        """Get latest config version."""
        pool = await _get_pool()
        if not pool:
            return None

        row = await pool.fetchrow(
            "SELECT * FROM agent_config_versions WHERE agent_name = $1 ORDER BY version DESC LIMIT 1",
            agent_name,
        )
        return dict(row) if row else None

    async def close(self):
        global _pool
        if _pool:
            await _pool.close()
            _pool = None


__all__ = ["ConfigVersionStore"]
