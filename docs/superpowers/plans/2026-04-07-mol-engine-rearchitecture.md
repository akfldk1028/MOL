# MOL Engine 리아키텍처 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `openjarvis-bridge/`를 `mol-engine/`으로 리네임하고, 3개 오픈소스(OMA/OJ/OS)에서 기능을 원본 구조 그대로 가져와 MOL 인프라에 연동한다.

**Architecture:** Express backend에 OMA(TypeScript→JS 변환) 오케스트레이션 엔진 추가. mol-engine(Python)에 OJ traces/learning/workflow + OS skill_engine/cloud/recording 하위폴더 추가. 각 모듈은 Supabase/AGTHUB/CGB에 점진 연동.

**Tech Stack:** Node.js (CommonJS), Python 3.12 (FastAPI), Supabase PostgreSQL, DashScope Qwen, Zod (npm)

**소스 레포:**
- OMA: `C:/DK/MOL/clone/open-multi-agent/src/` (TypeScript)
- OJ: `C:/DK/MOL/openmolt/openjarvis/src/openjarvis/` (Python)
- OS: `C:/DK/MOL/clone/OpenSpace/openspace/` (Python)

**주의:** Backend는 CommonJS (`require`/`module.exports`). OMA TypeScript는 JS로 변환하여 복사.

---

## Phase 0: 리네임 + 독립 모듈 복사

### Task 1: openjarvis-bridge → mol-engine 리네임

**Files:**
- Rename: `openmolt/openjarvis-bridge/` → `openmolt/mol-engine/`
- Modify: `openmolt/src/backend/services/BridgeClient.js:8`
- Modify: `openmolt/src/backend/services/AgentLifecycle.js:32`
- Create: `openmolt/mol-engine/ORIGIN.md`

- [ ] **Step 1: 폴더 리네임**

```bash
cd C:/DK/MOL/openmolt
mv openjarvis-bridge mol-engine
```

- [ ] **Step 2: BridgeClient.js 환경변수 기본값 업데이트**

`src/backend/services/BridgeClient.js:8` 변경:
```js
// 기존
const OJ_BRIDGE_URL = process.env.OJ_BRIDGE_URL || 'http://localhost:5000';
// 변경 (환경변수명은 호환 유지, 주석만 변경)
const OJ_BRIDGE_URL = process.env.OJ_BRIDGE_URL || process.env.MOL_ENGINE_URL || 'http://localhost:5000';
```

- [ ] **Step 3: AgentLifecycle.js 주석 업데이트**

`src/backend/services/AgentLifecycle.js:32` 변경:
```js
// 기존
// OpenJarvis Bridge (interest check + trace)
// 변경
// MOL Engine (interest check + trace) — formerly OpenJarvis Bridge
```

- [ ] **Step 4: ORIGIN.md 생성**

```bash
cat > mol-engine/ORIGIN.md << 'EOF'
# MOL Engine — Origin Tracking

Formerly `openjarvis-bridge/`. Renamed 2026-04-07.

## Subfolders by Origin

| Folder | Source Repo | Source Path | Commit |
|--------|-----------|-------------|--------|
| `openjarvis/` | openmolt/openjarvis (submodule) | `src/openjarvis/` | TBD on copy |
| `openspace/` | clone/OpenSpace | `openspace/` | TBD on copy |
| `api/`, `core/`, `goodmolt_a2a/`, `learning/` | Original (self-written) | — | — |

## Express Engine (TypeScript→JS)

| Folder | Source Repo | Source Path | Commit |
|--------|-----------|-------------|--------|
| `src/backend/engine/open-multi-agent/` | clone/open-multi-agent | `src/` | TBD on copy |
EOF
```

- [ ] **Step 5: mol-engine 서버 시작 테스트**

```bash
cd C:/DK/MOL/openmolt/mol-engine
python server.py &
sleep 3
curl http://localhost:5000/v1/health
# Expected: {"status":"ok", ...}
kill %1
```

- [ ] **Step 6: 커밋**

```bash
cd C:/DK/MOL/openmolt
git add -A
git commit -m "refactor: rename openjarvis-bridge → mol-engine"
```

---

### Task 2: OMA 독립 모듈 복사 (TypeScript→JS 변환)

**Files:**
- Create: `src/backend/engine/open-multi-agent/structured-output.js`
- Create: `src/backend/engine/open-multi-agent/loop-detector.js`
- Create: `src/backend/engine/open-multi-agent/semaphore.js`
- Create: `src/backend/engine/open-multi-agent/index.js`

