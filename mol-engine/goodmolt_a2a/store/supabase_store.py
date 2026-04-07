"""Supabase PostgreSQL TaskStore for A2A protocol.

Uses raw asyncpg (no SQLAlchemy) to match existing Bridge patterns.
Stores A2A Tasks in the a2a_tasks table with JSONB for artifacts/history.
"""

import json
import logging
from typing import Any

from google.protobuf.json_format import MessageToDict, ParseDict

from a2a.server.context import ServerCallContext
from a2a.server.tasks.task_store import TaskStore
from a2a.types.a2a_pb2 import (
    ListTasksRequest,
    ListTasksResponse,
    Task,
    TaskState,
)

logger = logging.getLogger(__name__)

_STATE_TO_STR = {
    TaskState.TASK_STATE_SUBMITTED: "SUBMITTED",
    TaskState.TASK_STATE_WORKING: "WORKING",
    TaskState.TASK_STATE_COMPLETED: "COMPLETED",
    TaskState.TASK_STATE_FAILED: "FAILED",
    TaskState.TASK_STATE_CANCELED: "CANCELED",
    TaskState.TASK_STATE_INPUT_REQUIRED: "INPUT_REQUIRED",
    TaskState.TASK_STATE_AUTH_REQUIRED: "AUTH_REQUIRED",
    TaskState.TASK_STATE_REJECTED: "REJECTED",
}

_STR_TO_STATE = {v: k for k, v in _STATE_TO_STR.items()}


class SupabaseTaskStore(TaskStore):
    """asyncpg-based A2A TaskStore backed by Supabase PostgreSQL."""

    def __init__(self, pool):
        self._pool = pool

    async def save(self, task: Task, context: ServerCallContext | None = None) -> None:
        state_str = _STATE_TO_STR.get(task.status.state, "SUBMITTED")
        artifacts_json = json.dumps([MessageToDict(a) for a in task.artifacts])
        metadata_dict = dict(task.metadata) if task.metadata.fields else {}
        metadata_json = json.dumps(metadata_dict)
        owner = metadata_dict.get("owner_agent_id", "")
        executor = metadata_dict.get("executor_agent_id", "")

        await self._pool.fetchrow(
            """INSERT INTO a2a_tasks (id, context_id, owner_agent_id, executor_agent_id,
                                     state, artifacts, metadata, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW(), NOW())
               ON CONFLICT (id) DO UPDATE SET
                 state = EXCLUDED.state,
                 artifacts = EXCLUDED.artifacts,
                 metadata = EXCLUDED.metadata,
                 updated_at = NOW()
               RETURNING id""",
            task.id, task.context_id, owner, executor,
            state_str, artifacts_json, metadata_json,
        )
        logger.debug("Task %s saved (state=%s)", task.id, state_str)

    async def get(self, task_id: str, context: ServerCallContext | None = None) -> Task | None:
        row = await self._pool.fetchrow(
            "SELECT id, context_id, state, artifacts, metadata FROM a2a_tasks WHERE id = $1",
            task_id,
        )
        if not row:
            return None
        return self._row_to_task(row)

    async def list(self, params: ListTasksRequest, context: ServerCallContext | None = None) -> ListTasksResponse:
        conditions = []
        args = []
        idx = 1

        if params.context_id:
            conditions.append(f"context_id = ${idx}")
            args.append(params.context_id)
            idx += 1

        if params.status:
            state_str = _STATE_TO_STR.get(params.status, None)
            if state_str:
                conditions.append(f"state = ${idx}")
                args.append(state_str)
                idx += 1

        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        page_size = min(params.page_size or 20, 100)  # Cap at 100

        # Parameterize LIMIT to prevent SQL injection
        limit_param = f"${idx}"
        args.append(page_size + 1)

        rows = await self._pool.fetch(
            f"SELECT id, context_id, state, artifacts, metadata FROM a2a_tasks {where} ORDER BY created_at DESC LIMIT {limit_param}",
            *args,
        )

        tasks = [self._row_to_task(r) for r in rows[:page_size]]
        next_token = rows[-1]["id"] if len(rows) > page_size else None

        return ListTasksResponse(
            tasks=tasks,
            total_size=len(tasks),
            next_page_token=next_token,
            page_size=page_size,
        )

    async def delete(self, task_id: str, context: ServerCallContext | None = None) -> None:
        await self._pool.execute("DELETE FROM a2a_tasks WHERE id = $1", task_id)
        logger.info("Task %s deleted", task_id)

    def _row_to_task(self, row: dict) -> Task:
        task = Task(id=row["id"], context_id=row["context_id"])
        state_enum = _STR_TO_STATE.get(row["state"], TaskState.TASK_STATE_SUBMITTED)
        task.status.state = state_enum

        artifacts_data = row.get("artifacts")
        if artifacts_data:
            parsed = json.loads(artifacts_data) if isinstance(artifacts_data, str) else artifacts_data
            for art_dict in parsed:
                art = task.artifacts.add()
                ParseDict(art_dict, art)

        return task
