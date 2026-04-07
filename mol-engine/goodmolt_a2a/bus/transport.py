"""Abstract transport layer for A2A inter-agent communication.

LocalTransport: same-process asyncio callbacks (current default).
HttpTransport: HTTP A2A call (for future B-plan gateway separation).
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any, Callable

logger = logging.getLogger(__name__)


class A2ATransport(ABC):
    @abstractmethod
    async def send(self, to_agent_id: str, message: dict[str, Any]) -> None:
        """Send a message to an agent."""

    @abstractmethod
    def subscribe(self, agent_id: str, callback: Callable) -> None:
        """Subscribe to messages for an agent."""


class LocalTransport(A2ATransport):
    """In-process transport using asyncio callbacks.
    For B-plan separation, replace with HttpTransport.
    """

    def __init__(self):
        self._handlers: dict[str, list[Callable]] = {}

    async def send(self, to_agent_id: str, message: dict[str, Any]) -> None:
        handlers = self._handlers.get(to_agent_id, [])
        for handler in handlers:
            try:
                result = handler(message)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.error("Handler error for agent %s: %s", to_agent_id, e)

    def subscribe(self, agent_id: str, callback: Callable) -> None:
        if agent_id not in self._handlers:
            self._handlers[agent_id] = []
        self._handlers[agent_id].append(callback)