**Source:** `C:/DK/MOL/clone/open-multi-agent/src/`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p src/backend/engine/open-multi-agent
```

- [ ] **Step 2: structured-output.js 작성 (OMA agent/structured-output.ts → JS 변환)**

`src/backend/engine/open-multi-agent/structured-output.js`:
```js
/**
 * Structured Output — Zod schema validation + auto-retry for LLM responses.
 * @origin: open-multi-agent/src/agent/structured-output.ts
 *
 * Usage:
 *   const { validateAndRetry } = require('./structured-output');
 *   const result = await validateAndRetry(llmCall, zodSchema, maxRetries);
 */

const { z } = require('zod');

/**
 * Extract JSON from LLM response text.
 * Handles markdown fences, partial JSON, etc.
 */
function extractJSON(text) {
  if (!text) return null;

  // Try direct parse first
  try { return JSON.parse(text); } catch {}

  // Try markdown fence extraction
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }

  // Try finding first { to last }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }

  return null;
}

/**
 * Validate LLM output against a Zod schema.
 * @param {string} text - Raw LLM response
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @returns {{ success: boolean, data?: any, error?: string }}
 */
function validate(text, schema) {
  const json = extractJSON(text);
  if (!json) {
    return { success: false, error: 'Failed to extract JSON from response' };
  }

  const result = schema.safeParse(json);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errorMsg = result.error.issues
    .map(i => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
  return { success: false, error: errorMsg };
}

/**
 * Call LLM, validate output, retry once on failure with error feedback.
 * @param {Function} llmCall - async (prompt, options) => string
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {import('zod').ZodSchema} schema
 * @param {Object} [options]
 * @param {number} [options.maxRetries=1]
 * @param {Object} [options.llmOptions]
 * @returns {Promise<{ success: boolean, data?: any, raw?: string, attempts: number }>}
 */
async function validateAndRetry(llmCall, systemPrompt, userPrompt, schema, options = {}) {
  const maxRetries = options.maxRetries ?? 1;
  let lastRaw = '';
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = attempt === 0
      ? userPrompt
      : `${userPrompt}\n\n[Previous attempt failed validation: ${lastError}]\nPlease fix the JSON output.`;

    lastRaw = await llmCall(systemPrompt, prompt, options.llmOptions || {});
    const result = validate(lastRaw, schema);

    if (result.success) {
      return { success: true, data: result.data, raw: lastRaw, attempts: attempt + 1 };
    }

    lastError = result.error;
  }

  return { success: false, raw: lastRaw, error: lastError, attempts: maxRetries + 1 };
}

module.exports = { extractJSON, validate, validateAndRetry };
```

- [ ] **Step 3: loop-detector.js 작성 (OMA agent/loop-detector.ts → JS 변환)**

`src/backend/engine/open-multi-agent/loop-detector.js`:
```js
/**
 * Loop Detector — catches stuck agents repeating same tool calls or text.
 * @origin: open-multi-agent/src/agent/loop-detector.ts
 *
 * Usage:
 *   const { LoopDetector } = require('./loop-detector');
 *   const detector = new LoopDetector({ maxRepeats: 3, action: 'terminate' });
 *   detector.recordToolCall(name, input);
 *   if (detector.isLooping()) { ... }
 */

class LoopDetector {
  /**
   * @param {Object} config
   * @param {number} [config.maxRepeats=3] - Consecutive repeats before triggering
   * @param {'warn'|'terminate'|'callback'} [config.action='warn']
   * @param {Function} [config.onLoop] - Callback when loop detected (action='callback')
   * @param {number} [config.windowSize=10] - Rolling window of recent calls
   */
  constructor(config = {}) {
    this._maxRepeats = config.maxRepeats ?? 3;
    this._action = config.action ?? 'warn';
    this._onLoop = config.onLoop ?? null;
    this._windowSize = config.windowSize ?? 10;
    this._toolHistory = [];
    this._textHistory = [];
    this._loopDetected = false;
    this._loopInfo = null;
  }

  /**
   * Record a tool call. Returns true if loop detected.
   * @param {string} toolName
   * @param {any} input
   * @returns {boolean}
   */
  recordToolCall(toolName, input) {
    const signature = `${toolName}:${JSON.stringify(input)}`;
    this._toolHistory.push(signature);

    if (this._toolHistory.length > this._windowSize) {
      this._toolHistory.shift();
    }

    return this._checkToolLoop();
  }

