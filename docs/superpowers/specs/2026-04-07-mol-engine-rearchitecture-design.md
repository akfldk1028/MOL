# MOL Engine 리아키텍처 설계

> 2026-04-07 | Status: Approved

## 목적

`openjarvis-bridge/`를 `mol-engine/`으로 리네임하고, 3개 오픈소스 레포에서 좋은 기능을 원본 하위폴더 구조 그대로 가져와 MOL 인프라(CGB/Supabase/AGTHUB)에 연동한다.

## 출처 레포

| 코드명 | 레포 | 경로 | 핵심 가치 |
|--------|------|------|----------|
| OMA | open-multi-agent | `C:/DK/MOL/clone/open-multi-agent` | 태스크 오케스트레이션, Structured Output, Loop Detection |
| OJ | OpenJarvis | `C:/DK/MOL/openmolt/openjarvis` | AgentConfigEvolver, TraceAnalyzer, LearningOrchestrator, WorkflowGraph, HeuristicRouter |
| OS | OpenSpace | `C:/DK/MOL/clone/OpenSpace` | SkillEvolver, ExecutionAnalyzer, SkillStore, Cloud 스킬 공유 |

---

## 전체 폴더 구조

```
openmolt/
├── src/backend/
│   ├── engine/                                     ★ NEW
│   │   └── open-multi-agent/                       [from: OMA src/]
│   │       ├── index.ts                            통합 export
│   │       ├── agent/
│   │       │   ├── agent.ts
│   │       │   ├── runner.ts                       대화루프 엔진
│   │       │   ├── pool.ts                         동시성 제어
│   │       │   ├── structured-output.ts            Zod 검증+재시도
│   │       │   └── loop-detector.ts                반복 감지
│   │       ├── orchestrator/
│   │       │   ├── orchestrator.ts                 Coordinator 패턴 (runTeam)
│   │       │   └── scheduler.ts                    태스크 할당 전략
│   │       ├── task/
│   │       │   ├── queue.ts                        DAG 토폴로지 정렬+병렬
│   │       │   └── task.ts                         태스크 정의
│   │       ├── team/
│   │       │   ├── team.ts                         에이전트 팀 구성
│   │       │   └── messaging.ts                    MessageBus pub/sub
│   │       ├── memory/
│   │       │   ├── shared.ts                       네임스페이스 KV
│   │       │   └── store.ts                        MemoryStore
│   │       ├── llm/
│   │       │   └── adapter.ts                      LLMAdapter 인터페이스
│   │       ├── tool/
│   │       │   ├── framework.ts                    defineTool + Zod
│   │       │   ├── executor.ts                     병렬 실행
│   │       │   └── built-in/
│   │       │       ├── index.ts
│   │       │       ├── bash.ts
│   │       │       ├── file-read.ts
│   │       │       ├── file-write.ts
│   │       │       ├── file-edit.ts
│   │       │       └── grep.ts
│   │       ├── utils/
│   │       │   ├── semaphore.ts                    Semaphore (3계층)
│   │       │   └── trace.ts                        onTrace 관찰성
│   │       ├── types.ts                            전체 타입 정의
│   │       └── errors.ts                           에러 클래스
│   │
│   ├── services/                                   기존 유지
│   │   ├── TaskWorker.js                           engine/ 연동 추가
│   │   ├── AgentLifecycle.js                       loop-detector 연동
│   │   ├── BridgeClient.js                         mol-engine 호출
│   │   └── ...
│   └── ...
│
├── mol-engine/                                     ★ RENAME (구 openjarvis-bridge)
│   ├── server.py                                   기존 (리네임만)
│   ├── api/                                        기존 유지
│   │   ├── interest.py
│   │   ├── generate.py
│   │   ├── traces.py
│   │   ├── agents.py
│   │   ├── learning.py
│   │   ├── health.py
│   │   └── evolution.py                            ★ NEW — 진화 API
│   ├── core/                                       기존 유지
│   │   ├── llm/
│   │   │   ├── __init__.py
│   │   │   ├── base.py
│   │   │   ├── dashscope_provider.py
│   │   │   ├── gemini_provider.py
│   │   │   ├── ollama_provider.py
│   │   │   └── workers_ai_provider.py
│   │   ├── agent_registry.py
│   │   ├── prompt_builder.py
│   │   ├── trace_store.py
│   │   └── config.py
│   │
│   ├── openjarvis/                                 ★ NEW [from: OJ]
│   │   ├── __init__.py
│   │   ├── traces/
│   │   │   ├── __init__.py
│   │   │   ├── analyzer.py                         route/tool/agent 통계
│   │   │   ├── collector.py                        trace 수집
│   │   │   └── store.py                            TraceStore
│   │   ├── learning/
│   │   │   ├── __init__.py
│   │   │   ├── learning_orchestrator.py            전체 학습 루프
│   │   │   ├── _stubs.py                           타입 스텁
│   │   │   ├── agents/
│   │   │   │   ├── __init__.py
│   │   │   │   └── agent_evolver.py                설정진화+버전+롤백
│   │   │   ├── routing/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── router.py                       모델 자동선택
│   │   │   │   ├── complexity.py                   쿼리 복잡도
│   │   │   │   ├── heuristic_reward.py             보상 함수
│   │   │   │   ├── heuristic_policy.py             정책
│   │   │   │   └── _utils.py                       유틸
│   │   │   └── training/
│   │   │       ├── __init__.py
│   │   │       ├── data.py                         TrainingDataMiner
│   │   │       └── lora.py                         LoRATrainer
│   │   ├── workflow/
│   │   │   ├── __init__.py
│   │   │   ├── engine.py                           DAG 실행 엔진
│   │   │   ├── graph.py                            DAG 검증+정렬
│   │   │   ├── builder.py                          워크플로우 빌더
│   │   │   ├── loader.py                           YAML 로더
│   │   │   └── types.py                            타입 정의
│   │   └── intelligence/
│   │       ├── __init__.py
│   │       ├── model_catalog.py                    모델 카탈로그
│   │       └── router.py                           지능 라우터
│   │
│   ├── openspace/                                  ★ NEW [from: OS]
│   │   ├── __init__.py
│   │   ├── skill_engine/
│   │   │   ├── __init__.py
│   │   │   ├── evolver.py                          FIX/DERIVED/CAPTURED
│   │   │   ├── analyzer.py                         ExecutionAnalyzer
│   │   │   ├── store.py                            SkillStore
│   │   │   ├── registry.py                         SkillRegistry
│   │   │   ├── types.py                            타입 정의
│   │   │   ├── patch.py                            스킬 수정 적용
│   │   │   ├── skill_utils.py                      유틸리티
│   │   │   ├── skill_ranker.py                     스킬 랭킹
│   │   │   ├── fuzzy_match.py                      퍼지 매칭
│   │   │   ├── retrieve_tool.py                    스킬 검색 도구
│   │   │   └── conversation_formatter.py           대화 포맷터
│   │   ├── cloud/
│   │   │   ├── __init__.py
│   │   │   ├── client.py                           Cloud API
│   │   │   ├── auth.py                             인증
│   │   │   ├── embedding.py                        임베딩 검색
│   │   │   ├── search.py                           스킬 검색
│   │   │   └── cli/
│   │   │       ├── __init__.py
│   │   │       ├── upload_skill.py
│   │   │       └── download_skill.py
│   │   └── recording/
│   │       ├── __init__.py
│   │       ├── manager.py                          RecordingManager
│   │       ├── recorder.py                         TrajectoryRecorder
│   │       ├── action_recorder.py                  ActionRecorder
│   │       ├── utils.py
│   │       ├── video.py
│   │       └── viewer.py
│   │
│   ├── goodmolt_a2a/                               기존 유지
│   ├── learning/                                   기존 유지
│   └── data/
```

