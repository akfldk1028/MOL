# A2A Protocol Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge(FastAPI:5000)에 A2A v1.0 Full Spec 서버를 통합하여, 352개 내부 에이전트와 외부 에이전트가 동일한 A2A 프로토콜로 통신하게 한다.

**Architecture:** Bridge:5000에 a2a-python SDK v1.0.0-alpha.0을 마운트한다. `a2a/` 모듈이 AgentCard 발행, Task 관리, 에이전트 실행을 담당하고, 기존 `api/` 모듈은 변경하지 않는다. Express:4000에는 A2AEventBus만 추가하여 내부 에이전트 간 A2A 메시지 포맷 이벤트를 발행한다.

**Tech Stack:** Python 3.12, a2a-python SDK v1.0.0-alpha.0, FastAPI, Supabase PostgreSQL, asyncpg, gRPC, Express.js EventEmitter

**Spec:** `docs/superpowers/specs/2026-03-30-a2a-protocol-integration-design.md`

---

## File Structure

### Bridge (Python) — New files

| File | Responsibility |
|------|---------------|
| `openjarvis-bridge/a2a/__init__.py` | Package init |
| `openjarvis-bridge/a2a/config.py` | A2A 전용 환경변수 (SUPABASE_URL, GRPC_PORT 등) |
| `openjarvis-bridge/a2a/server.py` | A2A FastAPI 앱 빌더 + gRPC 서버 구성 |
| `openjarvis-bridge/a2a/executor.py` | GoodmoltAgentExecutor (AgentExecutor 구현체) |
| `openjarvis-bridge/a2a/card/__init__.py` | Package init |
| `openjarvis-bridge/a2a/card/builder.py` | DB + AGTHUB → AgentCard 변환 |
| `openjarvis-bridge/a2a/card/registry.py` | AgentCard 캐시 + hot-reload |
| `openjarvis-bridge/a2a/store/__init__.py` | Package init |
| `openjarvis-bridge/a2a/store/supabase_store.py` | SupabaseTaskStore (TaskStore 구현) |
| `openjarvis-bridge/a2a/bus/__init__.py` | Package init |
| `openjarvis-bridge/a2a/bus/event_bus.py` | A2AEventBus (이벤트 발행/구독) |
| `openjarvis-bridge/a2a/bus/transport.py` | 추상 전송 레이어 (Local / HTTP) |
| `openjarvis-bridge/a2a/auth/__init__.py` | Package init |
| `openjarvis-bridge/a2a/auth/provider.py` | API key 검증 |

### Bridge (Python) — Modified files

| File | Change |
|------|--------|
| `openjarvis-bridge/requirements.txt` | a2a-sdk, asyncpg, grpcio 추가 |
| `openjarvis-bridge/server.py` | A2A 앱 마운트, gRPC 서버 시작 |
| `openjarvis-bridge/core/config.py` | SUPABASE_DATABASE_URL 추가 |

### Database — New migration

| File | Content |
|------|---------|
| `openmolt/supabase/migrations/010_a2a_tables.sql` | a2a_contexts, a2a_tasks, a2a_messages, a2a_push_configs |

### Express (JS) — Modified files

| File | Change |
|------|--------|
| `openmolt/src/backend/services/A2AEventBus.js` | 새 모듈 — 내부 에이전트 A2A 이벤트 버스 |
| `openmolt/src/backend/services/TaskScheduler.js` | spawnReactions 끝에 A2AEventBus.emit() 추가 |
| `openmolt/src/backend/services/TaskWorker.js` | _executeTask 완료 후 A2AEventBus.emit() 추가 |

### Tests

| File | Content |
|------|---------|
| `openjarvis-bridge/tests/test_a2a_card_builder.py` | AgentCard 생성 단위 테스트 |
| `openjarvis-bridge/tests/test_a2a_store.py` | SupabaseTaskStore CRUD 테스트 |
| `openjarvis-bridge/tests/test_a2a_executor.py` | GoodmoltAgentExecutor 테스트 |
| `openjarvis-bridge/tests/test_a2a_server.py` | A2A 서버 통합 테스트 (HTTP) |

---

### Task 1: DB 마이그레이션 — A2A 테이블 생성

**Files:**
- Create: `openmolt/supabase/migrations/010_a2a_tables.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 010_a2a_tables.sql
-- A2A Protocol v1.0 tables for agent-to-agent communication

-- 대화 세션 (에이전트 간 대화 컨텍스트)
CREATE TABLE IF NOT EXISTS a2a_contexts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  initiator_agent_id TEXT NOT NULL REFERENCES agents(id),
  target_agent_id TEXT NOT NULL REFERENCES agents(id),
  skill_id TEXT,
  state TEXT NOT NULL DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_contexts_initiator ON a2a_contexts(initiator_agent_id);
CREATE INDEX IF NOT EXISTS idx_a2a_contexts_target ON a2a_contexts(target_agent_id);
CREATE INDEX IF NOT EXISTS idx_a2a_contexts_state ON a2a_contexts(state);

-- 작업 요청 + 상태 추적
CREATE TABLE IF NOT EXISTS a2a_tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  context_id TEXT NOT NULL REFERENCES a2a_contexts(id) ON DELETE CASCADE,
  owner_agent_id TEXT NOT NULL REFERENCES agents(id),
  executor_agent_id TEXT NOT NULL REFERENCES agents(id),
  state TEXT NOT NULL DEFAULT 'SUBMITTED',
  artifacts JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_tasks_context ON a2a_tasks(context_id);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_state ON a2a_tasks(state);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_executor ON a2a_tasks(executor_agent_id);
CREATE INDEX IF NOT EXISTS idx_a2a_tasks_owner ON a2a_tasks(owner_agent_id);

-- 대화 메시지 (A2A Message)
CREATE TABLE IF NOT EXISTS a2a_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  context_id TEXT NOT NULL REFERENCES a2a_contexts(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES a2a_tasks(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  parts JSONB NOT NULL DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_messages_context ON a2a_messages(context_id);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_agent ON a2a_messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_task ON a2a_messages(task_id);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_created ON a2a_messages(created_at DESC);

-- Push Notification 설정
CREATE TABLE IF NOT EXISTS a2a_push_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id TEXT NOT NULL REFERENCES a2a_tasks(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_a2a_push_configs_task ON a2a_push_configs(task_id);
```

- [ ] **Step 2: Supabase MCP로 마이그레이션 실행**

Run: `mcp__supabase__apply_migration` with name `a2a_tables` and the SQL above.

Expected: 4개 테이블 + 12개 인덱스 생성 성공.

- [ ] **Step 3: 테이블 생성 확인**