  /**
   * Record text output. Returns true if loop detected.
   * @param {string} text
   * @returns {boolean}
   */
  recordTextOutput(text) {
    const trimmed = (text || '').trim().slice(0, 200);
    this._textHistory.push(trimmed);

    if (this._textHistory.length > this._windowSize) {
      this._textHistory.shift();
    }

    return this._checkTextLoop();
  }

  /** @returns {boolean} */
  isLooping() {
    return this._loopDetected;
  }

  /** @returns {{ type: string, pattern: string, count: number }|null} */
  getLoopInfo() {
    return this._loopInfo;
  }

  /** Reset detector state. */
  reset() {
    this._toolHistory = [];
    this._textHistory = [];
    this._loopDetected = false;
    this._loopInfo = null;
  }

  _checkToolLoop() {
    if (this._toolHistory.length < this._maxRepeats) return false;
    const recent = this._toolHistory.slice(-this._maxRepeats);
    const allSame = recent.every(s => s === recent[0]);

    if (allSame) {
      this._loopDetected = true;
      this._loopInfo = {
        type: 'tool_repeat',
        pattern: recent[0],
        count: this._maxRepeats,
      };
      this._triggerAction();
      return true;
    }
    return false;
  }

  _checkTextLoop() {
    if (this._textHistory.length < this._maxRepeats) return false;
    const recent = this._textHistory.slice(-this._maxRepeats);
    const allSame = recent.every(s => s === recent[0] && s.length > 20);

    if (allSame) {
      this._loopDetected = true;
      this._loopInfo = {
        type: 'text_repeat',
        pattern: recent[0],
        count: this._maxRepeats,
      };
      this._triggerAction();
      return true;
    }
    return false;
  }

  _triggerAction() {
    if (this._action === 'callback' && this._onLoop) {
      this._onLoop(this._loopInfo);
    } else if (this._action === 'warn') {
      console.warn('[LoopDetector] Loop detected:', this._loopInfo);
    }
    // 'terminate' — caller checks isLooping() and stops
  }
}

module.exports = { LoopDetector };
```

- [ ] **Step 4: semaphore.js 작성 (OMA utils/semaphore.ts → JS 변환)**

`src/backend/engine/open-multi-agent/semaphore.js`:
```js
/**
 * Semaphore — concurrency limiter for agent pool and tool execution.
 * @origin: open-multi-agent/src/utils/semaphore.ts
 */

class Semaphore {
  /**
   * @param {number} maxConcurrency
   */
  constructor(maxConcurrency) {
    this._max = maxConcurrency;
    this._current = 0;
    this._queue = [];
  }

  /** Acquire a permit. Resolves when a slot is available. */
  async acquire() {
    if (this._current < this._max) {
      this._current++;
      return;
    }
    return new Promise(resolve => this._queue.push(resolve));
  }

  /** Release a permit, unblocking the next waiter if any. */
  release() {
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    } else {
      this._current = Math.max(0, this._current - 1);
    }
  }

  /** Run fn with automatic acquire/release. */
  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  get available() { return this._max - this._current; }
  get pending() { return this._queue.length; }
}

module.exports = { Semaphore };
```

- [ ] **Step 5: index.js 작성**

`src/backend/engine/open-multi-agent/index.js`:
```js
/**
 * Open Multi-Agent engine modules for MOL.
 * @origin: open-multi-agent (https://github.com/JackChen-me/open-multi-agent)
 *
 * Ported from TypeScript to CommonJS for Express backend compatibility.
 * Original folder structure preserved under src/backend/engine/open-multi-agent/
 */

const { extractJSON, validate, validateAndRetry } = require('./structured-output');
const { LoopDetector } = require('./loop-detector');
const { Semaphore } = require('./semaphore');

