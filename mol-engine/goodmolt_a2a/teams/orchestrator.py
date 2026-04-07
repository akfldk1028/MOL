"""Team Orchestrator — coordinates multi-agent collaboration via A2A.

Based on Harness patterns (clone/harness/skills/harness/references/):
- orchestrator-template.md: phase-based workflow with data handoff
- agent-design-patterns.md: fan-out, producer-reviewer, supervisor

All team work is recorded as A2A messages in a shared context.
"""

import logging
from typing import Any, Callable, Awaitable, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class TeamMember:
    """An agent participating in a team."""
    name: str
    role: str  # e.g., "artist", "reviewer", "researcher"
    system_prompt: str = ""


@dataclass
class TeamTask:
    """A task assigned to a team member."""
    member: TeamMember
    instruction: str
    result: str = ""
    status: str = "pending"  # pending / working / completed / failed


@dataclass
class TeamResult:
    """Result of a team collaboration."""
    context_id: Optional[str] = None
    tasks: list[TeamTask] = field(default_factory=list)
    final_output: str = ""
    pattern: str = ""  # producer-reviewer, fan-out, debate


class TeamOrchestrator:
    """Orchestrates multi-agent teams using A2A communication.

    Workflow:
    1. Assemble team (select agents by role)
    2. Assign tasks per pattern
    3. Execute tasks (LLM calls with agent personas)
    4. Collect and integrate results
    5. Record all exchanges as A2A messages
    """

    def __init__(
        self,
        agent_registry: Any,
        llm_generate: Callable[..., Awaitable[str]],
        conversation_manager: Optional[Any] = None,
    ):
        self._registry = agent_registry
        self._llm_generate = llm_generate
        self._conversation_mgr = conversation_manager

    def _load_member(self, name: str, role: str) -> TeamMember:
        """Load an agent as a team member with their persona."""
        profile = self._registry.get(name)
        system_prompt = profile.soul if profile and profile.soul else f"You are {name}."
        return TeamMember(name=name, role=role, system_prompt=system_prompt)

    async def _execute_task(self, task: TeamTask, user_prompt: str) -> str:
        """Execute a single task for a team member."""
        task.status = "working"
        try:
            result = await self._llm_generate(task.member.system_prompt, user_prompt)
            task.result = result or ""
            task.status = "completed"
            return task.result
        except Exception as e:
            task.status = "failed"
            task.result = f"Error: {e}"
            logger.error("Team task failed for %s: %s", task.member.name, e)
            return task.result

    async def _record_message(self, context_id: str, agent_name: str, text: str, role: str = "agent"):
        """Record a message in the conversation if manager available."""
        if self._conversation_mgr and context_id:
            try:
                await self._conversation_mgr.add_message(
                    context_id=context_id,
                    agent_id=agent_name,
                    role=role,
                    text=text,
                )
            except Exception as e:
                logger.warning("Failed to record team message: %s", e)

    async def _create_context(self, initiator: str, target: str, skill_id: str = None) -> Optional[str]:
        """Create a conversation context for team work."""
        if self._conversation_mgr:
            try:
                ctx = await self._conversation_mgr.create_context(
                    initiator_agent_id=initiator,
                    target_agent_id=target,
                    skill_id=skill_id,
                )
                return ctx["id"]
            except Exception:
                pass
        return None
