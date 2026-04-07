"""AgentConfigEvolver — analyze traces to evolve AGTHUB agent configs.

@origin: openjarvis/src/openjarvis/learning/agents/agent_evolver.py
Adapted: TOML file system → AGTHUB agent.yaml + Supabase brain_config JSONB

Workflow:
  1. Read traces from TraceStore (or TraceStoreAdapter)
  2. Classify queries, score tool/agent performance
  3. Recommend config changes (model, temperature, topics)
  4. Write updated agent.yaml + archive previous version
  5. Optionally update brain_config in DB
"""

from __future__ import annotations

import logging
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

logger = logging.getLogger(__name__)


class AgentConfigEvolver:
    """Analyze traces to evolve AGTHUB agent configs with versioning.

    Parameters
    ----------
    agents_dir:
        Path to AGTHUB/agents/ directory.
    min_quality:
        Minimum average feedback score for a recommendation.
    """

    def __init__(
        self,
        agents_dir: str,
        *,
        min_quality: float = 0.5,
    ) -> None:
        self._agents_dir = Path(agents_dir)
        self._min_quality = min_quality

        if not self._agents_dir.exists():
            logger.warning("AGTHUB agents dir not found: %s", self._agents_dir)

    # ------------------------------------------------------------------
    # analyze — from traces
    # ------------------------------------------------------------------

    def analyze(self, traces: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Analyze traces and return recommendations per agent.

        Each trace dict should have: agent_name, action, outcome, feedback,
        input_text, output_text, interest_score.

        Returns list of dicts with:
        - agent_name, recommended_model, recommended_temperature,
          recommended_topics, sample_count, avg_feedback, success_rate
        """
        # Group by agent
        by_agent: Dict[str, List[Dict]] = defaultdict(list)
        for t in traces:
            name = t.get("agent_name", "")
            if name:
                by_agent[name].append(t)

        recommendations = []
        for agent_name, agent_traces in sorted(by_agent.items()):
            rec = self._analyze_agent(agent_name, agent_traces)
            if rec:
                recommendations.append(rec)

        return recommendations

    def _analyze_agent(
        self, agent_name: str, traces: List[Dict]
    ) -> Optional[Dict[str, Any]]:
        """Build recommendation for a single agent."""
        if not traces:
            return None

        # Compute metrics
        feedbacks = [t["feedback"] for t in traces if t.get("feedback") is not None]
        avg_feedback = sum(feedbacks) / len(feedbacks) if feedbacks else 0.0
        if avg_feedback < self._min_quality and len(feedbacks) > 5:
            # Below quality threshold — suggest changes
            pass

        outcomes = [t for t in traces if t.get("outcome")]
        successes = [t for t in outcomes if t["outcome"] == "success"]
        success_rate = len(successes) / len(outcomes) if outcomes else 0.0

        # Action distribution
        action_counts: Dict[str, int] = defaultdict(int)
        for t in traces:
            action_counts[t.get("action", "unknown")] += 1

        # Model recommendation based on trace complexity
        avg_input_len = sum(len(t.get("input_text", "")) for t in traces) / len(traces)
        if avg_input_len > 500:
            recommended_model = "qwen3.5-flash"
        elif avg_input_len > 200:
            recommended_model = "qwen-turbo"
        else:
            recommended_model = "qwen-turbo"

        # Temperature: lower for low success, higher for creative agents
        if success_rate < 0.5:
            recommended_temp = 0.3  # more deterministic
        elif success_rate > 0.8:
            recommended_temp = 0.8  # more creative
        else:
            recommended_temp = 0.5

        return {
            "agent_name": agent_name,
            "recommended_model": recommended_model,
            "recommended_temperature": recommended_temp,
            "sample_count": len(traces),
            "avg_feedback": round(avg_feedback, 3),
            "success_rate": round(success_rate, 3),
            "action_distribution": dict(action_counts),
        }

    # ------------------------------------------------------------------
    # write_config — update AGTHUB agent.yaml
    # ------------------------------------------------------------------

    def write_config(
        self,
        agent_name: str,
        *,
        updates: Dict[str, Any],
        reason: str = "trace analysis",
    ) -> Optional[Path]:
        """Update agent.yaml with new config, archiving previous version.

        Args:
            agent_name: Agent directory name in AGTHUB
            updates: Dict of fields to update (e.g. {"model.production": "qwen3.5-flash"})
            reason: Why this change was made

        Returns:
            Path to updated agent.yaml, or None if agent not found.
        """
        agent_dir = self._agents_dir / agent_name
        config_path = agent_dir / "agent.yaml"

        if not config_path.exists():
            logger.warning("agent.yaml not found for '%s'", agent_name)
            return None

        # Archive current version
        self._archive(agent_name, config_path)

        # Load, update, write
        with open(config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}

        # Apply nested updates (e.g. "model.production" → config["model"]["production"])
        for key, value in updates.items():
            parts = key.split(".")
            target = config
            for part in parts[:-1]:
                if part not in target or not isinstance(target[part], dict):
                    target[part] = {}
                target = target[part]
            target[parts[-1]] = value

        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(config, f, default_flow_style=False, allow_unicode=True)

        logger.info("Updated %s agent.yaml: %s (reason: %s)", agent_name, updates, reason)
        return config_path

    # ------------------------------------------------------------------
    # version management
    # ------------------------------------------------------------------

    def list_versions(self, agent_name: str) -> List[Dict[str, Any]]:
        """List all archived versions for an agent."""
        agent_dir = self._agents_dir / agent_name
        history_dir = agent_dir / ".config_history"

        versions = []
        if history_dir.exists():
            for f in sorted(history_dir.glob("agent.v*.yaml")):
                stem = f.stem  # agent.v3
                parts = stem.rsplit(".v", 1)
                ver_num = int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else 0
                versions.append({
                    "version": ver_num,
                    "path": str(f),
                    "modified": f.stat().st_mtime,
                })

        # Current
        current = agent_dir / "agent.yaml"
        if current.exists():
            versions.append({
                "version": len(versions) + 1,
                "path": str(current),
                "modified": current.stat().st_mtime,
                "current": True,
            })

        return versions

    def rollback(self, agent_name: str, version: int) -> bool:
        """Rollback agent.yaml to a specific version."""
        versions = self.list_versions(agent_name)
        target = next((v for v in versions if v["version"] == version), None)

        if not target:
            logger.error("Version %d not found for '%s'", version, agent_name)
            return False

        target_path = Path(target["path"])
        config_path = self._agents_dir / agent_name / "agent.yaml"

        if target_path == config_path:
            return True  # already current

        # Archive current before rollback
        self._archive(agent_name, config_path)
        shutil.copy2(str(target_path), str(config_path))
        logger.info("Rolled back %s to version %d", agent_name, version)
        return True

    # ------------------------------------------------------------------
    # brain_config DB update helper
    # ------------------------------------------------------------------

    def build_brain_config_update(
        self, recommendation: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Convert recommendation to brain_config JSONB update.

        Returns dict suitable for:
          UPDATE agents SET brain_config = brain_config || $1::jsonb WHERE name = $2
        """
        update = {}
        if "recommended_model" in recommendation:
            update["llm_model"] = recommendation["recommended_model"]
        if "recommended_temperature" in recommendation:
            update["temperature"] = recommendation["recommended_temperature"]
        return update

    # ------------------------------------------------------------------
    # internal
    # ------------------------------------------------------------------

    def _archive(self, agent_name: str, config_path: Path) -> Optional[Path]:
        """Copy current agent.yaml into .config_history/ with version suffix."""
        if not config_path.exists():
            return None

        history_dir = config_path.parent / ".config_history"
        history_dir.mkdir(exist_ok=True)

        existing = list(history_dir.glob("agent.v*.yaml"))
        version_nums = []
        for p in existing:
            parts = p.stem.rsplit(".v", 1)
            if len(parts) == 2 and parts[1].isdigit():
                version_nums.append(int(parts[1]))

        next_ver = max(version_nums, default=0) + 1
        dest = history_dir / f"agent.v{next_ver}.yaml"
        shutil.copy2(str(config_path), str(dest))
        logger.debug("Archived %s → %s", config_path, dest)
        return dest


__all__ = ["AgentConfigEvolver"]