module.exports = {
  extractJSON,
  validate,
  validateAndRetry,
  LoopDetector,
  Semaphore,
};
```

- [ ] **Step 6: zod 의존성 추가**

```bash
cd C:/DK/MOL/openmolt
npm install zod
```

- [ ] **Step 7: 기본 테스트**

```bash
node -e "
const { validate } = require('./src/backend/engine/open-multi-agent/structured-output');
const { z } = require('zod');
const schema = z.object({ interested: z.boolean(), score: z.number() });
const r1 = validate('{\"interested\":true,\"score\":0.8}', schema);
console.log('valid:', r1.success); // true
const r2 = validate('{\"interested\":\"yes\"}', schema);
console.log('invalid:', r2.success, r2.error); // false
const { LoopDetector } = require('./src/backend/engine/open-multi-agent/loop-detector');
const d = new LoopDetector({ maxRepeats: 2 });
d.recordToolCall('search', {q:'test'});
d.recordToolCall('search', {q:'test'});
console.log('loop:', d.isLooping()); // true
console.log('ALL PASS');
"
```
Expected: `valid: true`, `invalid: false`, `loop: true`, `ALL PASS`

- [ ] **Step 8: 커밋**

```bash
git add src/backend/engine/ package.json package-lock.json
git commit -m "feat: add open-multi-agent engine modules (structured-output, loop-detector, semaphore)"
```

---

### Task 3: OJ 독립 모듈 복사 (openjarvis → mol-engine)

**Files:**
- Create: `mol-engine/openjarvis/__init__.py`
- Copy: `mol-engine/openjarvis/workflow/` (graph.py, types.py, builder.py, engine.py, loader.py)
- Copy: `mol-engine/openjarvis/learning/routing/complexity.py`

**Source:** `C:/DK/MOL/openmolt/openjarvis/src/openjarvis/`

- [ ] **Step 1: 디렉토리 생성**

```bash
cd C:/DK/MOL/openmolt/mol-engine
mkdir -p openjarvis/workflow openjarvis/learning/routing
```

- [ ] **Step 2: openjarvis/__init__.py**

```bash
cat > openjarvis/__init__.py << 'EOF'
"""OpenJarvis modules for MOL Engine.

@origin: openmolt/openjarvis/src/openjarvis/
Submodules: traces/, learning/, workflow/, intelligence/
"""
EOF
```

- [ ] **Step 3: workflow/ 복사 (독립 — 외부 의존 없음)**

```bash
cp ../openjarvis/src/openjarvis/workflow/__init__.py openjarvis/workflow/
cp ../openjarvis/src/openjarvis/workflow/types.py openjarvis/workflow/
cp ../openjarvis/src/openjarvis/workflow/graph.py openjarvis/workflow/
cp ../openjarvis/src/openjarvis/workflow/builder.py openjarvis/workflow/
cp ../openjarvis/src/openjarvis/workflow/loader.py openjarvis/workflow/
cp ../openjarvis/src/openjarvis/workflow/engine.py openjarvis/workflow/
```

- [ ] **Step 4: workflow import 경로 수정**

`openjarvis/workflow/` 내 모든 파일에서:
```
# 변경 전
from openjarvis.workflow.graph import WorkflowGraph
from openjarvis.core.events import EventBus, EventType
# 변경 후 (상대경로)
from .graph import WorkflowGraph
# EventBus는 optional로 변경 (mol-engine에서는 불필요)
```

`openjarvis/workflow/engine.py` 수정:
```python
# 기존
from openjarvis.core.events import EventBus, EventType
from openjarvis.workflow.graph import WorkflowGraph
from openjarvis.workflow.types import (...)
# 변경
from .graph import WorkflowGraph
from .types import (...)

# EventBus를 optional로
try:
    from openjarvis.core.events import EventBus, EventType
except ImportError:
    EventBus = None
    EventType = None
```

`openjarvis/workflow/graph.py` 수정:
```python
# 기존
from openjarvis.workflow.types import WorkflowEdge, WorkflowNode
# 변경
from .types import WorkflowEdge, WorkflowNode
```

`openjarvis/workflow/builder.py` 수정:
```python
# 기존
from openjarvis.workflow.graph import WorkflowGraph
from openjarvis.workflow.types import ...
# 변경
from .graph import WorkflowGraph
from .types import ...
```

- [ ] **Step 5: complexity.py 복사**

```bash
cp ../openjarvis/src/openjarvis/learning/routing/complexity.py openjarvis/learning/routing/
touch openjarvis/learning/__init__.py
touch openjarvis/learning/routing/__init__.py
```

`openjarvis/learning/routing/complexity.py` import 수정:
```python
# 기존 (있다면)
# from openjarvis.learning.routing._utils import ...
# 변경: 외부 의존 제거, 독립 함수로 유지
```

- [ ] **Step 6: 테스트**

```bash
cd C:/DK/MOL/openmolt/mol-engine
python -c "
from openjarvis.workflow.graph import WorkflowGraph
from openjarvis.workflow.types import WorkflowNode, WorkflowEdge

