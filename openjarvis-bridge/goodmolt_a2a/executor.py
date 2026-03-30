"""GoodmoltAgentExecutor — executes A2A tasks using agent personas.

Loads agent profile from AGTHUB (via AgentRegistry), applies persona,
calls LLM, and publishes results via TaskUpdater.
"""

import logging
from typing import Any, Callable, Awaitable

from a2a.server.agent_execution.agent_executor import AgentExecutor
from a2a.server.agent_execution.context import RequestContext
from a2a.server.events.event_queue import EventQueue
from a2a.server.tasks.task_updater import TaskUpdater
from a2a.types.a2a_pb2 import Part

logger = logging.getLogger(__name__)


class GoodmoltAgentExecutor(AgentExecutor):
    """Executes A2A tasks by loading agent persona and calling LLM."""

    def __init__(
        self,
        agent_registry: Any,
        llm_generate: Callable[..., Awaitable[str]],
    ):
        self._registry = agent_registry
        self._llm_generate = llm_generate
        self._running_tasks: set[str] = set()

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        task_id = context.task_id
        context_id = context.context_id

        if not task_id or not context_id:
            return

        self._running_tasks.add(task_id)

        updater = TaskUpdater(
            event_queue=event_queue,
            task_id=task_id,
            context_id=context_id,
        )

        working_msg = updater.new_agent_message(parts=[Part(text="Thinking...")])
        await updater.start_work(message=working_msg)

        try:
            user_input = context.get_user_input() or ""

            agent_name = None
            if hasattr(context, "metadata") and context.metadata:
                agent_name = context.metadata.get("target_agent_name")

            system_prompt = "You are a helpful AI agent on Clickaround community."
            if agent_name:
                profile = self._registry.get(agent_name)
                if profile and profile.soul:
                    system_prompt = profile.soul

            if task_id not in self._running_tasks:
                return

            response_text = await self._llm_generate(system_prompt, user_input)

            if task_id not in self._running_tasks:
                return

            await updater.add_artifact(
                parts=[Part(text=response_text)],
                name="response",
                last_chunk=True,
            )
            await updater.complete()

            logger.info("Task %s completed for agent %s", task_id, agent_name)

        except Exception as e:
            logger.error("Task %s failed: %s", task_id, e)
            error_msg = updater.new_agent_message(parts=[Part(text=f"Error: {str(e)}")])
            await updater.failed(message=error_msg)
        finally:
            self._running_tasks.discard(task_id)

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        task_id = context.task_id
        if task_id and task_id in self._running_tasks:
            self._running_tasks.remove(task_id)

        updater = TaskUpdater(
            event_queue=event_queue,
            task_id=task_id or "",
            context_id=context.context_id or "",
        )
        await updater.cancel()
        logger.info("Task %s canceled", task_id)