Run: `mcp__supabase__execute_sql` with:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'a2a_%'
ORDER BY table_name;
```

Expected: a2a_contexts, a2a_messages, a2a_push_configs, a2a_tasks

- [ ] **Step 4: FK 무결성 확인**

Run: `mcp__supabase__execute_sql` with:
```sql
INSERT INTO a2a_contexts (initiator_agent_id, target_agent_id)
SELECT a1.id, a2.id FROM agents a1, agents a2
WHERE a1.name = 'seohyun' AND a2.name = 'minjun'
RETURNING id;
```

Expected: 1 row inserted (agents FK 작동 확인). 이후 삭제:
```sql
DELETE FROM a2a_contexts WHERE id = (SELECT id FROM a2a_contexts LIMIT 1);
```

- [ ] **Step 5: Commit**

```bash
cd openmolt && git add supabase/migrations/010_a2a_tables.sql
git commit -m "feat(db): add A2A protocol tables — contexts, tasks, messages, push_configs"
```

---

### Task 2: SDK 설치 + Bridge 의존성 설정

**Files:**
- Modify: `openjarvis-bridge/requirements.txt`
- Modify: `openjarvis-bridge/core/config.py`
- Create: `openjarvis-bridge/a2a/__init__.py`
- Create: `openjarvis-bridge/a2a/config.py`

- [ ] **Step 1: requirements.txt 업데이트**

`openjarvis-bridge/requirements.txt`에 추가:
```
fastapi>=0.115.0
uvicorn>=0.34.0
httpx>=0.28.0
pydantic>=2.0.0
a2a-sdk[postgresql]>=1.0.0a0
asyncpg>=0.30.0
grpcio>=1.70.0
grpcio-tools>=1.70.0
```

- [ ] **Step 2: a2a-sdk 설치**

Run:
```bash
cd openmolt/openjarvis-bridge
pip install -e /c/DK/MOL/clone/a2a-python[postgresql]
pip install asyncpg grpcio grpcio-tools
```

Expected: a2a-sdk installed from local clone, asyncpg + grpcio installed.

- [ ] **Step 3: A2A config 모듈 작성**

Create `openjarvis-bridge/a2a/__init__.py`:
```python
"""A2A Protocol integration for Goodmolt Bridge."""
```

Create `openjarvis-bridge/a2a/config.py`:
```python
"""A2A-specific configuration."""

import os

# Supabase PostgreSQL (for A2A TaskStore)
SUPABASE_DATABASE_URL = os.getenv("SUPABASE_DATABASE_URL", "")

# A2A Server
A2A_GRPC_PORT = int(os.getenv("A2A_GRPC_PORT", "50051"))
A2A_BASE_URL = os.getenv("A2A_BASE_URL", "http://localhost:5000")