g = WorkflowGraph('test')
g.add_node(WorkflowNode(id='a', name='step-a', node_type='action'))
g.add_node(WorkflowNode(id='b', name='step-b', node_type='action'))
g.add_edge(WorkflowEdge(source='a', target='b'))
valid, msg = g.validate()
print(f'valid={valid}, msg={msg}')
stages = g.execution_stages()
print(f'stages={stages}')
print('PASS')
"
```
Expected: `valid=True`, stages 출력, `PASS`

- [ ] **Step 7: 커밋**

```bash
cd C:/DK/MOL/openmolt
git add mol-engine/openjarvis/
git commit -m "feat(mol-engine): add openjarvis workflow + complexity modules"
```

---

### Task 4: OS 독립 모듈 복사 (openspace → mol-engine)

**Files:**
- Create: `mol-engine/openspace/__init__.py`
- Copy: `mol-engine/openspace/skill_engine/types.py`
- Copy: `mol-engine/openspace/skill_engine/fuzzy_match.py`
- Copy: `mol-engine/openspace/skill_engine/skill_utils.py`

**Source:** `C:/DK/MOL/clone/OpenSpace/openspace/`

- [ ] **Step 1: 디렉토리 생성**

```bash
cd C:/DK/MOL/openmolt/mol-engine
mkdir -p openspace/skill_engine
```

- [ ] **Step 2: openspace/__init__.py**

```bash
cat > openspace/__init__.py << 'EOF'
"""OpenSpace modules for MOL Engine.

@origin: clone/OpenSpace/openspace/
Submodules: skill_engine/, cloud/, recording/
"""
EOF
```

- [ ] **Step 3: 독립 모듈 복사**

```bash
cp ../../clone/OpenSpace/openspace/skill_engine/types.py openspace/skill_engine/
cp ../../clone/OpenSpace/openspace/skill_engine/fuzzy_match.py openspace/skill_engine/
cp ../../clone/OpenSpace/openspace/skill_engine/skill_utils.py openspace/skill_engine/
touch openspace/skill_engine/__init__.py
```

- [ ] **Step 4: import 경로 수정**

`openspace/skill_engine/skill_utils.py` — `openspace.utils.logging` 의존 제거:
```python
# 기존
from openspace.utils.logging import Logger
# 변경
import logging
logger = logging.getLogger(__name__)
```

`openspace/skill_engine/types.py` — 독립, 수정 불필요 (dataclass + enum만)

`openspace/skill_engine/fuzzy_match.py` — 독립, 수정 불필요

- [ ] **Step 5: 테스트**

```bash
cd C:/DK/MOL/openmolt/mol-engine
python -c "
from openspace.skill_engine.types import EvolutionType, SkillOrigin
print(f'FIX={EvolutionType.FIX}')
print(f'DERIVED={EvolutionType.DERIVED}')
print(f'CAPTURED={EvolutionType.CAPTURED}')
print(f'origin={SkillOrigin.INITIAL}')
print('PASS')
"
```
Expected: 3개 EvolutionType + origin 출력, `PASS`

- [ ] **Step 6: 커밋**

```bash
cd C:/DK/MOL/openmolt
git add mol-engine/openspace/
git commit -m "feat(mol-engine): add openspace skill_engine types + utils"
```

---

## Phase 1: 가벼운 연동

### Task 5: OJ traces/ 복사 + 기존 trace_store 연동

**Files:**
- Copy: `mol-engine/openjarvis/traces/` (analyzer.py, collector.py, store.py)
- Modify: `mol-engine/openjarvis/traces/analyzer.py` — core/trace_store 연동

**Source:** `C:/DK/MOL/openmolt/openjarvis/src/openjarvis/traces/`

- [ ] **Step 1: 복사**

```bash
cd C:/DK/MOL/openmolt/mol-engine
mkdir -p openjarvis/traces
cp ../openjarvis/src/openjarvis/traces/__init__.py openjarvis/traces/
cp ../openjarvis/src/openjarvis/traces/analyzer.py openjarvis/traces/
cp ../openjarvis/src/openjarvis/traces/collector.py openjarvis/traces/
cp ../openjarvis/src/openjarvis/traces/store.py openjarvis/traces/
```

- [ ] **Step 2: analyzer.py 의존성 수정**

`openjarvis/traces/analyzer.py`:
```python
# 기존
from openjarvis.core.types import StepType, Trace, TraceStep
from openjarvis.traces.store import TraceStore
# 변경 — mol-engine의 core/trace_store.py 래핑
from .store import TraceStore

