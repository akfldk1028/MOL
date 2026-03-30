"""Research Team — Fan-out/Fan-in pattern.

Based on Harness team-examples.md Example 1: Research Team.
Pattern: Multiple agents investigate in parallel, results synthesized.

Flow:
  1. Assign topic to N researchers (fan-out)
  2. Each researcher investigates from their domain perspective
  3. Synthesizer combines all findings (fan-in)
"""

import asyncio
import logging
from typing import Any, Callable, Awaitable, Optional

from goodmolt_a2a.teams.orchestrator import TeamOrchestrator, TeamMember, TeamTask, TeamResult

logger = logging.getLogger(__name__)


class ResearchTeam(TeamOrchestrator):
    """Fan-out/Fan-in research team."""

    async def research(
        self,
        researcher_names: list[str],
        synthesizer_name: str,
        topic: str,
        depth: str = "brief",  # brief / detailed
    ) -> TeamResult:
        """Fan-out research on a topic across multiple agents.

        Args:
            researcher_names: List of AGTHUB agent names to investigate
            synthesizer_name: Agent name to synthesize findings
            topic: Research topic
            depth: "brief" (2-3 sentences each) or "detailed" (paragraph each)
        """
        result = TeamResult(pattern="fan-out")
        context_id = await self._create_context(
            researcher_names[0], synthesizer_name, "research"
        )
        result.context_id = context_id

        depth_instruction = "2-3 sentences" if depth == "brief" else "a detailed paragraph"

        # Phase 1: Fan-out — all researchers investigate in parallel
        research_tasks = []
        for name in researcher_names:
            member = self._load_member(name, "researcher")
            prompt = f"""Research this topic from your unique perspective and expertise:

Topic: {topic}

Provide {depth_instruction} of analysis based on your knowledge and personality.
Focus on insights only you would notice given your background."""

            task = TeamTask(member=member, instruction=f"Research: {topic}")
            research_tasks.append((task, prompt))
            result.tasks.append(task)

        # Execute in parallel
        async def run_research(task_prompt_pair):
            task, prompt = task_prompt_pair
            await self._execute_task(task, prompt)
            await self._record_message(context_id, task.member.name, task.result)

        await asyncio.gather(*[run_research(tp) for tp in research_tasks])

        # Phase 2: Fan-in — synthesizer combines findings
        findings = "\n\n".join([
            f"**{t.member.name}** ({t.member.role}):\n{t.result}"
            for t in result.tasks if t.status == "completed"
        ])

        synth_member = self._load_member(synthesizer_name, "synthesizer")
        synth_prompt = f"""Multiple researchers investigated this topic: "{topic}"

Their findings:
{findings}

Synthesize these perspectives into a cohesive summary. Highlight agreements, disagreements, and key insights. 3-5 sentences."""

        synth_task = TeamTask(member=synth_member, instruction="Synthesize findings")
        result.tasks.append(synth_task)
        await self._execute_task(synth_task, synth_prompt)
        await self._record_message(context_id, synthesizer_name, synth_task.result)

        result.final_output = synth_task.result
        return result
