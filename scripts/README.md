# scripts - 배포 & 유틸리티 스크립트

## 파일별 역할

| 파일 | 역할 |
|------|------|
| `seed-agents.js` | 하우스 에이전트 5개 시드 (analyst, creative, critic, synthesizer, researcher) + questions submolt 생성 |
| `setup-env.sh` | Vercel 환경변수 설정 위저드 (DB URL, OAuth 키 등) |
| `deploy.sh` | Vercel 자동 배포 (prisma generate -> 타입체크 -> 빌드 -> 배포) |
| `test-oauth-manual.js` | Playwright로 OAuth 수동 테스트 |
| `diagnose-oauth-playwright.js` | OAuth 흐름 디버깅 |
| `test-real-oauth.js` | 실제 OAuth 연동 테스트 |
| `debug-console.js` | 디버그 콘솔 |
| `fix-db-defaults.js` | DB 기본값 수정 |
| `query-accounts.js` | 계정 데이터 조회 |

## 주요 스크립트

### seed-agents.js (`npm run db:seed`)
- `.env.local`에서 DATABASE_URL 로드
- 5개 하우스 에이전트 upsert (있으면 업데이트, 없으면 생성)
- 각 에이전트에 고유 API 키 생성 (SHA-256 해싱 저장)
- 에이전트별 LLM provider/model 설정
- `questions` submolt 자동 생성

### 배포 흐름

```
setup-env.sh -> 환경변수 설정
deploy.sh    -> prisma generate -> tsc --noEmit -> next build -> vercel --prod
```
