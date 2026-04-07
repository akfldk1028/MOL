"""Webtoon Production Team — Producer-Reviewer pattern.

Based on Harness team-examples.md Example 3: Webtoon Production Team.
Pattern: Producer creates content, Reviewer inspects, loop until PASS (max 2 retries).

Flow:
  1. Artist (creator archetype) generates episode script/description
  2. Reviewer (critic archetype) evaluates: PASS / FIX / REDO
  3. If FIX/REDO: Artist revises based on feedback (max 2 rounds)
  4. Final output: approved episode content
"""

import logging
from typing import Any, Callable, Awaitable, Optional

from goodmolt_a2a.teams.orchestrator import TeamOrchestrator, TeamMember, TeamTask, TeamResult

logger = logging.getLogger(__name__)

MAX_REVIEW_ROUNDS = 2


class WebtoonTeam(TeamOrchestrator):
    """Producer-Reviewer team for webtoon episode creation."""

    async def produce_episode(
        self,
        artist_name: str,
        reviewer_name: str,
        series_title: str,
        episode_number: int,
        previous_summary: str = "",
        style_notes: str = "",
    ) -> TeamResult:
        """Create a webtoon episode through artist-reviewer collaboration.

        Args:
            artist_name: AGTHUB agent name for the artist (creator archetype)
            reviewer_name: AGTHUB agent name for the reviewer (critic archetype)
            series_title: Title of the webtoon series
            episode_number: Episode number being created
            previous_summary: Summary of previous episodes for continuity
            style_notes: Art style or narrative instructions
        """
        artist = self._load_member(artist_name, "artist")
        reviewer = self._load_member(reviewer_name, "reviewer")

        result = TeamResult(pattern="producer-reviewer")
        context_id = await self._create_context(artist_name, reviewer_name, "webtoon_production")
        result.context_id = context_id

        # Phase 1: Artist creates initial draft
        create_prompt = f"""Create Episode {episode_number} of "{series_title}".

{f'Previous episodes summary: {previous_summary}' if previous_summary else 'This is the first episode.'}
{f'Style notes: {style_notes}' if style_notes else ''}

Write a compelling episode with:
- TITLE: (episode title)
- SCENE 1-3: (describe each scene with visual descriptions and dialogue)
- CLIFFHANGER: (ending hook for next episode)

Write naturally as the series creator. 3-5 paragraphs total."""

        create_task = TeamTask(member=artist, instruction="Create initial episode draft")
        result.tasks.append(create_task)

        draft = await self._execute_task(create_task, create_prompt)
        await self._record_message(context_id, artist_name, draft)

        # Phase 2: Review loop (max MAX_REVIEW_ROUNDS)
        current_draft = draft
        for round_num in range(MAX_REVIEW_ROUNDS):
            # Reviewer evaluates
            review_prompt = f"""Review this webtoon episode draft for "{series_title}" Episode {episode_number}:

---
{current_draft}
---

Evaluate on: story flow, character consistency, visual description quality, dialogue naturalness, cliffhanger strength.

Respond with exactly one of:
- PASS: [brief praise] — if the episode is ready
- FIX: [specific issues to fix] — if minor revisions needed
- REDO: [fundamental problems] — if major rewrite needed

Be constructive but honest."""

            review_task = TeamTask(member=reviewer, instruction=f"Review round {round_num + 1}")
            result.tasks.append(review_task)

            review = await self._execute_task(review_task, review_prompt)
            await self._record_message(context_id, reviewer_name, review)

            # Check verdict
            review_upper = review.upper()
            if "PASS" in review_upper.split(":")[0][:10]:
                logger.info("Episode approved after %d review round(s)", round_num + 1)
                break

            if round_num >= MAX_REVIEW_ROUNDS - 1:
                logger.info("Max review rounds reached, accepting current draft")
                break

            # Artist revises
            revise_prompt = f"""Your reviewer gave this feedback on your Episode {episode_number} draft:

---
{review}
---

Revise the episode addressing the feedback. Keep what works, fix what doesn't.
Write the complete revised episode (same format: TITLE, SCENE 1-3, CLIFFHANGER)."""

            revise_task = TeamTask(member=artist, instruction=f"Revise based on round {round_num + 1} feedback")
            result.tasks.append(revise_task)

            current_draft = await self._execute_task(revise_task, revise_prompt)
            await self._record_message(context_id, artist_name, current_draft)

        result.final_output = current_draft
        return result
