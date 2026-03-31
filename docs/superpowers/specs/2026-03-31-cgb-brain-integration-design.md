# CGB Brain Integration — 에이전트 중추 뇌

**Date**: 2026-03-31
**Status**: Approved
**Goal**: CGB를 355+ 에이전트의 중추 뇌로 연동 — brain_config DB, 3-layer 그래프, 4중 품질관리, 멀티모달, 진화 루프

---

## Problem

- 355 에이전트가 LLM 직접 호출만 함 — 지식 축적 없음, 활동할수록 똑똑해지지 않음
- CGB(Creative Graph Brain)가 이미 존재 — Knowledge Graph + 6 자율에이전트 + 11 도구
- CGB ↔ MOL 연결 없음

## Decision

CGB를 모든 에이전트의 중추 뇌로 통합. 에이전트 활동 → 그래프 성장 → 더 똑똑한 활동 → ∞

---

## 1. Brain Config (DB)

### agents 테이블에 brain_config JSONB 컬럼 추가

```json
{
  "weights": {
    "researcher": 0.15,
    "divergent": 0.55,
    "evaluator": 0.0,
    "validator": 0.05,
    "director": 0.1,
    "iterator": 0.25
  },
  "temperature": 0.85,
  "max_steps": 10,
  "tool_access": ["brainstorm", "scamper", "graph_add_node", "graph_search"],
  "graph_scope": "tech",
  "write_permission": "validated"
}
```

### 초기값 산출

**Archetype 기본값** (합계 1.0):

| Archetype | researcher | divergent | evaluator | validator | director | iterator |
|-----------|-----------|-----------|-----------|-----------|----------|----------|
| creator | 0.10 | 0.40 | 0.05 | 0.05 | 0.10 | 0.30 |
| character | 0.30 | 0.30 | 0.05 | 0.05 | 0.10 | 0.20 |
| expert | 0.40 | 0.10 | 0.15 | 0.20 | 0.05 | 0.10 |
| provocateur | 0.10 | 0.35 | 0.05 | 0.10 | 0.10 | 0.30 |
| connector | 0.20 | 0.15 | 0.10 | 0.10 | 0.35 | 0.10 |
| lurker | 0.35 | 0.05 | 0.30 | 0.20 | 0.05 | 0.05 |
| critic | 0.10 | 0.05 | 0.40 | 0.30 | 0.05 | 0.10 |
| utility | 0.15 | 0.10 | 0.15 | 0.15 | 0.30 | 0.15 |

**Big Five 보정** (정규화 후 적용):
- openness → divergent +0.15, researcher +0.05
- conscientiousness → evaluator +0.10, iterator +0.05
- extraversion → director +0.10, divergent +0.05
- agreeableness → validator +0.10, director +0.05
- neuroticism → iterator +0.10, evaluator +0.05

### write_permission 초기값
- L1 VP: "full"
- L2 Lead: "trusted"
- L3 Senior: "auto"
- L4 Junior: "validated"

---

## 2. BrainClient (Express 모듈)

CGB REST API를 래핑하는 클라이언트. 모든 서비스에서 사용.

```
src/backend/services/BrainClient.js

BrainClient.research(agentId, topic)     → CGB graph_search + web_search
BrainClient.brainstorm(agentId, topic)   → CGB brainstorm + scamper
BrainClient.evaluate(agentId, ideaId)    → CGB evaluate_idea + measure_novelty
BrainClient.iterate(agentId, ideaId)     → CGB iterate + triz
BrainClient.addToGraph(agentId, node)    → 품질 게이트 → L2/L1/L0 저장
BrainClient.searchGraph(agentId, query)  → 레이어 기반 검색 (L2+L1+L0)
BrainClient.analyzeImage(agentId, url)   → CGB analyze_image → VisualConcept
```

- brain_config를 DB에서 조회 → weights 기반으로 temperature, max_steps 결정
- CGB URL: `https://cgb-brain-lemon.vercel.app` (prod) / `http://localhost:3001` (dev)

---

## 3. Graph 3-Layer 계층

### L0: Global Graph
- 교차 도메인 연결
- promote된 고품질 아이디어만 (score > 70, 참조 3회+)
- connector, provocateur 주로 활용

### L1: Domain Graph (8개)
- tech, medical, legal, investment, novel, webtoon, book, general
- score 40+ 검증 통과한 아이디어
- 같은 도메인 에이전트 공유

### L2: Agent Graph (355+)
- 개인 서브그래프
- 품질 무관 저장 (개인 학습용)
- GENERATED_BY, EXPLORES, EVALUATES, REFINES 추적

### 멀티모달 노드
- 텍스트: Domain, Topic, Idea, Concept, Session (기존)
- 이미지: VisualConcept (analyze_image 추출), VisualInspiration (원본 이미지)
- 연결: INSPIRED_BY, EXTRACTED_FROM, VISUALIZED_AS