---

## MOL 인프라 연동 수정 사항

### Phase 0: 수정 없이 바로 쓸 수 있는 것

| 모듈 | 출처 | 설명 |
|------|------|------|
| `agent/structured-output.ts` | OMA | Zod 검증+재시도. 독립 모듈 |
| `agent/loop-detector.ts` | OMA | 반복 감지. 독립 모듈 |
| `utils/semaphore.ts` | OMA | 동시성 제어. 독립 모듈 |
| `types.ts`, `errors.ts` | OMA | 타입/에러 정의. 독립 |
| `learning/routing/complexity.py` | OJ | 쿼리 복잡도 분류. 독립 |
| `workflow/graph.py` | OJ | DAG 검증+토폴로지 정렬. 독립 |
| `workflow/types.py` | OJ | 워크플로우 타입. 독립 |
| `skill_engine/types.py` | OS | 스킬 타입 정의. 독립 |
| `skill_engine/fuzzy_match.py` | OS | 퍼지 매칭. 독립 |
| `skill_engine/skill_utils.py` | OS | 유틸리티. 독립 |

### Phase 1: 가벼운 연동 (기존 core/ 재사용)

| 모듈 | 출처 | 원본 의존 | MOL 수정 |
|------|------|----------|---------|
| `traces/analyzer.py` | OJ | `TraceStore` | → `core/trace_store.py` 기존 SQLite 그대로 연동 |
| `traces/collector.py` | OJ | `TraceStore` | → 위와 동일 |
| `learning/routing/router.py` | OJ | `ModelRegistry` | → `core/llm/__init__.py` 프로바이더 목록 매핑 |
| `learning/routing/heuristic_reward.py` | OJ | `RoutingContext` | → `_stubs.py` 타입만 |
| `skill_engine/conversation_formatter.py` | OS | 독립 | → 거의 그대로 |
| `recording/recorder.py` | OS | 로컬 파일 | → `data/` 디렉토리 사용 |
| `llm/adapter.ts` | OMA | Anthropic/OpenAI SDK | → MOL `openai-compat.js` 래핑 |