# StepType, Trace 등은 로컬 정의 (원본 core.types에서 추출)
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from enum import Enum

class StepType(Enum):
    GENERATE = "generate"
    TOOL_CALL = "tool_call"
    MEMORY = "memory"
    ROUTING = "routing"

@dataclass
class TraceStep:
    step_type: StepType
    input: Dict[str, Any] = field(default_factory=dict)
    output: str = ""
    duration_ms: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0

@dataclass
class Trace:
    trace_id: str
    query: str = ""
    agent: str = ""
    outcome: str = ""
    feedback: Optional[float] = None
    steps: List[TraceStep] = field(default_factory=list)
    duration_ms: float = 0.0
    created_at: float = 0.0
```

- [ ] **Step 3: store.py — 기존 core/trace_store.py 래핑 어댑터**

`openjarvis/traces/store.py` 전체 교체:
```python
"""TraceStore adapter — wraps mol-engine core/trace_store.py for OJ analyzer compatibility.

@origin: openjarvis/src/openjarvis/traces/store.py (interface only)
"""
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# mol-engine의 기존 trace_store 사용
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from core.trace_store import TraceStore as _CoreTraceStore

from .analyzer import Trace, TraceStep, StepType


class TraceStore:
    """Adapter over core.trace_store for OJ TraceAnalyzer compatibility."""

    def __init__(self, core_store: Optional[_CoreTraceStore] = None):
        self._core = core_store or _CoreTraceStore()

    def list_traces(self, *, limit: int = 1000) -> List[Trace]:
        """Convert core traces to OJ Trace format."""
        rows = self._core.search(limit=limit)
        traces = []
        for row in rows:
            traces.append(Trace(
                trace_id=row.get('trace_id', ''),
                query=row.get('input_text', ''),
                agent=row.get('agent_name', ''),
                outcome=row.get('outcome', ''),
                feedback=row.get('feedback'),
                steps=[TraceStep(
                    step_type=StepType.GENERATE,
                    input={'text': row.get('input_text', '')},
                    output=row.get('output_text', ''),
                )],
                created_at=row.get('created_at', 0),
            ))
        return traces

    def record(self, data: Dict[str, Any]):
        self._core.record(data)

    def close(self):
        self._core.close()
```

- [ ] **Step 4: 테스트**

```bash
cd C:/DK/MOL/openmolt/mol-engine
python -c "
from openjarvis.traces.analyzer import TraceAnalyzer, Trace, TraceStep, StepType

# 빈 분석 테스트
class FakeStore:
    def list_traces(self, limit=1000):
        return [Trace(trace_id='t1', query='test', agent='seohyun', outcome='success', feedback=0.8)]

analyzer = TraceAnalyzer(FakeStore())
summary = analyzer.summary()
print(f'total_traces={summary.total_traces}')
print('PASS')
"
```
Expected: `total_traces=1`, `PASS`

- [ ] **Step 5: 커밋**

```bash
cd C:/DK/MOL/openmolt
git add mol-engine/openjarvis/traces/
git commit -m "feat(mol-engine): add openjarvis traces analyzer with core adapter"
```

---

### Task 6: OJ learning/routing/ 복사 + LLM 프로바이더 매핑

**Files:**
- Copy: `mol-engine/openjarvis/learning/routing/` (router.py, heuristic_reward.py, _utils.py, heuristic_policy.py)
- Modify: `mol-engine/openjarvis/learning/routing/router.py` — core/llm 프로바이더 매핑

- [ ] **Step 1: 복사**

```bash
cd C:/DK/MOL/openmolt/mol-engine
cp ../openjarvis/src/openjarvis/learning/routing/router.py openjarvis/learning/routing/
cp ../openjarvis/src/openjarvis/learning/routing/heuristic_reward.py openjarvis/learning/routing/
cp ../openjarvis/src/openjarvis/learning/routing/heuristic_policy.py openjarvis/learning/routing/
cp ../openjarvis/src/openjarvis/learning/routing/_utils.py openjarvis/learning/routing/
cp ../openjarvis/src/openjarvis/learning/_stubs.py openjarvis/learning/
```

- [ ] **Step 2: router.py import 수정**

```python
# 기존
from openjarvis.core.registry import ModelRegistry
from openjarvis.learning._stubs import QueryAnalyzer, RouterPolicy
# 변경
from .._stubs import QueryAnalyzer, RouterPolicy

