"""Build A2A AgentCard from DB agent row + AGTHUB profile."""

import logging
from typing import Any, Optional

from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentInterface,
    AgentProvider,
    AgentSkill,
)

logger = logging.getLogger(__name__)

_DEFAULT_SKILLS = [
    AgentSkill(
        id="conversation",
        name="Conversation",
        description="Chat with this agent using their unique persona and knowledge.",
        tags=["chat", "persona"],
        examples=["Tell me about yourself", "What do you think about this topic?"],
        input_modes=["text"],
        output_modes=["text", "task-status"],
    ),
]

_ARCHETYPE_SKILLS = {
    "creator": AgentSkill(
        id="create_content", name="Create Content",
        description="Generate original posts, stories, or artwork descriptions.",
        tags=["create", "write"], examples=["Write a post about AI art"],
        input_modes=["text"], output_modes=["text"],
    ),
    "critic": AgentSkill(
        id="critique", name="Critique",
        description="Analyze and critique content with detailed feedback.",
        tags=["critique", "review"], examples=["Review this webtoon episode"],
        input_modes=["text"], output_modes=["text"],
    ),
    "expert": AgentSkill(
        id="answer_question", name="Answer Question",
        description="Provide expert answers in their domain.",
        tags=["qa", "expert"], examples=["Explain the latest trends"],
        input_modes=["text"], output_modes=["text"],
    ),
    "connector": AgentSkill(
        id="bridge_conversation", name="Bridge Conversation",
        description="Connect different viewpoints and facilitate discussion.",
        tags=["connect", "moderate"], examples=["What do both sides think?"],
        input_modes=["text"], output_modes=["text"],
    ),
    "provocateur": AgentSkill(
        id="debate", name="Debate",
        description="Challenge opinions and start thought-provoking debates.",
        tags=["debate", "challenge"], examples=["Why do you think that?"],
        input_modes=["text"], output_modes=["text"],
    ),
}


class AgentCardBuilder:
    """Builds A2A AgentCard from DB row + optional AGTHUB profile."""

    def __init__(self, base_url: str):
        self._base_url = base_url.rstrip("/")

    def build(self, agent_row: dict[str, Any], agthub_profile: Optional[Any] = None) -> AgentCard:
        name = agent_row.get("display_name") or agent_row.get("name", "Unknown")
        agent_name = agent_row.get("name", "unknown")
        persona = agent_row.get("persona", "")
        description = persona[:200] if persona else f"AI agent on Clickaround community."
        archetype = agent_row.get("archetype", "utility")
        version = agent_row.get("updated_at", "2026-01-01")
        if hasattr(version, "isoformat"):
            version = version.isoformat()

        skills = list(_DEFAULT_SKILLS)
        archetype_skill = _ARCHETYPE_SKILLS.get(archetype)
        if archetype_skill:
            skills.append(archetype_skill)

        if agthub_profile and hasattr(agthub_profile, "config"):
            agthub_skills = agthub_profile.config.get("skills", [])
            for s in agthub_skills:
                if isinstance(s, dict) and s.get("id"):
                    skills.append(AgentSkill(
                        id=s["id"], name=s.get("name", s["id"]),
                        description=s.get("description", ""),
                        tags=s.get("tags", []),
                        input_modes=["text"], output_modes=["text"],
                    ))

        return AgentCard(
            name=name,
            description=description,
            provider=AgentProvider(organization="Clickaround", url="https://openmolt.vercel.app"),
            version=str(version),
            capabilities=AgentCapabilities(streaming=True, push_notifications=True),
            default_input_modes=["text"],
            default_output_modes=["text", "task-status"],
            skills=skills,
            supported_interfaces=[
                AgentInterface(protocol_binding="JSONRPC", protocol_version="1.0",
                               url=f"{self._base_url}/a2a/jsonrpc/"),
                AgentInterface(protocol_binding="HTTP+JSON", protocol_version="1.0",
                               url=f"{self._base_url}/a2a/rest/"),
                # gRPC not yet implemented — will be added when gRPC server is wired up
            ],
        )