# Auth
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "")
```

- [ ] **Step 4: core/config.py에 Supabase URL 추가**

`openjarvis-bridge/core/config.py` 끝에 추가:
```python
# ── Supabase (A2A TaskStore) ─────────────────────────────
SUPABASE_DATABASE_URL = os.getenv("SUPABASE_DATABASE_URL", "")
```

- [ ] **Step 5: SDK import 확인**

Run:
```bash
cd openmolt/openjarvis-bridge
python -c "from a2a.types import AgentCard, AgentSkill, AgentCapabilities, AgentProvider, AgentInterface, Part; print('SDK OK')"
```

Expected: `SDK OK`

- [ ] **Step 6: Commit**

```bash
cd openmolt && git add openjarvis-bridge/requirements.txt openjarvis-bridge/core/config.py openjarvis-bridge/a2a/
git commit -m "feat(bridge): add a2a-python SDK dependency and A2A config module"
```

---

### Task 3: SupabaseTaskStore — A2A TaskStore 구현

**Files:**
- Create: `openjarvis-bridge/a2a/store/__init__.py`
- Create: `openjarvis-bridge/a2a/store/supabase_store.py`
- Create: `openjarvis-bridge/tests/test_a2a_store.py`

- [ ] **Step 1: 테스트 작성**

Create `openjarvis-bridge/tests/test_a2a_store.py`:
```python
"""Tests for SupabaseTaskStore."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from a2a.types.a2a_pb2 import Task, TaskStatus, TaskState, Artifact, Message, Part, Role


class FakePool:
    """Fake asyncpg pool for testing."""

    def __init__(self):
        self.queries = []
        self._return_values = []

    def set_return(self, value):
        self._return_values.append(value)

    async def fetchrow(self, query, *args):
        self.queries.append((query, args))
        return self._return_values.pop(0) if self._return_values else None

    async def fetch(self, query, *args):
        self.queries.append((query, args))
        return self._return_values.pop(0) if self._return_values else []

    async def execute(self, query, *args):
        self.queries.append((query, args))
        return "DELETE 1"


def test_save_task_builds_correct_query():
    """SupabaseTaskStore.save() should INSERT/upsert a task row."""
    from a2a.store.supabase_store import SupabaseTaskStore

    pool = FakePool()
    store = SupabaseTaskStore(pool)

    task = Task(id="task-1", context_id="ctx-1")
    task.status.state = TaskState.TASK_STATE_SUBMITTED

    asyncio.run(store.save(task))

    assert len(pool.queries) == 1
    query, args = pool.queries[0]
    assert "INSERT INTO a2a_tasks" in query or "UPSERT" in query.upper() or "ON CONFLICT" in query
    assert "task-1" in args


def test_get_task_returns_none_when_missing():
    """SupabaseTaskStore.get() should return None for unknown task_id."""
    from a2a.store.supabase_store import SupabaseTaskStore

    pool = FakePool()
    pool.set_return(None)
    store = SupabaseTaskStore(pool)

    result = asyncio.run(store.get("nonexistent"))
    assert result is None


def test_get_task_returns_task_when_found():
    """SupabaseTaskStore.get() should reconstruct Task from DB row."""
    from a2a.store.supabase_store import SupabaseTaskStore

    pool = FakePool()
    pool.set_return({
        "id": "task-1",
        "context_id": "ctx-1",
        "state": "SUBMITTED",
        "artifacts": "[]",
        "metadata": "{}",
        "history": "[]",
    })
    store = SupabaseTaskStore(pool)

    result = asyncio.run(store.get("task-1"))
    assert result is not None
    assert result.id == "task-1"
    assert result.context_id == "ctx-1"
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run:
```bash
cd openmolt/openjarvis-bridge
python -m pytest tests/test_a2a_store.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'a2a.store'`

- [ ] **Step 3: SupabaseTaskStore 구현**

Create `openjarvis-bridge/a2a/store/__init__.py`:
```python
from a2a.store.supabase_store import SupabaseTaskStore

__all__ = ["SupabaseTaskStore"]
```

Create `openjarvis-bridge/a2a/store/supabase_store.py`:
```python
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

# Map proto TaskState enum to DB string
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
        """Initialize with an asyncpg connection pool.

        Args:
            pool: asyncpg.Pool instance connected to Supabase.
        """
        self._pool = pool

    async def save(self, task: Task, context: ServerCallContext | None = None) -> None:
        """Save or update a task via upsert."""
        state_str = _STATE_TO_STR.get(task.status.state, "SUBMITTED")
        artifacts_json = json.dumps([MessageToDict(a) for a in task.artifacts])
        history_json = json.dumps([MessageToDict(m) for m in task.history])
        metadata_json = json.dumps(dict(task.metadata) if task.metadata.fields else {})

        await self._pool.fetchrow(
            """INSERT INTO a2a_tasks (id, context_id, owner_agent_id, executor_agent_id, state, artifacts, metadata, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW(), NOW())
               ON CONFLICT (id) DO UPDATE SET
                 state = EXCLUDED.state,
                 artifacts = EXCLUDED.artifacts,
                 metadata = EXCLUDED.metadata,
                 updated_at = NOW()
               RETURNING id""",
            task.id,
            task.context_id,
            task.metadata.get("owner_agent_id", ""),
            task.metadata.get("executor_agent_id", ""),
            state_str,
            artifacts_json,
            metadata_json,
        )
        logger.debug("Task %s saved (state=%s)", task.id, state_str)

    async def get(self, task_id: str, context: ServerCallContext | None = None) -> Task | None:
        """Retrieve a task by ID."""
        row = await self._pool.fetchrow(
            "SELECT id, context_id, state, artifacts, metadata FROM a2a_tasks WHERE id = $1",
            task_id,
        )
        if not row:
            return None
        return self._row_to_task(row)

    async def list(self, params: ListTasksRequest, context: ServerCallContext | None = None) -> ListTasksResponse:
        """List tasks with filtering."""
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
        page_size = params.page_size or 20

        rows = await self._pool.fetch(
            f"SELECT id, context_id, state, artifacts, metadata FROM a2a_tasks {where} ORDER BY created_at DESC LIMIT {page_size + 1}",
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
        """Delete a task."""
        await self._pool.execute("DELETE FROM a2a_tasks WHERE id = $1", task_id)
        logger.info("Task %s deleted", task_id)

    def _row_to_task(self, row: dict) -> Task:
        """Convert a DB row to a proto Task."""
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
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run:
```bash
cd openmolt/openjarvis-bridge
python -m pytest tests/test_a2a_store.py -v
```

Expected: 3 tests PASSED

- [ ] **Step 5: Commit**

```bash
cd openmolt && git add openjarvis-bridge/a2a/store/ openjarvis-bridge/tests/test_a2a_store.py
git commit -m "feat(a2a): implement SupabaseTaskStore with asyncpg"
```

---

### Task 4: AgentCardBuilder — DB + AGTHUB → AgentCard 변환

**Files:**
- Create: `openjarvis-bridge/a2a/card/__init__.py`
- Create: `openjarvis-bridge/a2a/card/builder.py`
- Create: `openjarvis-bridge/a2a/card/registry.py`
- Create: `openjarvis-bridge/tests/test_a2a_card_builder.py`

- [ ] **Step 1: 테스트 작성**

Create `openjarvis-bridge/tests/test_a2a_card_builder.py`:
```python
"""Tests for AgentCardBuilder."""

import pytest
from unittest.mock import MagicMock
from pathlib import Path


def test_build_card_from_agent_row():
    """AgentCardBuilder should create valid AgentCard from DB row + AGTHUB."""
    from a2a.card.builder import AgentCardBuilder

    builder = AgentCardBuilder(base_url="http://localhost:5000")

    agent_row = {
        "id": "agent-uuid-1",
        "name": "seohyun",
        "display_name": "Seohyun",
        "persona": "Creative artist with passion for webtoons and digital art.",
        "archetype": "creator",
        "expertise_topics": ["webtoon", "art", "digital_painting"],
        "updated_at": "2026-03-28T10:00:00",
    }

    # Mock AGTHUB profile (no file system needed)
    agthub_profile = MagicMock()
    agthub_profile.config = {"model": {"name": "gemini-2.5-flash-lite"}}
    agthub_profile.soul = "You are Seohyun, a passionate creator."
    agthub_profile.name = "seohyun"

    card = builder.build(agent_row, agthub_profile)

    assert card.name == "Seohyun"
    assert "Creative artist" in card.description
    assert card.provider.organization == "Clickaround"
    assert len(card.skills) >= 1
    assert card.skills[0].id == "conversation"
    assert any(i.protocol_binding == "JSONRPC" for i in card.supported_interfaces)
    assert any(i.protocol_binding == "HTTP+JSON" for i in card.supported_interfaces)


def test_build_card_without_agthub():
    """AgentCardBuilder should work with DB data only when AGTHUB profile is None."""
    from a2a.card.builder import AgentCardBuilder

    builder = AgentCardBuilder(base_url="http://localhost:5000")

    agent_row = {
        "id": "ext-uuid-1",
        "name": "external_bot",
        "display_name": "External Bot",
        "persona": "A helpful external agent.",
        "archetype": "utility",
        "expertise_topics": [],
        "updated_at": "2026-03-30T10:00:00",
    }

    card = builder.build(agent_row, agthub_profile=None)

    assert card.name == "External Bot"
    assert len(card.skills) >= 1


def test_registry_caches_cards():
    """AgentCardRegistry should cache built cards."""
    from a2a.card.registry import AgentCardRegistry
    from a2a.card.builder import AgentCardBuilder

    builder = AgentCardBuilder(base_url="http://localhost:5000")
    registry = AgentCardRegistry(builder)

    agent_row = {
        "id": "a1", "name": "test", "display_name": "Test",
        "persona": "Test agent.", "archetype": "utility",
        "expertise_topics": [], "updated_at": "2026-03-30T10:00:00",
    }

    registry.register(agent_row, agthub_profile=None)
    card = registry.get("test")

    assert card is not None
    assert card.name == "Test"
    assert registry.get("nonexistent") is None
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run:
```bash
cd openmolt/openjarvis-bridge
python -m pytest tests/test_a2a_card_builder.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: AgentCardBuilder 구현**

Create `openjarvis-bridge/a2a/card/__init__.py`:
```python
from a2a.card.builder import AgentCardBuilder
from a2a.card.registry import AgentCardRegistry

__all__ = ["AgentCardBuilder", "AgentCardRegistry"]
```

Create `openjarvis-bridge/a2a/card/builder.py`:
```python
"""Build A2A AgentCard from DB agent row + AGTHUB profile."""

import logging
from typing import Any, Optional

from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentInterface,
    AgentProvider,
    AgentSkill,
)

logger = logging.getLogger(__name__)

# Default skills every agent supports
_DEFAULT_SKILLS = [
    AgentSkill(
        id="conversation",
        name="Conversation",
        description="Chat with this agent using their unique persona and knowledge.",
        tags=["chat", "persona"],
        examples=["Tell me about yourself", "What do you think about this topic?"],
        input_modes=["text"],
        output_modes=["text", "task-status"],
    ),
]

# Archetype-specific skills
_ARCHETYPE_SKILLS = {
    "creator": AgentSkill(
        id="create_content", name="Create Content",
        description="Generate original posts, stories, or artwork descriptions.",
        tags=["create", "write"], examples=["Write a post about AI art"],
        input_modes=["text"], output_modes=["text"],
    ),
    "critic": AgentSkill(
        id="critique", name="Critique",
        description="Analyze and critique content with detailed feedback.",
        tags=["critique", "review"], examples=["Review this webtoon episode"],
        input_modes=["text"], output_modes=["text"],
    ),
    "expert": AgentSkill(
        id="answer_question", name="Answer Question",
        description="Provide expert answers in their domain.",
        tags=["qa", "expert"], examples=["Explain the latest trends"],
        input_modes=["text"], output_modes=["text"],
    ),
    "connector": AgentSkill(
        id="bridge_conversation", name="Bridge Conversation",
        description="Connect different viewpoints and facilitate discussion.",
        tags=["connect", "moderate"], examples=["What do both sides think?"],
        input_modes=["text"], output_modes=["text"],
    ),
    "provocateur": AgentSkill(
        id="debate", name="Debate",
        description="Challenge opinions and start thought-provoking debates.",
        tags=["debate", "challenge"], examples=["Why do you think that?"],
        input_modes=["text"], output_modes=["text"],
    ),
}


class AgentCardBuilder:
    """Builds A2A AgentCard from DB row + optional AGTHUB profile."""

    def __init__(self, base_url: str):
        self._base_url = base_url.rstrip("/")

    def build(self, agent_row: dict[str, Any], agthub_profile: Optional[Any] = None) -> AgentCard:
        """Build AgentCard from DB agent row and optional AGTHUB profile.

        Args:
            agent_row: Dict with agents table columns.
            agthub_profile: Optional AgentProfile from core.agent_registry.
        """
        name = agent_row.get("display_name") or agent_row.get("name", "Unknown")
        agent_name = agent_row.get("name", "unknown")
        persona = agent_row.get("persona", "")
        description = persona[:200] if persona else f"AI agent on Clickaround community."
        archetype = agent_row.get("archetype", "utility")
        version = agent_row.get("updated_at", "2026-01-01")
        if hasattr(version, "isoformat"):
            version = version.isoformat()

        # Build skills list
        skills = list(_DEFAULT_SKILLS)
        archetype_skill = _ARCHETYPE_SKILLS.get(archetype)
        if archetype_skill:
            skills.append(archetype_skill)

        # Add AGTHUB-derived skills if available
        if agthub_profile and hasattr(agthub_profile, "config"):
            agthub_skills = agthub_profile.config.get("skills", [])
            for s in agthub_skills:
                if isinstance(s, dict) and s.get("id"):
                    skills.append(AgentSkill(
                        id=s["id"],
                        name=s.get("name", s["id"]),
                        description=s.get("description", ""),
                        tags=s.get("tags", []),
                        input_modes=["text"],
                        output_modes=["text"],
                    ))

        return AgentCard(
            name=name,
            description=description,
            provider=AgentProvider(
                organization="Clickaround",
                url="https://openmolt.vercel.app",
            ),
            version=str(version),
            capabilities=AgentCapabilities(
                streaming=True,
                push_notifications=True,
            ),
            default_input_modes=["text"],
            default_output_modes=["text", "task-status"],
            skills=skills,
            supported_interfaces=[
                AgentInterface(
                    protocol_binding="JSONRPC",
                    protocol_version="1.0",
                    url=f"{self._base_url}/a2a/jsonrpc/",
                ),
                AgentInterface(
                    protocol_binding="HTTP+JSON",
                    protocol_version="1.0",
                    url=f"{self._base_url}/a2a/rest/",
                ),
                AgentInterface(
                    protocol_binding="GRPC",
                    protocol_version="1.0",
                    url=f"{self._base_url}:50051",
                ),
            ],
        )
```

Create `openjarvis-bridge/a2a/card/registry.py`:
```python
"""AgentCard registry — caches built cards for fast lookup."""

import logging
from typing import Any, Optional

from a2a.types import AgentCard
from a2a.card.builder import AgentCardBuilder

logger = logging.getLogger(__name__)


class AgentCardRegistry:
    """In-memory cache of AgentCards, keyed by agent name."""

    def __init__(self, builder: AgentCardBuilder):
        self._builder = builder
        self._cards: dict[str, AgentCard] = {}

    def register(self, agent_row: dict[str, Any], agthub_profile: Optional[Any] = None) -> AgentCard:
        """Build and cache an AgentCard."""
        card = self._builder.build(agent_row, agthub_profile)
        name = agent_row.get("name", "unknown")
        self._cards[name] = card
        return card

    def get(self, name: str) -> Optional[AgentCard]:
        """Get cached AgentCard by agent name."""
        return self._cards.get(name)

    def get_all(self) -> list[AgentCard]:
        """Get all cached AgentCards."""
        return list(self._cards.values())

    def reload(self, agents: list[dict], agthub_profiles: dict[str, Any]) -> int:
        """Rebuild all cards from fresh data.

        Args:
            agents: List of agent DB rows.
            agthub_profiles: Dict of name → AgentProfile.

        Returns:
            Number of cards built.
        """
        self._cards.clear()
        for row in agents:
            name = row.get("name", "")
            profile = agthub_profiles.get(name)
            self.register(row, profile)
        logger.info("AgentCardRegistry reloaded: %d cards", len(self._cards))
        return len(self._cards)

    def __len__(self) -> int:
        return len(self._cards)
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run:
```bash
cd openmolt/openjarvis-bridge
python -m pytest tests/test_a2a_card_builder.py -v
```

Expected: 3 tests PASSED

- [ ] **Step 5: Commit**

```bash
cd openmolt && git add openjarvis-bridge/a2a/card/ openjarvis-bridge/tests/test_a2a_card_builder.py
git commit -m "feat(a2a): implement AgentCardBuilder and AgentCardRegistry"
```

---

### Task 5: GoodmoltAgentExecutor — 에이전트 실행 로직

**Files:**
- Create: `openjarvis-bridge/a2a/executor.py`
- Create: `openjarvis-bridge/tests/test_a2a_executor.py`

- [ ] **Step 1: 테스트 작성**

Create `openjarvis-bridge/tests/test_a2a_executor.py`:
```python
"""Tests for GoodmoltAgentExecutor."""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from a2a.server.agent_execution.context import RequestContext
from a2a.server.events.event_queue import EventQueue
from a2a.types.a2a_pb2 import Message, Part, Role


def _make_context(text="Hello", task_id="t1", context_id="c1", agent_name="seohyun"):
    """Create a minimal RequestContext for testing."""
    msg = Message(
        role=Role.ROLE_USER,
        message_id="m1",
        task_id=task_id,
        context_id=context_id,
        parts=[Part(text=text)],
    )
    ctx = MagicMock(spec=RequestContext)
    ctx.message = msg
    ctx.task_id = task_id
    ctx.context_id = context_id
    ctx.get_user_input.return_value = text
    # Agent name from metadata
    ctx.metadata = {"target_agent_name": agent_name}
    return ctx


@pytest.mark.asyncio
async def test_executor_produces_completed_event():
    """GoodmoltAgentExecutor should produce working + artifact + completed events."""
    from a2a.executor import GoodmoltAgentExecutor

    # Mock dependencies
    mock_registry = MagicMock()
    mock_profile = MagicMock()
    mock_profile.soul = "You are Seohyun, a creative artist."
    mock_profile.config = {}
    mock_registry.get.return_value = mock_profile

    mock_llm = AsyncMock(return_value="I recommend Tower of God!")

    executor = GoodmoltAgentExecutor(
        agent_registry=mock_registry,
        llm_generate=mock_llm,
    )

    ctx = _make_context(text="Recommend a webtoon", agent_name="seohyun")
    queue = EventQueue()

    await executor.execute(ctx, queue)

    # Collect all events
    events = []
    while not queue.is_empty():
        event = await asyncio.wait_for(queue.dequeue_event(), timeout=1.0)
        events.append(event)

    # Should have: status(WORKING) + artifact + status(COMPLETED)
    assert len(events) >= 2
    mock_llm.assert_called_once()
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run:
```bash
cd openmolt/openjarvis-bridge
python -m pytest tests/test_a2a_executor.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'a2a.executor'`

- [ ] **Step 3: GoodmoltAgentExecutor 구현**

Create `openjarvis-bridge/a2a/executor.py`:
```python
"""GoodmoltAgentExecutor — executes A2A tasks using agent personas.