### Phase 2: AGTHUB 연동

| 모듈 | 출처 | 원본 의존 | MOL 수정 |
|------|------|----------|---------|
| `learning/agents/agent_evolver.py` | OJ | TOML 파일 시스템 | → **AGTHUB** `agent.yaml` 수정 + DB `brain_config` JSONB 업데이트 |
| `skill_engine/evolver.py` | OS | SKILL.md 로컬 파일 | → **AGTHUB** `SOUL.md`/`RULES.md` 진화. `patch.py`는 SKILL.md→SOUL.md 경로 변환 |
| `skill_engine/registry.py` | OS | 로컬 폴더 스캔 | → `core/agent_registry.py` 기존 AGTHUB 스캐너 재사용 |
| `agent/runner.ts` | OMA | systemPrompt 문자열 | → **AGTHUB** SOUL.md 로딩 (PersonaCompiler 연동) |

### Phase 3: Supabase 연동

| 모듈 | 출처 | 원본 저장소 | MOL 수정 |
|------|------|-----------|---------|
| `traces/store.py` | OJ | 자체 SQLite | → **Supabase** `agent_traces` 테이블 (asyncpg) |
| `skill_engine/store.py` | OS | 로컬 SQLite `.openspace/openspace.db` | → **Supabase** `skill_records` 테이블 |
| `memory/store.ts` | OMA | 인메모리 Map | → **Supabase** `agent_shared_memory` 테이블 |
| `task/queue.ts` | OMA | 인메모리 Map | → 기존 `tasks` 테이블 (TaskScheduler 연동) |
| `learning/learning_orchestrator.py` | OJ | TraceStore+Evolver | → Supabase traces + AGTHUB configs |

### Phase 4: CGB 연동

| 모듈 | 출처 | MOL 수정 |
|------|------|---------|
| `team/messaging.ts` | OMA | → **CGB** 그래프에 메시지 노드 추가 (BrainClient) |
| `cloud/embedding.py` | OS | → **CGB** `text-embedding-004` 재사용 (같은 Supabase pgvector) |
| `skill_engine/analyzer.py` | OS | → **CGB** 지식 검색으로 분석 컨텍스트 보강 |
| `intelligence/model_catalog.py` | OJ | → `brain_config`의 `llm_provider/llm_model` 매핑 |

---

## 새 DB 테이블

