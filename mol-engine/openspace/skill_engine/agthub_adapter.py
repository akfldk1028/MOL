"""AGTHUB Adapter — bridges core.agent_registry → OpenSpace SkillRegistry.

@origin: new file for MOL integration

Maps AGTHUB agents (SOUL.md, RULES.md, agent.yaml) to OpenSpace SkillMeta format
so the SkillEvolver/ExecutionAnalyzer can work with MOL agent data.

In OpenSpace terms:
  SKILL.md → SOUL.md (persona) + RULES.md (behavior rules)
  skill directory → AGTHUB/agents/{name}/ directory
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class AgentSkillMeta:
    """An agent's persona/rules as a 'skill' for evolution purposes."""
    skill_id: str           # agent name
    name: str               # display name
    description: str        # first line of SOUL.md
    path: str               # AGTHUB/agents/{name}/
    soul_content: str       # SOUL.md full text
    rules_content: str      # RULES.md full text
    archetype: str
    topics: List[str]
    personality: Dict[str, float]


class AGTHUBSkillAdapter:
    """Adapter that presents AGTHUB agents as 'skills' for OpenSpace evolution.

    Uses core.agent_registry.AgentRegistry under the hood.
    """

    def __init__(self, agents_dir: str):
        self._agents_dir = Path(agents_dir)
        self._cache: Dict[str, AgentSkillMeta] = {}
        self._scan()

    def _scan(self) -> int:
        """Scan AGTHUB agents directory."""
        self._cache.clear()
        if not self._agents_dir.exists():
            logger.warning("AGTHUB agents dir not found: %s", self._agents_dir)
            return 0

        count = 0
        for agent_dir in sorted(self._agents_dir.iterdir()):
            if not agent_dir.is_dir():
                continue
            yaml_path = agent_dir / "agent.yaml"
            soul_path = agent_dir / "SOUL.md"
            if not yaml_path.exists():
                continue

            try:
                import yaml
                with open(yaml_path, "r", encoding="utf-8") as f:
                    config = yaml.safe_load(f) or {}
            except Exception:
                config = {}

            soul = ""
            if soul_path.exists():
                soul = soul_path.read_text(encoding="utf-8")

            rules = ""
            rules_path = agent_dir / "RULES.md"
            if rules_path.exists():
                rules = rules_path.read_text(encoding="utf-8")

            name = agent_dir.name
            self._cache[name] = AgentSkillMeta(
                skill_id=name,
                name=config.get("display_name", name),
                description=soul.split("\n")[0][:200] if soul else "",
                path=str(agent_dir),
                soul_content=soul,
                rules_content=rules,
                archetype=config.get("archetype", ""),
                topics=config.get("expertise_topics", []),
                personality=config.get("personality", {}),
            )
            count += 1

        logger.info("AGTHUBSkillAdapter: loaded %d agents", count)
        return count

    def get(self, agent_name: str) -> Optional[AgentSkillMeta]:
        return self._cache.get(agent_name)

    def list_all(self) -> List[AgentSkillMeta]:
        return list(self._cache.values())

    def list_names(self) -> List[str]:
        return list(self._cache.keys())

    def get_soul(self, agent_name: str) -> str:
        """Get SOUL.md content for an agent."""
        meta = self._cache.get(agent_name)
        return meta.soul_content if meta else ""

    def get_rules(self, agent_name: str) -> str:
        """Get RULES.md content for an agent."""
        meta = self._cache.get(agent_name)
        return meta.rules_content if meta else ""

    def write_soul(self, agent_name: str, content: str) -> bool:
        """Write updated SOUL.md content."""
        agent_dir = self._agents_dir / agent_name
        soul_path = agent_dir / "SOUL.md"
        if not agent_dir.exists():
            return False
        soul_path.write_text(content, encoding="utf-8")
        # Update cache
        if agent_name in self._cache:
            self._cache[agent_name].soul_content = content
        logger.info("Updated SOUL.md for '%s' (%d chars)", agent_name, len(content))
        return True

    def write_rules(self, agent_name: str, content: str) -> bool:
        """Write updated RULES.md content."""
        agent_dir = self._agents_dir / agent_name
        rules_path = agent_dir / "RULES.md"
        if not agent_dir.exists():
            return False
        rules_path.write_text(content, encoding="utf-8")
        if agent_name in self._cache:
            self._cache[agent_name].rules_content = content
        logger.info("Updated RULES.md for '%s' (%d chars)", agent_name, len(content))
        return True

    def reload(self, agent_name: Optional[str] = None):
        """Reload one or all agents."""
        if agent_name:
            # Single agent reload
            agent_dir = self._agents_dir / agent_name
            if agent_dir.exists():
                self._cache.pop(agent_name, None)
                self._scan()  # rescan all for simplicity
        else:
            self._scan()

    def __len__(self) -> int:
        return len(self._cache)

    def __contains__(self, name: str) -> bool:
        return name in self._cache


__all__ = ["AGTHUBSkillAdapter", "AgentSkillMeta"]