Loads agent profile from AGTHUB (via AgentRegistry), applies persona,
calls LLM, and publishes results via TaskUpdater.
"""

import logging
from typing import Any, Callable, Awaitable, Optional

from a2a.server.agent_execution.agent_executor import AgentExecutor
from a2a.server.agent_execution.context import RequestContext
from a2a.server.events.event_queue import EventQueue
from a2a.server.tasks.task_updater import TaskUpdater
from a2a.types.a2a_pb2 import Part

logger = logging.getLogger(__name__)


class GoodmoltAgentExecutor(AgentExecutor):
    """Executes A2A tasks by loading agent persona and calling LLM.

    Args:
        agent_registry: core.agent_registry.AgentRegistry instance.
        llm_generate: Async function(system_prompt, user_prompt) -> str.
    """

    def __init__(
        self,
        agent_registry: Any,
        llm_generate: Callable[..., Awaitable[str]],
    ):
        self._registry = agent_registry
        self._llm_generate = llm_generate
        self._running_tasks: set[str] = set()

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        """Execute a task: load persona, call LLM, return response."""
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

        # Signal work started
        working_msg = updater.new_agent_message(
            parts=[Part(text="Thinking...")]
        )
        await updater.start_work(message=working_msg)

        try:
            # Get user input
            user_input = context.get_user_input() or ""

            # Resolve target agent name from metadata
            agent_name = None
            if hasattr(context, "metadata") and context.metadata:
                agent_name = context.metadata.get("target_agent_name")

            # Load agent profile from AGTHUB
            system_prompt = "You are a helpful AI agent on Clickaround community."
            if agent_name:
                profile = self._registry.get(agent_name)
                if profile and profile.soul:
                    system_prompt = profile.soul

            # Check if task was canceled while loading
            if task_id not in self._running_tasks:
                return

            # Call LLM
            response_text = await self._llm_generate(system_prompt, user_input)

            if task_id not in self._running_tasks:
                return

            # Publish artifact
            await updater.add_artifact(
                parts=[Part(text=response_text)],
                name="response",
                last_chunk=True,
            )
            await updater.complete()

            logger.info("Task %s completed for agent %s", task_id, agent_name)

        except Exception as e:
            logger.error("Task %s failed: %s", task_id, e)
            error_msg = updater.new_agent_message(
                parts=[Part(text=f"Error: {str(e)}")]
            )
            await updater.failed(message=error_msg)
        finally:
            self._running_tasks.discard(task_id)

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        """Cancel a running task."""
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
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run:
```bash
cd openmolt/openjarvis-bridge
python -m pytest tests/test_a2a_executor.py -v
```

Expected: 1 test PASSED

- [ ] **Step 5: Commit**

```bash
cd openmolt && git add openjarvis-bridge/a2a/executor.py openjarvis-bridge/tests/test_a2a_executor.py
git commit -m "feat(a2a): implement GoodmoltAgentExecutor with persona-based LLM"
```

---

### Task 6: A2A Auth Provider

**Files:**
- Create: `openjarvis-bridge/a2a/auth/__init__.py`
- Create: `openjarvis-bridge/a2a/auth/provider.py`

- [ ] **Step 1: Auth provider 구현**

Create `openjarvis-bridge/a2a/auth/__init__.py`:
```python
from a2a.auth.provider import verify_api_key

__all__ = ["verify_api_key"]
```

Create `openjarvis-bridge/a2a/auth/provider.py`:
```python
"""A2A auth provider — verifies agent API keys against agents.api_key_hash.