# ModelRegistry 대체 — mol-engine LLM 프로바이더 기반
class _MolModelRegistry:
    """Simple model registry mapping MOL LLM providers to metadata."""
    _MODELS = {
        'qwen-turbo': {'parameter_count_b': 7, 'cost_per_1m': 0.05},
        'qwen3.5-flash': {'parameter_count_b': 32, 'cost_per_1m': 0.10},
        'qwen3.5-plus': {'parameter_count_b': 72, 'cost_per_1m': 0.40},
        'gemini-2.5-flash-lite': {'parameter_count_b': 27, 'cost_per_1m': 0.15},
    }

    @classmethod
    def get(cls, key):
        data = cls._MODELS.get(key, {'parameter_count_b': 0})
        class _Spec:
            parameter_count_b = data['parameter_count_b']
        return _Spec()

ModelRegistry = _MolModelRegistry
```

- [ ] **Step 3: 나머지 파일 import 수정**

`heuristic_reward.py`, `heuristic_policy.py`, `_utils.py` — 모두:
```python
# from openjarvis.xxx → 상대경로
from .._stubs import ...
from .complexity import ...
```

- [ ] **Step 4: 테스트**

```bash
cd C:/DK/MOL/openmolt/mol-engine
python -c "
from openjarvis.learning.routing.complexity import score_complexity
result = score_complexity('간단한 질문')
print(f'score={result.score}, tier={result.tier}')
result2 = score_complexity('복잡한 멀티스텝 코드 리팩토링과 아키텍처 분석을 해주세요. 테스트도 작성하고 문서화도 필요합니다.')
print(f'score2={result2.score}, tier2={result2.tier}')
print('PASS')
"
```

- [ ] **Step 5: 커밋**

```bash
cd C:/DK/MOL/openmolt
git add mol-engine/openjarvis/learning/
git commit -m "feat(mol-engine): add openjarvis routing (complexity + heuristic router)"
```

---

### Task 7: OS skill_engine 핵심 복사 (evolver, analyzer, store, registry, patch)

**Files:**
- Copy: `mol-engine/openspace/skill_engine/` (evolver.py, analyzer.py, store.py, registry.py, patch.py, skill_ranker.py, retrieve_tool.py, conversation_formatter.py)

- [ ] **Step 1: 복사**

```bash
cd C:/DK/MOL/openmolt/mol-engine
cp ../../clone/OpenSpace/openspace/skill_engine/evolver.py openspace/skill_engine/
cp ../../clone/OpenSpace/openspace/skill_engine/analyzer.py openspace/skill_engine/
cp ../../clone/OpenSpace/openspace/skill_engine/store.py openspace/skill_engine/
cp ../../clone/OpenSpace/openspace/skill_engine/registry.py openspace/skill_engine/
cp ../../clone/OpenSpace/openspace/skill_engine/patch.py openspace/skill_engine/
cp ../../clone/OpenSpace/openspace/skill_engine/skill_ranker.py openspace/skill_engine/
cp ../../clone/OpenSpace/openspace/skill_engine/retrieve_tool.py openspace/skill_engine/
cp ../../clone/OpenSpace/openspace/skill_engine/conversation_formatter.py openspace/skill_engine/
```

- [ ] **Step 2: 전체 import 경로 일괄 수정**

모든 파일에서:
```python
# from openspace.utils.logging import Logger → 표준 logging
import logging
logger = logging.getLogger(__name__)

# from openspace.prompts import ... → 인라인 또는 별도 prompts.py로
# from openspace.llm import LLMClient → TYPE_CHECKING only (나중에 연동)
# from openspace.grounding.core.tool import BaseTool → TYPE_CHECKING only
# from openspace.config.constants import PROJECT_ROOT → 동적 계산
```

`openspace/skill_engine/__init__.py` 업데이트:
```python
"""OpenSpace Skill Engine for MOL.
@origin: OpenSpace/openspace/skill_engine/
"""
from .types import (
    EvolutionSuggestion, EvolutionType, ExecutionAnalysis,
    SkillCategory, SkillJudgment, SkillOrigin, SkillLineage,
    SkillRecord, SkillVisibility,
)

