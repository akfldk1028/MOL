"""Debate Team — structured agent-to-agent argumentation.

Pattern: Two agents debate a topic for N rounds, then a judge summarizes.

Flow:
  1. Agent A presents opening argument
  2. Agent B responds with counter-argument
  3. Repeat for N rounds (default 2)
  4. Judge synthesizes the debate
"""

import logging
from typing import Any, Callable, Awaitable, Optional

from goodmolt_a2a.teams.orchestrator import TeamOrchestrator, TeamMember, TeamTask, TeamResult

logger = logging.getLogger(__name__)


class DebateTeam(TeamOrchestrator):
    """Structured debate between two agents with a judge."""

    async def debate(
        self,
        debater_a_name: str,
        debater_b_name: str,
        judge_name: str,
        topic: str,
        rounds: int = 2,
    ) -> TeamResult:
        """Run a structured debate between two agents.

        Args:
            debater_a_name: Agent proposing the argument
            debater_b_name: Agent opposing/countering
            judge_name: Agent summarizing the debate
            topic: Debate topic/question
            rounds: Number of back-and-forth rounds (default 2)
        """
        result = TeamResult(pattern="debate")
        context_id = await self._create_context(debater_a_name, debater_b_name, "debate")
        result.context_id = context_id

        debater_a = self._load_member(debater_a_name, "debater_pro")
        debater_b = self._load_member(debater_b_name, "debater_con")
        judge = self._load_member(judge_name, "judge")

        debate_history = []

        for round_num in range(rounds):
            # Agent A argues
            if round_num == 0:
                a_prompt = f"""You are debating the topic: "{topic}"

Present your opening argument in 2-3 sentences. Take a clear position and support it."""
            else:
                last_b = debate_history[-1]
                a_prompt = f"""The debate topic is: "{topic}"

Your opponent just said: "{last_b}"

Respond to their argument in 2-3 sentences. Counter their points and strengthen your position."""

            a_task = TeamTask(member=debater_a, instruction=f"Round {round_num + 1} argument")
            result.tasks.append(a_task)
            a_response = await self._execute_task(a_task, a_prompt)
            await self._record_message(context_id, debater_a_name, a_response)
            debate_history.append(a_response)

            # Agent B counters
            b_prompt = f"""The debate topic is: "{topic}"

Your opponent just said: "{a_response}"

Counter their argument in 2-3 sentences. Challenge their reasoning and present your perspective."""

            b_task = TeamTask(member=debater_b, instruction=f"Round {round_num + 1} counter")
            result.tasks.append(b_task)
            b_response = await self._execute_task(b_task, b_prompt)
            await self._record_message(context_id, debater_b_name, b_response)
            debate_history.append(b_response)

        # Judge summarizes
        debate_text = "\n\n".join([
            f"{'Pro' if i % 2 == 0 else 'Con'} (Round {i // 2 + 1}): {text}"
            for i, text in enumerate(debate_history)
        ])

        judge_prompt = f"""You just watched a debate on: "{topic}"

The debate:
{debate_text}

As the judge, summarize the key arguments from both sides and declare which side made the stronger case. 3-4 sentences."""

        judge_task = TeamTask(member=judge, instruction="Judge verdict")
        result.tasks.append(judge_task)
        verdict = await self._execute_task(judge_task, judge_prompt)
        await self._record_message(context_id, judge_name, verdict)

        result.final_output = verdict
        return result