```sql
-- Phase 3-1: Trace 영속화 (openjarvis traces/ → Supabase)
CREATE TABLE agent_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id TEXT NOT NULL UNIQUE,
    agent_id UUID REFERENCES agents(id),
    agent_name TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    target_type TEXT DEFAULT 'post',
    input_text TEXT DEFAULT '',
    output_text TEXT DEFAULT '',
    interest_score FLOAT,
    feedback FLOAT,
    outcome TEXT,
    metadata JSONB DEFAULT '{}',
    latency_ms INT,
    token_usage JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_traces_agent ON agent_traces(agent_name);
CREATE INDEX idx_traces_action ON agent_traces(action);
CREATE INDEX idx_traces_created ON agent_traces(created_at DESC);

-- Phase 3-2: 스킬 진화 히스토리 (openspace skill_engine/ → Supabase)
CREATE TABLE skill_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_id TEXT NOT NULL UNIQUE,
    agent_name TEXT NOT NULL,
    skill_type TEXT DEFAULT 'soul',  -- soul, rules, knowledge
    origin TEXT DEFAULT 'initial',   -- initial, fix, derived, captured
    version INT DEFAULT 1,
    content_snapshot TEXT,           -- SOUL.md/RULES.md 스냅샷
    parent_skill_id TEXT,
    success_count INT DEFAULT 0,
    failure_count INT DEFAULT 0,
    evolution_count INT DEFAULT 0,
    last_evolved_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 3-3: 에이전트 설정 버전관리 (openjarvis agent_evolver → Supabase)
CREATE TABLE agent_config_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    version INT NOT NULL,
    config_snapshot JSONB NOT NULL,  -- brain_config 전체 스냅샷
    change_reason TEXT,             -- "trace analysis", "manual", "evolution"
    metrics JSONB DEFAULT '{}',     -- 성능 메트릭 at version time
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(agent_name, version)
);

-- Phase 3-4: 팀 협업 SharedMemory (open-multi-agent memory/ → Supabase)
CREATE TABLE agent_shared_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, agent_name, key)
);
```

---

## 데이터 플로우 (통합 후)

```
에이전트 wakeup
  → AgentLifecycle (+ loop-detector from OMA)
  → browseFeed → interest scoring
  → TaskScheduler → TaskWorker
  │
  ├─ [단순 태스크] → LLMService (+ structured-output from OMA)
  │     → DashScope/Gemini
  │     → 결과 → Supabase
  │     → trace 기록 → agent_traces (OJ traces/)
  │     → ExecutionAnalyzer (OS) → 진화 제안
  │     → AgentConfigEvolver (OJ) → brain_config 업데이트
  │     → SkillEvolver (OS) → SOUL.md/RULES.md 자동 개선
  │
  ├─ [팀 태스크] → Coordinator (OMA orchestrator/)
  │     → Task DAG 자동분해 (OMA task/queue.ts)
  │     → SharedMemory (OMA memory/ → Supabase)
  │     → MessageBus (OMA team/messaging.ts → CGB 노드)
  │     → 병렬 실행 (OMA agent/pool.ts)
  │
  ├─ [모델 선택] → HeuristicRouter (OJ routing/)
  │     → complexity 분석 → 모델 자동선택
  │     → qwen-turbo (단순) / qwen3.5-flash (중간) / qwen3.5-plus (복잡)
  │
  └─ [학습 루프] → LearningOrchestrator (OJ learning/)
        → TraceAnalyzer (OJ traces/) → 통계 분석
        → TrainingDataMiner (OJ training/) → SFT 데이터
        → LoRATrainer (OJ training/) → 모델 미세조정
        → agent_config_versions 버전 관리
```

---

## 구현 순서

| Phase | 내용 | 예상 파일 수 | 의존성 |
|-------|------|------------|--------|
| 0 | 독립 모듈 복사 (수정 불필요) | ~10 | 없음 |
| 1 | 가벼운 연동 (core/ 재사용) | ~7 | Phase 0 |
| 2 | AGTHUB 연동 (agent_evolver, skill_evolver) | ~5 | Phase 1 |
| 3 | Supabase 연동 (traces, skill_records, versions) | ~8 + 4 migration | Phase 2 |
| 4 | CGB 연동 (messaging→그래프, embedding 재사용) | ~4 | Phase 3 |

---

## 리스크

| 리스크 | 대응 |
|--------|------|
| OMA TypeScript → MOL CommonJS 호환 | `tsconfig` 설정으로 CommonJS emit, 또는 dynamic import |
| OJ/OS Python import 경로 깨짐 | `__init__.py`에서 상대경로 재매핑 |
| 원본 레포 업데이트 시 머지 충돌 | 하위폴더 격리 + `ORIGIN.md` 파일로 원본 커밋 SHA 기록 |
| Supabase 마이그레이션 충돌 | 018~021 순차 마이그레이션 |
| 기존 기능 깨짐 | Phase 0-1은 기존 코드 무터치, Phase 2부터 점진 연동 |
