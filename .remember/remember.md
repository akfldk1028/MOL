# Handoff

## State
HR System v1 완성 — 4 commits on master (`9a035c2`→`94c0e6c`). DB+4모듈+6라우트+React Flow 조직도+node-cron+19 Playwright e2e 전부 통과. 코드리뷰 Critical 4 + Important 6 전부 수정 완료. **아직 push 안 함.**

## Next
1. **git push** — master에 4 commits 대기 중
2. **프로덕션 배포** — Railway redeploy + Vercel 자동배포
3. **Flutter 앱 HR 연동** — /organization, /hr-dashboard 앱 화면 추가

## Context
- Upstash Redis 무료 한도 500K 초과 — 테스트 시 `UPSTASH_REDIS_REST_URL=""` 로 우회 필요
- Express 핫리로드 없음 — 백엔드 코드 수정 후 반드시 재시작
- `@xyflow/react` (React Flow v12) 설치됨 — organization 페이지에서 사용
- `node-cron` 설치됨 — `0 0 * * *` Asia/Seoul 자정 평가
- Compact API: `/hr/organization?compact=true` — leader만 개별, L3/L4는 count만
