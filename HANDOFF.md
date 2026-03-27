# Handoff — 2026-03-27 세션

## 오늘 한 것

### 1. 에이전트 재설계 B안 실행
- DB: 243개 랜덤 에이전트 `is_active=false`
- saju 20개 → 한국 이름 + 격국 기반 아키타입
  - creator:5, critic:4, provocateur:3, connector:4, expert:4
- 시리즈 작가 재할당: 시우(소설), 연우(웹툰), 서현(웹툰)

### 2. OpenJarvis Bridge 서비스 (`openjarvis-bridge/`)
- FastAPI:5000, 16 API endpoints
- 듀얼 LLM: Ollama (로컬) + Workers AI (프로덕션, 무료)
- AgentRegistry: AGTHUB 폴더 스캔 → 20명 로드
- Interest scoring: SOUL.md + saju → Ollama LLM 판단
- Trace 수집: SQLite (학습 파이프라인 입력)
- Learning API: LoRA 학습 트리거 + Workers AI 배포 (placeholder)

### 3. AGTHUB 에이전트 파일 생성
- `scripts/export-agents-to-agthub.py` → DB에서 자동 생성
- 20명 x (agent.yaml + SOUL.md + RULES.md + knowledge/saju.yaml) = 99파일
- `AGTHUB/agents/{name}/` 구조

### 4. AgentLifecycle.js 수정
- interest scoring: domain matching → Bridge batch 호출
- trace 기록: 모든 action 후 Bridge에 전송
- RSS: expertise_topics 기반 피드 선택

### 5. 프론트엔드
- `/agents` 페이지: 아키타입 필터 + 사주 격국 태그
- `/api/agents/directory` 엔드포인트 (saju JOIN)
- `_config.ts`: NEXT_PUBLIC_API_URL fallback 추가

### 6. 메모리 재구조화 (4개 신규)
- `system/agthub-architecture.md` — 전체 통합 아키텍처
- `system/data-flow.md` — 4대 플로우 (탄생/자율행동/학습/배포)
- `agent/agthub-spec.md` — AGTHUB 폴더 스펙
- `agent/saju-to-agent-mapping.md` — 사주→아키타입 변환 규칙
- `system/llm-routing.md` — LLM 통합 라우팅 설계 (TODO)

### 커밋
- `db65205` feat: agent redesign — AGTHUB + OpenJarvis bridge + dual LLM
- `a93d9b7` fix: API_BASE fallback to NEXT_PUBLIC_API_URL for local dev

---

## 테스트 결과
- Playwright: 60 passed / 3 failed (기존 Next.js 캐싱 이슈, 무관)
- Bridge API 9-step 통합 테스트: ALL PASSED
- Cross-agent 성격 테스트: 서현(소설 0.8) vs 민지(소설 0.05) — 사주 반영 확인
- 시리즈 작가 연동: 시우/연우/서현 정상

---

## 미해결 — 다음 세션

### 최우선: LLM 라우팅 통합
**현재 문제:** interest check만 Bridge 경유. 댓글/글 생성은 Express에서 Gemini 직접 호출 → SOUL.md 미사용.

```
현재: Express → google.call() → DB persona (짧음)
목표: Express → Bridge → Ollama/Gemini → SOUL.md (풍부)
```

필요한 작업:
1. Bridge에 `/v1/generate/comment`, `/v1/generate/post` API 추가
2. Bridge에 Gemini 프로바이더 추가 (`core/llm/gemini_provider.py`)
3. TaskWorker.js → Bridge 호출로 전환
4. 웹툰 이미지는 Gemini 전용 유지

상세: `memory/system/llm-routing.md`

### 그 다음
- OpenJarvis LoRATrainer 실제 연동 (trace 충분히 쌓인 후)
- DB 트리거: 사주 INSERT → 자동 에이전트 생성
- Workers AI LoRA 업로드 테스트
- 프로덕션 배포 (Railway에 Bridge 추가)
- AGTHUB `skills/*.toml` 실제 스킬 정의

---

## 실행법
```bash
# Bridge (Ollama 필요)
cd openjarvis-bridge && python server.py

# Goodmolt
cd openmolt && npm run dev
```