Reuses the existing BYOA authentication pattern from Express.
"""

import hashlib
import hmac
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def verify_api_key(pool, api_key: str) -> Optional[dict]:
    """Verify an API key and return the agent row if valid.

    Args:
        pool: asyncpg connection pool.
        api_key: Bearer token from Authorization header.

    Returns:
        Agent row dict if valid, None if invalid.
    """
    if not api_key:
        return None

    # Hash the key the same way Express does: SHA-256
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()

    row = await pool.fetchrow(
        """SELECT id, name, display_name, archetype, is_active, is_external
           FROM agents
           WHERE api_key_hash = $1 AND is_active = true""",
        key_hash,
    )

    if row:
        logger.debug("API key verified for agent: %s", row["name"])
        return dict(row)

    logger.warning("Invalid API key attempted")
    return None
```

- [ ] **Step 2: Commit**

```bash
cd openmolt && git add openjarvis-bridge/a2a/auth/
git commit -m "feat(a2a): implement API key auth provider"
```

---

### Task 7: A2A Event Bus (내부 에이전트 통신)

**Files:**
- Create: `openjarvis-bridge/a2a/bus/__init__.py`
- Create: `openjarvis-bridge/a2a/bus/transport.py`
- Create: `openjarvis-bridge/a2a/bus/event_bus.py`

- [ ] **Step 1: Transport 추상화 + Local 구현**

Create `openjarvis-bridge/a2a/bus/__init__.py`:
```python
from a2a.bus.event_bus import A2AEventBus
from a2a.bus.transport import A2ATransport, LocalTransport

__all__ = ["A2AEventBus", "A2ATransport", "LocalTransport"]
```

Create `openjarvis-bridge/a2a/bus/transport.py`:
```python
"""Abstract transport layer for A2A inter-agent communication.

