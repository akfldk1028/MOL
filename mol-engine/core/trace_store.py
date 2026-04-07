"""SQLite-backed trace store for Goodmolt agent actions.

Traces record every agent decision: interest checks, comments, posts, skips.
This data feeds into OpenJarvis LearningOrchestrator for RL training.
"""

import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.config import TRACE_DB_PATH

_SCHEMA = """\
CREATE TABLE IF NOT EXISTS traces (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id        TEXT NOT NULL UNIQUE,
    agent_id        TEXT NOT NULL,
    agent_name      TEXT NOT NULL DEFAULT '',
    action          TEXT NOT NULL,
    target_id       TEXT,
    target_type     TEXT DEFAULT 'post',
    input_text      TEXT NOT NULL DEFAULT '',
    output_text     TEXT NOT NULL DEFAULT '',
    interest_score  REAL,
    interest_source TEXT DEFAULT 'ollama',
    feedback        REAL,
    outcome         TEXT,
    metadata_json   TEXT NOT NULL DEFAULT '{}',
    created_at      REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_traces_agent ON traces(agent_id);
CREATE INDEX IF NOT EXISTS idx_traces_action ON traces(action);
CREATE INDEX IF NOT EXISTS idx_traces_created ON traces(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traces_feedback ON traces(feedback) WHERE feedback IS NOT NULL;
"""


class TraceStore:
    """Persistent trace storage with SQLite WAL mode."""

    def __init__(self, db_path: Optional[str] = None) -> None:
        self._db_path = Path(db_path or TRACE_DB_PATH)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    # ── Write ──────────────────────────────────────────────────

    def record(self, data: Dict[str, Any]) -> str:
        """Record an agent action trace. Returns trace_id."""
        trace_id = data.get("trace_id") or uuid.uuid4().hex[:16]
        self._conn.execute(
            """INSERT INTO traces
               (trace_id, agent_id, agent_name, action, target_id, target_type,
                input_text, output_text, interest_score, interest_source,
                feedback, outcome, metadata_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                trace_id,
                data["agent_id"],
                data.get("agent_name", ""),
                data["action"],
                data.get("target_id"),
                data.get("target_type", "post"),
                data.get("input", ""),
                data.get("output", ""),
                data.get("interest_score"),
                data.get("interest_source", "ollama"),
                data.get("feedback"),
                data.get("outcome"),
                data.get("metadata", "{}"),
                time.time(),
            ),
        )
        self._conn.commit()
        return trace_id

    def update_feedback(self, trace_id: str, feedback: float, outcome: str = "success") -> bool:
        """Update feedback score (from votes/engagement)."""
        cur = self._conn.execute(
            "UPDATE traces SET feedback = ?, outcome = ? WHERE trace_id = ?",
            (feedback, outcome, trace_id),
        )
        self._conn.commit()
        return cur.rowcount > 0

    def batch_update_feedback(self, updates: List[Dict[str, Any]]) -> int:
        """Batch update feedback for multiple traces."""
        count = 0
        for u in updates:
            cur = self._conn.execute(
                "UPDATE traces SET feedback = ?, outcome = ? WHERE trace_id = ?",
                (u["feedback"], u.get("outcome", "success"), u["trace_id"]),
            )
            count += cur.rowcount
        self._conn.commit()
        return count

    # ── Read ───────────────────────────────────────────────────

    def get(self, trace_id: str) -> Optional[Dict[str, Any]]:
        row = self._conn.execute("SELECT * FROM traces WHERE trace_id = ?", (trace_id,)).fetchone()
        return dict(row) if row else None

    def list_traces(
        self,
        *,
        agent_id: Optional[str] = None,
        action: Optional[str] = None,
        has_feedback: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM traces WHERE 1=1"
        params: list = []
        if agent_id:
            query += " AND agent_id = ?"
            params.append(agent_id)
        if action:
            query += " AND action = ?"
            params.append(action)
        if has_feedback is True:
            query += " AND feedback IS NOT NULL"
        elif has_feedback is False:
            query += " AND feedback IS NULL"
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        return [dict(r) for r in self._conn.execute(query, params).fetchall()]

    # ── Analytics ──────────────────────────────────────────────

    def agent_stats(self, agent_id: str) -> Dict[str, Any]:
        row = self._conn.execute(
            """SELECT
                 count(*) as total_actions,
                 count(CASE WHEN action = 'react_to_post' THEN 1 END) as comments,
                 count(CASE WHEN action = 'rss_post' THEN 1 END) as rss_posts,
                 count(CASE WHEN action = 'skip' THEN 1 END) as skips,
                 avg(interest_score) as avg_interest,
                 avg(CASE WHEN feedback IS NOT NULL THEN feedback END) as avg_feedback,
                 count(CASE WHEN feedback IS NOT NULL THEN 1 END) as feedback_count
               FROM traces WHERE agent_id = ?""",
            (agent_id,),
        ).fetchone()
        return dict(row) if row else {}

    def global_stats(self) -> Dict[str, Any]:
        row = self._conn.execute(
            """SELECT
                 count(*) as total_traces,
                 count(DISTINCT agent_id) as active_agents,
                 count(CASE WHEN interest_source = 'ollama' THEN 1 END) as ollama_decisions,
                 count(CASE WHEN interest_source = 'fallback' THEN 1 END) as fallback_decisions,
                 avg(interest_score) as avg_interest,
                 avg(feedback) as avg_feedback
               FROM traces"""
        ).fetchone()
        return dict(row) if row else {}

    def top_topics(self, agent_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get most engaged topics for an agent (by input text keywords)."""
        rows = self._conn.execute(
            """SELECT input_text, interest_score, feedback, action, created_at
               FROM traces WHERE agent_id = ? AND action != 'skip'
               ORDER BY COALESCE(feedback, interest_score, 0) DESC
               LIMIT ?""",
            (agent_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]

    # ── Training data extraction (for OpenJarvis LearningOrchestrator) ──

    def extract_sft_pairs(self, *, agent_id: Optional[str] = None, min_feedback: float = 0.7) -> List[Dict[str, Any]]:
        """Extract high-quality (input, output) pairs for supervised fine-tuning."""
        query = """SELECT agent_id, agent_name, input_text, output_text, feedback, interest_score
                   FROM traces
                   WHERE feedback >= ? AND output_text != '' AND action != 'skip'"""
        params: list = [min_feedback]
        if agent_id:
            query += " AND agent_id = ?"
            params.append(agent_id)
        query += " ORDER BY feedback DESC LIMIT 1000"
        return [dict(r) for r in self._conn.execute(query, params).fetchall()]

    # ── Lifecycle ──────────────────────────────────────────────

    def close(self) -> None:
        self._conn.close()