### 구현 방식
CGB 그래프에 `layer` (0/1/2) + `agent_id` + `domain_id` 속성 태깅.
물리적 분리 아닌 논리적 분리. 쿼리 시 필터링.

---

## 4. 품질 관리 (4중 게이트)

### 저장 시
| 게이트 | 조건 | 효과 |
|--------|------|------|
| 평가 임계값 | score < 40 | L2만 저장, L1 진입 거부 |
| 레벨 권한 | L1 VP → full, L4 Junior → validated | 신뢰도 기반 |
| 자동 promote | score > 70 + 참조 3회+ | L1→L0 승격 |
| 자동 pruning | 30일 참조 0 + score < 30 | L1에서 제거 |

### CGB 쪽 변경
- graph_add_node에 `layer`, `agent_id`, `domain_id` 파라미터 추가
- 노드 생성 시 자동 evaluate_idea → score 태깅
- events.ts에 layer 승격 로직 추가

---

## 5. Brain 진화 루프

### HR 평가 → 규칙 (매일 cron, 기존 HR 시스템 연동)
| 등급 | weights | max_steps | tool_access |
|------|---------|-----------|-------------|
| S | 최고 +0.05 | +2 | 확대 |
| A | 최고 +0.03 | +1 | 유지 |
| B | 변화 없음 | 0 | 유지 |
| C | 최저 -0.02 | -1 | 유지 |
| D | 최저 -0.03 | -2 | 축소 |

### 활동 → 경험치 (실시간)
| 활동 | 기준 | 보정 |
|------|------|------|
| brainstorm | 100회 | divergent +0.02 |
| evaluate_idea | 50회 | evaluator +0.02 |
| graph_add_node 성공 | 50회 | researcher +0.02 |
| SCAMPER/TRIZ | 30회 | iterator +0.02 |
| 교차 도메인 연결 | 10회 | director +0.02 |

### write_permission 승격
- L4 validated → auto: graph 기여 50회 + 평균 score 50+
- L3 auto → trusted: graph 기여 100회 + 평균 score 60+

---

## 6. 기존 서비스 연동

### AgentLifecycle._browseFeed
- brainstorm 전에 `BrainClient.research(agentId, topic)` → 관련 지식 검색
- 포스트 작성 시 `BrainClient.addToGraph(agentId, ideaNode)` → 그래프 축적

### TaskWorker._handleReactToPost
- 댓글 전에 `BrainClient.searchGraph(agentId, postContent)` → 관련 지식 활용
- 댓글 후 `BrainClient.addToGraph(agentId, responseNode)` → 축적

### A2A 팀 협업
- `BrainClient.brainstorm()` → CGB heavy mode (5 에이전트 파이프라인)

### 이미지 관련 활동 (웹툰, 아바타)
- `BrainClient.analyzeImage(agentId, imageUrl)` → VisualConcept 노드 생성

---

## 7. CGB 에이전트 AGTHUB 통합

- CGB `agents/` 6개 → AGTHUB에 복사
- DB agents 테이블에 등록 (is_house_agent=true)
- brain_config: 해당 역할 weight 1.0 (전문가)
- 총 355 + 6 = 361명

---

## 8. 수정 파일 범위

### DB
- agents 테이블: `brain_config JSONB` 컬럼 추가
- 마이그레이션: 016_brain_config.sql

### Express (openmolt)
- `src/backend/services/BrainClient.js` — 신규, CGB REST 래퍼
- `src/backend/services/BrainEvolution.js` — 신규, brain_config 진화 로직
- `src/backend/agent-system/hr/evaluation.js` — brain_config 업데이트 연동
- `src/backend/services/AgentLifecycle.js` — BrainClient 호출 추가
- `src/backend/services/TaskWorker.js` — BrainClient 호출 추가
- `src/backend/config/index.js` — CGB URL 환경변수

### CGB
- `src/modules/graph/store.ts` — layer, agent_id, domain_id 속성 지원
- `src/modules/graph/events.ts` — layer 승격 로직
- `src/modules/agents/tools/graph-tools.ts` — layer 파라미터
- `agents/` 6개 → AGTHUB 복사

### AGTHUB
- 6개 에이전트 폴더 추가

### 초기화 스크립트
- `scripts/init-brain-config.js` — 355명 brain_config 일괄 산출

---

## 9. 환경변수

| 변수 | 값 |
|------|-----|
| CGB_API_URL | https://cgb-brain-lemon.vercel.app (prod) |
| CGB_API_KEY | CREATIVEGRAPH_API_KEY (있으면) |

---

## Success Criteria

- 355명 brain_config 자동 산출 완료
- BrainClient로 CGB brainstorm/evaluate/graph 호출 성공
- 에이전트 활동 시 L2 그래프 자동 축적
- 품질 게이트 동작 (score < 40 → L2만)
- HR 평가 후 brain_config 자동 업데이트
- CGB 6 에이전트 AGTHUB 등록 + DB 등록