LocalTransport: same-process asyncio event (current default).
HttpTransport: HTTP A2A call (for future B-plan gateway separation).
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)


class A2ATransport(ABC):
    """Abstract transport for sending A2A messages between agents."""

    @abstractmethod
    async def send(self, to_agent_id: str, message: dict[str, Any]) -> None:
        """Send a message to an agent."""

    @abstractmethod
    def subscribe(self, agent_id: str, callback) -> None:
        """Subscribe to messages for an agent."""


class LocalTransport(A2ATransport):
    """In-process transport using asyncio callbacks.

    For B-plan separation, replace this with HttpTransport.
    """

    def __init__(self):
        self._handlers: dict[str, list] = {}

    async def send(self, to_agent_id: str, message: dict[str, Any]) -> None:
        """Dispatch message to registered handlers for the agent."""
        handlers = self._handlers.get(to_agent_id, [])
        for handler in handlers:
            try:
                result = handler(message)
                if asyncio.iscoroutine(result):
                    await result
            except Exception as e:
                logger.error("Handler error for agent %s: %s", to_agent_id, e)

    def subscribe(self, agent_id: str, callback) -> None:
        """Register a callback for messages to this agent."""
        if agent_id not in self._handlers:
            self._handlers[agent_id] = []
        self._handlers[agent_id].append(callback)
        logger.debug("Subscribed handler for agent %s", agent_id)
```

Create `openjarvis-bridge/a2a/bus/event_bus.py`:
```python
"""A2AEventBus — high-level API for inter-agent A2A messaging.

Wraps transport layer and formats messages in A2A Part structure.
Also records messages to a2a_messages table for history.
"""

import logging
from typing import Any, Optional

from a2a.bus.transport import A2ATransport

logger = logging.getLogger(__name__)


class A2AEventBus:
    """High-level event bus for A2A inter-agent communication."""

    def __init__(self, transport: A2ATransport, pool=None):
        """Initialize with transport and optional DB pool for history.

        Args:
            transport: A2ATransport instance (LocalTransport or HttpTransport).
            pool: Optional asyncpg pool for persisting messages to a2a_messages.
        """
        self._transport = transport
        self._pool = pool

    async def emit(
        self,
        from_agent_id: str,
        to_agent_id: str,
        context_id: str,
        text: str,
        role: str = "agent",
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Send an A2A message from one agent to another.

        Args:
            from_agent_id: Sender agent ID (agents.id).
            to_agent_id: Receiver agent ID (agents.id).
            context_id: Conversation context (e.g., "post-{id}").
            text: Message text content.
            role: "user" or "agent".
            metadata: Optional metadata dict.
        """
        message = {
            "from_agent_id": from_agent_id,
            "to_agent_id": to_agent_id,
            "context_id": context_id,
            "role": role,
            "parts": [{"text": text}],
            "metadata": metadata or {},
        }

        # Persist to DB if pool available
        if self._pool:
            try:
                await self._pool.execute(
                    """INSERT INTO a2a_messages (context_id, role, agent_id, parts, metadata)
                       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)""",
                    context_id,
                    role,
                    from_agent_id,
                    '[{"text": "' + text.replace('"', '\\"') + '"}]',
                    "{}",
                )
            except Exception as e:
                logger.warning("Failed to persist A2A message: %s", e)

        # Dispatch via transport
        await self._transport.send(to_agent_id, message)

    def subscribe(self, agent_id: str, callback) -> None:
        """Subscribe to messages for an agent."""
        self._transport.subscribe(agent_id, callback)
```

- [ ] **Step 2: Commit**

```bash
cd openmolt && git add openjarvis-bridge/a2a/bus/
git commit -m "feat(a2a): implement A2AEventBus with LocalTransport"
```

---

### Task 8: A2A Server 조립 + Bridge server.py 마운트

**Files:**
- Create: `openjarvis-bridge/a2a/server.py`
- Modify: `openjarvis-bridge/server.py`
- Create: `openjarvis-bridge/tests/test_a2a_server.py`

- [ ] **Step 1: A2A server builder 구현**

Create `openjarvis-bridge/a2a/server.py`:
```python
"""A2A Server builder — assembles all A2A components into FastAPI apps.

