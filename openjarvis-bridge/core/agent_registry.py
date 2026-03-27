"""AgentRegistry — loads agent definitions from AGTHUB folder structure.

Scans AGTHUB/agents/{name}/ directories and provides:
- agent.yaml → AgentProfile (settings, personality, topics)
- SOUL.md → persona text (LLM system prompt)
- knowledge/saju.yaml → saju data (LLM context)
- knowledge/fortune.yaml → fortune data
- memory/interests.yaml → learned interests

Thread-safe singleton. Hot-reloads on demand.
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from core.config import AGTHUB_AGENTS_DIR

logger = logging.getLogger(__name__)


class AgentProfile:
    """Parsed agent definition from AGTHUB files."""

    def __init__(self, name: str, directory: Path):
        self.name = name
        self.directory = directory
        self._config: Optional[Dict] = None
        self._soul: Optional[str] = None
        self._rules: Optional[str] = None
        self._saju: Optional[Dict] = None
        self._fortune: Optional[Dict] = None
        self._interests: Optional[Dict] = None

    @property
    def config(self) -> Dict[str, Any]:
        if self._config is None:
            self._config = self._load_yaml("agent.yaml") or {}
        return self._config

    @property
    def soul(self) -> str:
        if self._soul is None:
            path = self.directory / "SOUL.md"
            self._soul = path.read_text(encoding="utf-8") if path.exists() else ""
        return self._soul

    @property
    def rules(self) -> str:
        if self._rules is None:
            path = self.directory / "RULES.md"
            self._rules = path.read_text(encoding="utf-8") if path.exists() else ""
        return self._rules

    @property
    def saju(self) -> Dict[str, Any]:
        if self._saju is None:
            self._saju = self._load_yaml("knowledge/saju.yaml") or {}
        return self._saju

    @property
    def fortune(self) -> Dict[str, Any]:
        if self._fortune is None:
            self._fortune = self._load_yaml("knowledge/fortune.yaml") or {}
        return self._fortune

    @property
    def interests(self) -> Dict[str, Any]:
        if self._interests is None:
            self._interests = self._load_yaml("memory/interests.yaml") or {}
        return self._interests

    # Convenience accessors
    @property
    def display_name(self) -> str:
        return self.config.get("display_name", self.name)

    @property
    def persona(self) -> str:
        """Full persona text for LLM system prompt (SOUL.md content)."""
        return self.soul

    @property
    def archetype(self) -> str:
        return self.config.get("archetype", "creator")

    @property
    def expertise_topics(self) -> List[str]:
        return self.config.get("expertise_topics", [])

    @property
    def personality(self) -> Dict[str, float]:
        return self.config.get("personality", {})

    @property
    def agent_id(self) -> str:
        return self.config.get("id", "")

    def _load_yaml(self, rel_path: str) -> Optional[Dict]:
        path = self.directory / rel_path
        if not path.exists():
            return None
        try:
            return yaml.safe_load(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Failed to load %s: %s", path, exc)
            return None

    def to_dict(self) -> Dict[str, Any]:
        """Full profile as dict (for API responses)."""
        return {
            "name": self.name,
            "display_name": self.display_name,
            "archetype": self.archetype,
            "expertise_topics": self.expertise_topics,
            "personality": self.personality,
            "persona": self.soul[:500],
            "saju": {
                "gyeokguk": self.saju.get("gyeokguk", {}),
                "yongsin": self.saju.get("yongsin", {}),
                "oheng": self.saju.get("oheng", {}),
            } if self.saju else None,
            "has_fortune": bool(self.fortune),
            "has_lora": (self.directory / "learning" / "adapter_model.safetensors").exists(),
        }

    def reload(self):
        """Clear cached data (for hot-reload)."""
        self._config = None
        self._soul = None
        self._rules = None
        self._saju = None
        self._fortune = None
        self._interests = None


class AgentRegistry:
    """Scans AGTHUB/agents/ and provides agent profiles."""

    def __init__(self, agents_dir: Optional[str] = None):
        self._dir = Path(agents_dir or AGTHUB_AGENTS_DIR)
        self._agents: Dict[str, AgentProfile] = {}
        self.load_all()

    def load_all(self) -> int:
        """Scan agents directory and load all profiles."""
        self._agents.clear()
        if not self._dir.exists():
            logger.warning("AGTHUB agents dir not found: %s", self._dir)
            return 0

        for agent_dir in sorted(self._dir.iterdir()):
            if agent_dir.is_dir() and (agent_dir / "agent.yaml").exists():
                name = agent_dir.name
                self._agents[name] = AgentProfile(name, agent_dir)

        logger.info("AgentRegistry: loaded %d agents from %s", len(self._agents), self._dir)
        return len(self._agents)

    def get(self, name: str) -> Optional[AgentProfile]:
        return self._agents.get(name)

    def list_all(self) -> List[AgentProfile]:
        return list(self._agents.values())

    def list_names(self) -> List[str]:
        return list(self._agents.keys())

    def reload(self, name: Optional[str] = None):
        """Reload one or all agents."""
        if name:
            agent = self._agents.get(name)
            if agent:
                agent.reload()
        else:
            self.load_all()

    def __len__(self) -> int:
        return len(self._agents)

    def __contains__(self, name: str) -> bool:
        return name in self._agents
