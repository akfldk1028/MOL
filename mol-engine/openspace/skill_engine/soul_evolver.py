"""SoulEvolver — evolve SOUL.md/RULES.md based on agent performance.

@origin: adapted from OpenSpace skill_engine/evolver.py concepts
         FIX/DERIVED/CAPTURED pattern applied to MOL agent personas

Three evolution types (from OpenSpace):
  FIX      — repair/improve existing SOUL.md or RULES.md in-place
  DERIVED  — create enhanced version from existing (backup + update)
  CAPTURED — capture new behavioral patterns from high-performing traces

Integration:
  Uses AGTHUBSkillAdapter for read/write
  Uses core/llm for LLM-driven evolution suggestions
  Archives versions via agent_evolver's .config_history/
"""

import logging
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .types import EvolutionType, SkillOrigin
from .agthub_adapter import AGTHUBSkillAdapter

logger = logging.getLogger(__name__)


class SoulEvolution:
    """Record of a single SOUL.md/RULES.md evolution."""
    def __init__(
        self,
        agent_name: str,
        evolution_type: EvolutionType,
        target: str,  # "soul" or "rules"
        old_content: str,
        new_content: str,
        reason: str,
        metrics: Optional[Dict[str, Any]] = None,
    ):
        self.agent_name = agent_name
        self.evolution_type = evolution_type
        self.target = target
        self.old_content = old_content
        self.new_content = new_content
        self.reason = reason
        self.metrics = metrics or {}
        self.created_at = datetime.utcnow().isoformat()