__all__ = [
    'EvolutionSuggestion', 'EvolutionType', 'ExecutionAnalysis',
    'SkillCategory', 'SkillJudgment', 'SkillOrigin', 'SkillLineage',
    'SkillRecord', 'SkillVisibility',
]
```

- [ ] **Step 3: store.py — SQLite 경로 MOL용으로 수정**

```python
# 기존
from openspace.config.constants import PROJECT_ROOT
# 변경
from pathlib import Path
PROJECT_ROOT = Path(__file__).parent.parent.parent  # mol-engine/
```

DB 경로: `mol-engine/data/skill_store.db` (Phase 3에서 Supabase로 이관)

- [ ] **Step 4: 테스트**

```bash
cd C:/DK/MOL/openmolt/mol-engine
python -c "
from openspace.skill_engine.types import EvolutionType, SkillRecord, SkillOrigin
print(f'FIX={EvolutionType.FIX.value}')

from openspace.skill_engine.store import SkillStore
store = SkillStore()
print(f'store initialized, tables created')
print('PASS')
"
```

- [ ] **Step 5: 커밋**

```bash
cd C:/DK/MOL/openmolt
git add mol-engine/openspace/skill_engine/
git commit -m "feat(mol-engine): add openspace skill_engine (evolver, analyzer, store)"
```

---

### Task 8: ORIGIN.md 업데이트 + 최종 Phase 0-1 확인

**Files:**
- Modify: `mol-engine/ORIGIN.md`

- [ ] **Step 1: ORIGIN.md에 실제 커밋 SHA 기록**

```bash
cd C:/DK/MOL/openmolt
OJ_SHA=$(cd openjarvis && git rev-parse --short HEAD 2>/dev/null || echo "local")
OMA_SHA=$(cd ../clone/open-multi-agent && git rev-parse --short HEAD 2>/dev/null || echo "local")
OS_SHA=$(cd ../clone/OpenSpace && git rev-parse --short HEAD 2>/dev/null || echo "local")
echo "OJ=$OJ_SHA OMA=$OMA_SHA OS=$OS_SHA"
```

ORIGIN.md에 커밋 SHA 반영.

- [ ] **Step 2: 전체 import 테스트**

```bash
cd C:/DK/MOL/openmolt/mol-engine
python -c "
# OJ modules
from openjarvis.workflow.graph import WorkflowGraph
from openjarvis.traces.analyzer import TraceAnalyzer
from openjarvis.learning.routing.complexity import score_complexity
print('[OJ] workflow, traces, routing: OK')

# OS modules
from openspace.skill_engine.types import EvolutionType
from openspace.skill_engine.store import SkillStore
print('[OS] skill_engine: OK')

print('ALL IMPORTS PASS')
"
```

```bash
cd C:/DK/MOL/openmolt
node -e "
const engine = require('./src/backend/engine/open-multi-agent');
console.log('[OMA] exports:', Object.keys(engine).join(', '));
console.log('ALL IMPORTS PASS');
"
```

- [ ] **Step 3: 커밋**

```bash
cd C:/DK/MOL/openmolt
git add mol-engine/ORIGIN.md
git commit -m "docs: update ORIGIN.md with source commit SHAs"
```

---

## Phase 2-4: 후속 플랜 (별도 문서)

> Phase 2 (AGTHUB 연동), Phase 3 (Supabase 연동), Phase 4 (CGB 연동)는
> Phase 0-1 완료 후 별도 플랜으로 작성한다.
> 스펙: `docs/superpowers/specs/2026-04-07-mol-engine-rearchitecture-design.md`

---

## Summary

| Task | Phase | 내용 | 파일 수 |
|------|-------|------|--------|
| 1 | 0 | openjarvis-bridge → mol-engine 리네임 | 3 |
| 2 | 0 | OMA 독립 모듈 (structured-output, loop-detector, semaphore) | 4 |
| 3 | 0 | OJ workflow/ + complexity 복사 | ~8 |
| 4 | 0 | OS skill_engine types/utils 복사 | ~4 |
| 5 | 1 | OJ traces/ + core adapter | ~4 |
| 6 | 1 | OJ learning/routing/ + LLM 매핑 | ~6 |
| 7 | 1 | OS skill_engine 핵심 (evolver, analyzer, store) | ~9 |
| 8 | 1 | ORIGIN.md + 최종 확인 | 1 |
| **Total** | | | **~39** |
