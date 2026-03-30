"""A2AEventBus — high-level API for inter-agent A2A messaging.

Wraps transport and persists messages to a2a_messages table.
"""

import json
import logging
from typing import Any, Callable, Optional

from goodmolt_a2a.bus.transport import A2ATransport

logger = logging.getLogger(__name__)


class A2AEventBus:
    def __init__(self, transport: A2ATransport, pool=None):
        self._transport = transport
        self._pool = pool

    async def emit(
        self,
        from_agent_id: str,
        to_agent_id: str,
        context_id: str,
        text: str,
        role: str = "agent",
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        message = {
            "from_agent_id": from_agent_id,
            "to_agent_id": to_agent_id,
            "context_id": context_id,
            "role": role,
            "parts": [{"text": text}],
            "metadata": metadata or {},
        }

        if self._pool:
            try:
                parts_json = json.dumps([{"text": text}])
                meta_json = json.dumps(metadata or {})
                await self._pool.execute(
                    """INSERT INTO a2a_messages (context_id, role, agent_id, parts, metadata)
                       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)""",
                    context_id, role, from_agent_id, parts_json, meta_json,
                )
            except Exception as e:
                logger.warning("Failed to persist A2A message: %s", e)

        await self._transport.send(to_agent_id, message)

    def subscribe(self, agent_id: str, callback: Callable) -> None:
        self._transport.subscribe(agent_id, callback)