class SoulEvolver:
    """Evolve SOUL.md/RULES.md based on agent performance data.

    Parameters
    ----------
    adapter:
        AGTHUBSkillAdapter for reading/writing agent files.
    llm_generate:
        Async function for LLM calls: (system_prompt, user_prompt) -> str
    """

    def __init__(
        self,
        adapter: AGTHUBSkillAdapter,
        llm_generate=None,
    ):
        self._adapter = adapter
        self._llm = llm_generate
        self._history: List[SoulEvolution] = []

    async def fix_soul(
        self,
        agent_name: str,
        issue: str,
        traces: Optional[List[Dict]] = None,
    ) -> Optional[SoulEvolution]:
        """FIX — repair/improve SOUL.md based on identified issue.

        Example issues:
        - "Agent responses are too formal, should be more casual"
        - "Agent ignores its expertise topics"
        - "Tone doesn't match archetype"
        """
        meta = self._adapter.get(agent_name)
        if not meta:
            logger.warning("Agent '%s' not found", agent_name)
            return None

        old_soul = meta.soul_content
        if not old_soul:
            logger.warning("Agent '%s' has no SOUL.md", agent_name)
            return None

        # Archive before modification
        self._archive_file(agent_name, "SOUL.md")

        if self._llm:
            system = (
                "You are an expert at evolving AI agent personas. "
                "Given an agent's current SOUL.md and an issue report, "
                "produce an improved version that fixes the issue while "
                "preserving the agent's core identity (Four Pillars, archetype). "
                "Output ONLY the new SOUL.md content, no explanation."
            )
            trace_context = ""
            if traces:
                samples = traces[:3]
                trace_context = "\n\nRecent trace samples:\n" + "\n".join(
                    f"- Action: {t.get('action')}, Feedback: {t.get('feedback')}, "
                    f"Output: {t.get('output_text', '')[:100]}"
                    for t in samples
                )

            user = (
                f"Agent: {agent_name} (archetype: {meta.archetype})\n\n"
                f"Current SOUL.md:\n{old_soul}\n\n"
                f"Issue to fix: {issue}{trace_context}\n\n"
                f"Write the improved SOUL.md:"
            )
            new_soul = await self._llm(system, user)
        else:
            # No LLM — append issue as a directive
            new_soul = old_soul + f"\n\n=== EVOLUTION NOTE ({datetime.utcnow().date()}) ===\nFIX: {issue}\n"

        self._adapter.write_soul(agent_name, new_soul)

        evolution = SoulEvolution(
            agent_name=agent_name,
            evolution_type=EvolutionType.FIX,
            target="soul",
            old_content=old_soul,
            new_content=new_soul,
            reason=issue,
        )
        self._history.append(evolution)
        return evolution

    async def fix_rules(
        self,
        agent_name: str,
        issue: str,
    ) -> Optional[SoulEvolution]:
        """FIX — repair/improve RULES.md."""
        meta = self._adapter.get(agent_name)
        if not meta:
            return None

        old_rules = meta.rules_content
        self._archive_file(agent_name, "RULES.md")

        if self._llm:
            system = (
                "You are an expert at evolving AI agent behavior rules. "
                "Given current RULES.md and an issue, produce improved rules. "
                "Output ONLY the new RULES.md content."
            )
            user = (
                f"Agent: {agent_name} (archetype: {meta.archetype})\n\n"
                f"Current RULES.md:\n{old_rules}\n\n"
                f"Issue: {issue}\n\nWrite improved RULES.md:"
            )
            new_rules = await self._llm(system, user)
        else:
            new_rules = old_rules + f"\n\n## Evolution Fix ({datetime.utcnow().date()})\n- {issue}\n"

        self._adapter.write_rules(agent_name, new_rules)

        evolution = SoulEvolution(
            agent_name=agent_name,
            evolution_type=EvolutionType.FIX,
            target="rules",
            old_content=old_rules,
            new_content=new_rules,
            reason=issue,
        )
        self._history.append(evolution)
        return evolution

    async def capture_pattern(
        self,
        agent_name: str,
        pattern: str,
        traces: List[Dict],
    ) -> Optional[SoulEvolution]:
        """CAPTURED — add successful behavioral pattern to RULES.md.

        When an agent consistently performs well with certain behaviors,
        capture that pattern as an explicit rule.
        """
        meta = self._adapter.get(agent_name)
        if not meta:
            return None

        old_rules = meta.rules_content
        self._archive_file(agent_name, "RULES.md")

        # Append captured pattern
        new_rules = old_rules + (
            f"\n\n## Captured Pattern ({datetime.utcnow().date()})\n"
            f"_Learned from {len(traces)} successful interactions_\n"
            f"- {pattern}\n"
        )

        self._adapter.write_rules(agent_name, new_rules)

        evolution = SoulEvolution(
            agent_name=agent_name,
            evolution_type=EvolutionType.CAPTURED,
            target="rules",
            old_content=old_rules,
            new_content=new_rules,
            reason=f"Captured pattern: {pattern}",
            metrics={"trace_count": len(traces)},
        )
        self._history.append(evolution)
        return evolution

    def get_history(self, agent_name: Optional[str] = None) -> List[SoulEvolution]:
        """Get evolution history, optionally filtered by agent."""
        if agent_name:
            return [e for e in self._history if e.agent_name == agent_name]
        return list(self._history)

    def _archive_file(self, agent_name: str, filename: str):
        """Archive a file before modification."""
        agent_dir = Path(self._adapter.agents_dir) / agent_name
        source = agent_dir / filename
        if not source.exists():
            return

        history_dir = agent_dir / ".config_history"
        history_dir.mkdir(exist_ok=True)

        existing = list(history_dir.glob(f"{filename}.v*"))
        version_nums = []
        for p in existing:
            parts = p.name.rsplit(".v", 1)
            if len(parts) == 2 and parts[1].isdigit():
                version_nums.append(int(parts[1]))

        next_ver = max(version_nums, default=0) + 1
        dest = history_dir / f"{filename}.v{next_ver}"
        shutil.copy2(str(source), str(dest))
        logger.debug("Archived %s → %s", source, dest)


__all__ = ["SoulEvolver", "SoulEvolution"]