Creates JSON-RPC + REST FastAPI applications and optional gRPC server
using the a2a-python SDK.
"""

import logging
from typing import Any, Optional

from a2a.server.apps import A2AFastAPIApplication, A2ARESTFastAPIApplication
from a2a.server.request_handlers.default_request_handler import DefaultRequestHandler
from a2a.server.tasks.inmemory_task_store import InMemoryTaskStore
from a2a.types import AgentCard

from a2a.card.registry import AgentCardRegistry
from a2a.executor import GoodmoltAgentExecutor

logger = logging.getLogger(__name__)


class GoodmoltA2AServer:
    """Assembles A2A server components for Bridge integration.

    Provides:
    - REST FastAPI sub-app (mount at /a2a/rest)
    - JSON-RPC routes (add to main app)
    - Optional gRPC server
    """

    def __init__(
        self,
        card_registry: AgentCardRegistry,
        executor: GoodmoltAgentExecutor,
        task_store=None,
    ):
        self._card_registry = card_registry
        self._executor = executor
        self._task_store = task_store or InMemoryTaskStore()

        # Use first card as default (or build a directory card)
        cards = card_registry.get_all()
        self._default_card = cards[0] if cards else self._build_directory_card()

        self._request_handler = DefaultRequestHandler(
            agent_executor=executor,
            task_store=self._task_store,
        )

    def build_rest_app(self):
        """Build REST FastAPI sub-application."""
        builder = A2ARESTFastAPIApplication(
            agent_card=self._default_card,
            http_handler=self._request_handler,
            enable_v0_3_compat=True,
        )
        return builder.build()

    def add_jsonrpc_routes(self, app, rpc_url="/a2a/jsonrpc/"):
        """Add JSON-RPC routes to existing FastAPI app."""
        builder = A2AFastAPIApplication(
            agent_card=self._default_card,
            http_handler=self._request_handler,
            enable_v0_3_compat=True,
        )
        builder.add_routes_to_app(app, rpc_url=rpc_url)

    def add_agent_card_routes(self, app):
        """Add per-agent card lookup routes."""
        from fastapi import HTTPException
        from fastapi.responses import JSONResponse
        from google.protobuf.json_format import MessageToDict

        @app.get("/a2a/agents/{name}/card")
        async def get_agent_card(name: str):
            card = self._card_registry.get(name)
            if not card:
                raise HTTPException(status_code=404, detail=f"Agent '{name}' not found")
            return JSONResponse(MessageToDict(card))

        @app.get("/a2a/agents")
        async def list_agent_cards(limit: int = 50, offset: int = 0):
            all_cards = self._card_registry.get_all()
            page = all_cards[offset:offset + limit]
            return JSONResponse({
                "agents": [MessageToDict(c) for c in page],
                "total": len(all_cards),
                "limit": limit,
                "offset": offset,
            })

    def _build_directory_card(self) -> AgentCard:
        """Build a directory-level AgentCard for the platform."""
        from a2a.types import AgentCapabilities, AgentProvider, AgentSkill, AgentInterface
        return AgentCard(
            name="Clickaround Community",
            description="AI agent community with 352 agents. Use /a2a/agents to discover individual agents.",
            provider=AgentProvider(organization="Clickaround", url="https://openmolt.vercel.app"),
            version="1.0.0",
            capabilities=AgentCapabilities(streaming=True, push_notifications=True),
            default_input_modes=["text"],
            default_output_modes=["text", "task-status"],
            skills=[AgentSkill(
                id="discover", name="Discover Agents",
                description="Browse and discover agents in the community.",
                tags=["discover"], input_modes=["text"], output_modes=["text"],
            )],
            supported_interfaces=[],
        )
```

- [ ] **Step 2: Bridge server.py 수정**

`openjarvis-bridge/server.py`에 A2A 마운트 추가. 기존 코드 끝에:

```python
# === A2A Protocol Integration ===
from a2a.config import SUPABASE_DATABASE_URL, A2A_GRPC_PORT
from a2a.card.builder import AgentCardBuilder
from a2a.card.registry import AgentCardRegistry
from a2a.executor import GoodmoltAgentExecutor
from a2a.server import GoodmoltA2AServer

_a2a_server: GoodmoltA2AServer = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _trace_store, _a2a_server
    _trace_store = TraceStore()
    registry = AgentRegistry()

    # Inject dependencies into existing routers
    traces.set_store(_trace_store)
    agents.set_store(_trace_store)
    agents.set_registry(registry)
    learning.set_store(_trace_store)
    health.set_store(_trace_store)
    interest.set_registry(registry)
    generate.set_registry(registry)
    generate.set_store(_trace_store)

    # Check provider
    provider = get_provider()
    ok = await provider.is_available()
    logger.info("Provider: %s (available: %s)", provider.provider_name(), ok)
    logger.info("Agents: %d loaded from AGTHUB", len(registry))

    # === A2A Setup ===
    card_builder = AgentCardBuilder(base_url=f"http://localhost:{BRIDGE_PORT}")
    card_registry = AgentCardRegistry(card_builder)

    # Build cards for all AGTHUB agents
    # TODO: load agent rows from Supabase once pool is available
    for name, profile in registry._agents.items():
        agent_row = {
            "id": name, "name": name,
            "display_name": profile.config.get("display_name", name),
            "persona": profile.soul[:200] if profile.soul else "",
            "archetype": profile.config.get("archetype", "utility"),
            "expertise_topics": profile.config.get("topics", []),
            "updated_at": "2026-03-30",
        }
        card_registry.register(agent_row, profile)

    logger.info("A2A AgentCards: %d built", len(card_registry))

    # LLM generate function for executor
    async def llm_generate(system_prompt: str, user_prompt: str) -> str:
        from core.llm import get_provider
        p = get_provider()
        return await p.generate(system_prompt=system_prompt, prompt=user_prompt)

    executor = GoodmoltAgentExecutor(
        agent_registry=registry,
        llm_generate=llm_generate,
    )

    _a2a_server = GoodmoltA2AServer(
        card_registry=card_registry,
        executor=executor,
    )

    # Mount A2A REST app
    rest_app = _a2a_server.build_rest_app()
    app.mount("/a2a/rest", rest_app)

    # Add JSON-RPC routes
    _a2a_server.add_jsonrpc_routes(app)

    # Add per-agent card routes
    _a2a_server.add_agent_card_routes(app)

    logger.info("A2A server mounted (JSON-RPC + REST)")
    logger.info("OpenJarvis Bridge ready on port %d", BRIDGE_PORT)

    yield

    _trace_store.close()
    await close_provider()
    logger.info("OpenJarvis Bridge shutdown")
```

Note: 기존 `lifespan` 함수를 위 코드로 교체. 기존 라우터 설정은 그대로 유지.

- [ ] **Step 3: 통합 테스트 작성**

Create `openjarvis-bridge/tests/test_a2a_server.py`:
```python
"""Integration test for A2A server endpoints."""

import pytest
from unittest.mock import MagicMock, AsyncMock


def test_a2a_server_builds_rest_app():
    """GoodmoltA2AServer should build a REST FastAPI app."""
    from a2a.card.builder import AgentCardBuilder
    from a2a.card.registry import AgentCardRegistry
    from a2a.executor import GoodmoltAgentExecutor
    from a2a.server import GoodmoltA2AServer

    builder = AgentCardBuilder(base_url="http://localhost:5000")
    card_registry = AgentCardRegistry(builder)
    card_registry.register({
        "id": "a1", "name": "test", "display_name": "Test",
        "persona": "Test agent.", "archetype": "utility",
        "expertise_topics": [], "updated_at": "2026-03-30",
    })

    executor = GoodmoltAgentExecutor(
        agent_registry=MagicMock(),
        llm_generate=AsyncMock(return_value="Hello!"),
    )

    server = GoodmoltA2AServer(
        card_registry=card_registry,
        executor=executor,
    )

    rest_app = server.build_rest_app()
    assert rest_app is not None
```

- [ ] **Step 4: 테스트 실행**

Run:
```bash
cd openmolt/openjarvis-bridge
python -m pytest tests/test_a2a_server.py -v
```

Expected: PASSED

- [ ] **Step 5: Commit**

```bash
cd openmolt && git add openjarvis-bridge/a2a/server.py openjarvis-bridge/server.py openjarvis-bridge/tests/test_a2a_server.py
git commit -m "feat(a2a): assemble A2A server and mount on Bridge"
```

---

### Task 9: Express A2AEventBus + 기존 코드 연결

**Files:**
- Create: `openmolt/src/backend/services/A2AEventBus.js`
- Modify: `openmolt/src/backend/services/TaskScheduler.js`
- Modify: `openmolt/src/backend/services/TaskWorker.js`

- [ ] **Step 1: A2AEventBus.js 구현**

Create `openmolt/src/backend/services/A2AEventBus.js`:
```javascript
/**
 * A2AEventBus — Internal agent-to-agent messaging using A2A message format.
 *
 * Uses EventEmitter for same-process communication.
 * Messages follow A2A Part structure: { parts: [{ text: "..." }] }
 *
 * For B-plan gateway separation, replace emit() internals with HTTP POST.
 */

const EventEmitter = require('events');

const _emitter = new EventEmitter();
_emitter.setMaxListeners(500); // 352 agents + headroom

const A2AEventBus = {

  /**
   * Send an A2A-formatted message from one agent to another.
   * @param {Object} params
   * @param {string} params.fromAgentId - Sender agent ID
   * @param {string} params.toAgentId - Receiver agent ID
   * @param {string} params.contextId - Conversation context (e.g., "post-{id}")
   * @param {string} params.text - Message text
   * @param {string} [params.role='agent'] - 'user' or 'agent'
   */
  emit({ fromAgentId, toAgentId, contextId, text, role = 'agent' }) {
    const message = {
      from_agent_id: fromAgentId,
      to_agent_id: toAgentId,
      context_id: contextId,
      role,
      parts: [{ text }],
      timestamp: new Date().toISOString(),
    };

    _emitter.emit(`a2a:${toAgentId}`, message);
  },

  /**
   * Subscribe to A2A messages for an agent.
   * @param {string} agentId
   * @param {Function} callback - (message) => void
   */
  subscribe(agentId, callback) {
    _emitter.on(`a2a:${agentId}`, callback);
  },

  /**
   * Unsubscribe from A2A messages.
   */
  unsubscribe(agentId, callback) {
    _emitter.off(`a2a:${agentId}`, callback);
  },
};

module.exports = A2AEventBus;
```

- [ ] **Step 2: TaskScheduler.spawnReactions()에 A2AEventBus 연결**

`openmolt/src/backend/services/TaskScheduler.js`의 `spawnReactions` 메서드에서, `await this.createTask(...)` 호출 직후에 추가:

```javascript
// After: await this.createTask({ type: 'react_to_comment', ... });
// Add A2A event emission:
const A2AEventBus = require('./A2AEventBus');
A2AEventBus.emit({
  fromAgentId: parentTask.agentId,
  toAgentId: agent.id,
  contextId: `post-${targetId}`,
  text: `Chain reaction at depth ${depth + 1}`,
});
```

- [ ] **Step 3: TaskWorker._executeTask() 완료 후 A2A 이벤트**

`openmolt/src/backend/services/TaskWorker.js`의 `_executeTask` 메서드에서, task가 completed로 마킹된 후:

```javascript
// After marking task as completed, add:
const A2AEventBus = require('../services/A2AEventBus');
if (task.type === 'react_to_post' || task.type === 'react_to_comment') {
  A2AEventBus.emit({
    fromAgentId: task.agent_id,
    toAgentId: task.target_id,
    contextId: `task-${task.id}`,
    text: `Task ${task.type} completed`,
  });
}
```

- [ ] **Step 4: Commit**

```bash
cd openmolt && git add src/backend/services/A2AEventBus.js src/backend/services/TaskScheduler.js src/backend/services/TaskWorker.js
git commit -m "feat(express): add A2AEventBus and connect to TaskScheduler/TaskWorker"
```

---

### Task 10: BYOA 라우트 제거 + 기존 테스트 확인

**Files:**
- Modify: `openmolt/src/backend/routes/agents.js` — BYOA 전용 라우트 제거
- Modify: `openmolt/src/backend/routes/my-agent.js` — 전체 deprecated 마킹

- [ ] **Step 1: agents.js에서 BYOA 전용 라우트를 deprecated 마킹**

`openmolt/src/backend/routes/agents.js`의 `/register`, `/heartbeat`, `/skill` 라우트에 deprecated 응답 추가:

```javascript
// Add at top of each BYOA route handler:
// res.set('X-Deprecated', 'Use A2A protocol at /a2a/ endpoints instead');
```

Note: 완전 제거가 아닌 deprecated 헤더 추가. 안전한 전환을 위해.

- [ ] **Step 2: 기존 Playwright 테스트 영향 확인**

Run:
```bash
cd openmolt && npx playwright test --reporter=list 2>&1 | tail -20
```

Expected: 기존 58/62 통과 유지 (BYOA 테스트가 없으므로 영향 없어야 함)

- [ ] **Step 3: Commit**

```bash
cd openmolt && git add src/backend/routes/agents.js src/backend/routes/my-agent.js
git commit -m "chore: mark BYOA routes as deprecated in favor of A2A protocol"
```

---

### Task 11: E2E 검증 — Bridge A2A 서버 기동 테스트

- [ ] **Step 1: Bridge 서버 시작**

Run:
```bash
cd openmolt/openjarvis-bridge && python server.py
```

Expected: 로그에 `A2A AgentCards: N built`, `A2A server mounted` 출력

- [ ] **Step 2: AgentCard 엔드포인트 확인**

Run (새 터미널):
```bash
curl http://localhost:5000/.well-known/agent-card.json | python -m json.tool | head -20
curl http://localhost:5000/a2a/agents | python -m json.tool | head -20
curl http://localhost:5000/a2a/agents/seohyun/card | python -m json.tool
```

Expected: JSON 응답, AgentCard 필드 포함

- [ ] **Step 3: JSON-RPC tasks/send 테스트**

Run:
```bash
curl -X POST http://localhost:5000/a2a/jsonrpc/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tasks/send","params":{"message":{"role":"ROLE_USER","parts":[{"text":"Hello Seohyun!"}]},"metadata":{"target_agent_name":"seohyun"}},"id":1}'
```

Expected: JSON-RPC 응답 with task result

- [ ] **Step 4: 전체 테스트 suite 실행**

Run:
```bash
cd openmolt/openjarvis-bridge
python -m pytest tests/ -v
```

Expected: All tests PASSED

- [ ] **Step 5: Final commit**

```bash
cd openmolt && git add -A
git commit -m "feat(a2a): A2A Protocol v1.0 integration complete — Bridge server + AgentCards + TaskStore + EventBus"
```
