"""Conversation manager — A2A context and message CRUD.

Manages a2a_contexts (agent-to-agent conversation sessions)
and a2a_messages (individual messages within conversations).
"""

import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


class ConversationManager:
    """Manages A2A conversations backed by Supabase PostgreSQL."""

    def __init__(self, pool):
        self._pool = pool

    async def create_context(
        self,
        initiator_agent_id: str,
        target_agent_id: str,
        skill_id: str = None,
        metadata: dict = None,
    ) -> dict:
        """Create a new conversation context between two agents."""
        row = await self._pool.fetchrow(
            """INSERT INTO a2a_contexts (initiator_agent_id, target_agent_id, skill_id, metadata)
               VALUES ($1, $2, $3, $4::jsonb)
               RETURNING id, initiator_agent_id, target_agent_id, skill_id, state, created_at""",
            initiator_agent_id, target_agent_id, skill_id,
            json.dumps(metadata or {}),
        )
        logger.info("Context created: %s (%s → %s)", row["id"], initiator_agent_id, target_agent_id)
        return dict(row)

    async def get_context(self, context_id: str) -> Optional[dict]:
        """Get a conversation context by ID."""
        row = await self._pool.fetchrow(
            "SELECT * FROM a2a_contexts WHERE id = $1", context_id
        )
        return dict(row) if row else None

    async def add_message(
        self,
        context_id: str,
        agent_id: str,
        role: str,
        text: str,
        task_id: str = None,
        metadata: dict = None,
    ) -> dict:
        """Add a message to a conversation."""
        parts_json = json.dumps([{"text": text}])
        row = await self._pool.fetchrow(
            """INSERT INTO a2a_messages (context_id, task_id, role, agent_id, parts, metadata)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
               RETURNING id, context_id, role, agent_id, parts, created_at""",
            context_id, task_id, role, agent_id, parts_json,
            json.dumps(metadata or {}),
        )
        return dict(row)

    async def get_messages(self, context_id: str, limit: int = 50) -> list[dict]:
        """Get messages for a conversation, ordered by creation time."""
        rows = await self._pool.fetch(
            """SELECT id, context_id, task_id, role, agent_id, parts, metadata, created_at
               FROM a2a_messages WHERE context_id = $1
               ORDER BY created_at ASC LIMIT $2""",
            context_id, limit,
        )
        return [dict(r) for r in rows]

    async def close_context(self, context_id: str) -> bool:
        """Close a conversation context."""
        result = await self._pool.execute(
            "UPDATE a2a_contexts SET state = 'closed', updated_at = NOW() WHERE id = $1",
            context_id,
        )
        return "UPDATE 1" in result
