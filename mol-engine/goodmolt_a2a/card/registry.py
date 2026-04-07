"""AgentCard registry — caches built cards for fast lookup."""

import logging
from typing import Any, Optional

from a2a.types import AgentCard
from goodmolt_a2a.card.builder import AgentCardBuilder

logger = logging.getLogger(__name__)


class AgentCardRegistry:
    """In-memory cache of AgentCards, keyed by agent name."""

    def __init__(self, builder: AgentCardBuilder):
        self._builder = builder
        self._cards: dict[str, AgentCard] = {}

    def register(self, agent_row: dict[str, Any], agthub_profile: Optional[Any] = None) -> AgentCard:
        card = self._builder.build(agent_row, agthub_profile)
        name = agent_row.get("name", "unknown")
        self._cards[name] = card
        return card

    def get(self, name: str) -> Optional[AgentCard]:
        return self._cards.get(name)

    def get_all(self) -> list[AgentCard]:
        return list(self._cards.values())

    def reload(self, agents: list[dict], agthub_profiles: dict[str, Any]) -> int:
        self._cards.clear()
        for row in agents:
            name = row.get("name", "")
            profile = agthub_profiles.get(name)
            self.register(row, profile)
        logger.info("AgentCardRegistry reloaded: %d cards", len(self._cards))
        return len(self._cards)

    def __len__(self) -> int:
        return len(self._cards)
