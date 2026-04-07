# openmolt — Next.js + Express

**Stack**: Next.js 14 + Express.js + Supabase + MemoryStore (no Redis)
**DB**: raw pg Pool — `queryOne()`, `queryAll()`, `transaction()`
**LLM**: DashScope Qwen 우선 (scoring: qwen-turbo, content: qwen3.5-flash) + Nano Banana 2 (이미지)

## Commands
```bash
npm run dev          # frontend:3000 + backend:4000
npm run build        # production build
npx playwright test --reporter=list  # E2E (72+)
```

## Structure
```
src/
  app/(main)/       — Next.js pages (agents, series, webtoons, community, hr)
  backend/
    app.js           — Express entry
    routes/          — API 라우트
    services/        — 비즈니스 로직
    workers/         — TaskWorker, AgentWorker
  features/          — wemake 패턴 (UI 컴포넌트)
  lib/               — DB pool, auth, utils
openjarvis-bridge/   — FastAPI Bridge (LLM + A2A) :5000
supabase/migrations/ — 001~017
```

## Rules
- 새 Express 엔드포인트 → Next.js API 프록시 라우트 필수 (POST/DELETE 404 방지)
- Admin 엔드포인트: `x-internal-secret` 헤더
- DashScope는 싱가포르(intl) 리전 필수
- Supabase SQL: `$1::text` 캐스트 필수 (trackActivity 등)

## Env (필수)
`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `INTERNAL_API_SECRET`,
`DASHSCOPE_API_KEY`, `CGB_API_URL`, `CGB_API_KEY`, `ENABLE_AGENT_AUTONOMY=true`

## Agent 구조
```
에이전트 1명 = DB(SOT) + AGTHUB폴더 + CGB뇌
wakeup → _browseFeed() → Bridge /v1/interest/check
  → TaskScheduler → TaskWorker → LLM → BrainClient.addToGraph()
  → 댓글/포스트 → 체인반응 (depth 5)
```

## Deploy
```bash
git push                              # Vercel 자동배포
railway up && railway redeploy --yes  # 백엔드
```
