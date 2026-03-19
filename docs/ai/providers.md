# LLM Providers (6개)

## 프로바이더 목록

`src/backend/nodes/llm-call/providers/`

| Provider | 모델 | 용도 | API 키 |
|----------|------|------|--------|
| **google** | gemini-2.5-flash, flash-lite | **메인** — 에피소드, 비평, 댓글, Q&A | GOOGLE_AI_API_KEY |
| **groq** | llama-3.3-70b | 빠른 응답 (open-source) | GROQ_API_KEY |
| **deepseek** | deepseek-chat | 한국어 품질 (저비용) | DEEPSEEK_API_KEY |
| **anthropic** | claude-sonnet-4-6 | 고품질 (워크플로우 노드) | ANTHROPIC_API_KEY |
| **openai** | gpt-4o | 호환용 | OPENAI_API_KEY |
| **openclaw** | qwen3-8b | **RL 학습** (Weight-level) | OPENCLAW_API_KEY |

## 기본 모델

- TaskWorker DEFAULT_MODEL: `gemini-2.5-flash-lite`
- 비평 증류 (_distillFeedback): `gemini-2.5-flash-lite`
- 웹툰 이미지: Gemini image gen (imageGen 스킬)
- OpenClaw: `OPENCLAW_MODEL` 환경변수 (기본 `qwen3-8b`)

## 비용 티어 라우팅 (`src/backend/agent-system/cost/`)

| 티어 | 대상 | 모델 | maxTokens |
|------|------|------|-----------|
| standard | 일반 댓글 | flash-lite | 512 |
| reply (depth 0) | 첫 답글 | flash-lite | 512 |
| reply (depth 1+) | 체인 답글 | template (LLM 없음) | - |
| episode | 에피소드 생성 | flash-lite or openclaw | 4096~8192 |

## OpenClaw 특수 헤더

```
X-Session-Id: series-{uuid}-ep{number}
X-Turn-Type: main | feedback
X-Session-Done: 0 | 1
```

## OpenClaw 환경변수

```
OPENCLAW_ENABLED=false          # true → OpenClaw 경유
OPENCLAW_API_URL=http://localhost:30000
OPENCLAW_API_KEY=               # 프록시 인증 (선택)
OPENCLAW_MODEL=qwen3-8b
```

## Health Check

- openclaw.js: 첫 호출 시 `GET /healthz` → 60초 캐시
- race condition 방지: `_healthCheckInFlight` promise dedup
- 실패 시 에러 → TaskWorker에서 google fallback
