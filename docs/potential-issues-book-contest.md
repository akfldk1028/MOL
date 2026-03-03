# PDF Upload + Book/Contest Analysis — Potential Issues

## Fixed Bugs (이번 리뷰에서 수정 완료)

### 1. snake_case/camelCase 필드 불일치 (기존 버그)
- **위치**: `c/[id]/page.tsx:158`, `CreationCard.tsx:31`
- **문제**: 백엔드 API가 `creation_type` (snake_case)로 반환하는데 프론트에서 `creation.creationType` (camelCase) 접근 → 항상 undefined → novel 폴백
- **영향**: 모든 creation 타입이 detail page와 카드에서 "Novel"로 표시됨
- **수정**: `(creation as any).creation_type || creation.creationType` 폴백 추가
- **근본 해결 필요**: API 응답을 camelCase로 변환하는 레이어 추가 검토 (전체 프로젝트)

### 2. critique-prompt-builder "critique" 문구 잔존
- **위치**: `critique-prompt-builder.js:51-55`
- **문제**: analysis 모드에서도 genre suffix, instruction에 "critique" 하드코딩
- **수정**: `isAnalysis` 분기로 톤 분리

### 3. contest domain 매핑 누락
- **위치**: `CreationForm.tsx:154`, `OrchestratorService.js:143`
- **문제**: contest 타입이 존재하지 않는 'contest' 도메인으로 전달 → agent-select 크래시
- **수정**: 프론트에서 domainMap으로 contest→novel 매핑, 백엔드 safety net 추가

### 4. genre 리셋 누락
- **위치**: `CreationForm.tsx:182`
- **문제**: 타입 전환 시 이전 타입의 genre 선택값 잔존
- **수정**: onChange에서 setGenre('') 호출

### 5. PDF 같은 파일 재업로드 불가
- **위치**: `CreationForm.tsx:70-111`
- **문제**: 브라우저 `<input>` 같은 파일 재선택 시 onChange 미발생
- **수정**: finally에서 input.value = '' 리셋

### 6. synthesis 노드 prefix 불일치
- **위치**: `synthesis/index.js:62`
- **문제**: analysis 모드에서도 `## Synthesis` prefix → 라벨 오표시
- **수정**: formatName === 'analysis'일 때 `## Analysis` prefix 사용

### 7. detail page synthesis 감지 패턴 미비
- **위치**: `c/[id]/page.tsx:67, 216`
- **문제**: `## Analysis`로 시작하는 synthesis 응답을 감지/필터링 못함
- **수정**: `## Analysis` 패턴 추가

### 8. round-execute SSE round_start 채널 null (기존 버그 — 전체 critique 영향)
- **위치**: `round-execute/index.js:28`
- **문제**: `OrchestratorService.emit(ctx.questionId, 'round_start', ...)` — critique 워크플로우에서 `ctx.questionId`는 항상 `null`. `_shared.js`는 `ctx.creationId || ctx.questionId`로 올바르게 처리하는데 `index.js`만 `ctx.questionId` 직접 사용
- **영향**: 모든 critique 타입(novel, webtoon, book, contest)에서 `round_start` SSE 이벤트가 프론트엔드에 전달되지 않음 → 상태바 라운드 진행 표시 안 됨
- **수정**: `const channelId = ctx.creationId || ctx.questionId;` 패턴으로 통일

---

## Potential Issues (잠재 이슈 — 모니터링 필요)

### P1. Book 도메인 에이전트 시딩 필수
- **조건**: `node scripts/seed-domains.js` 미실행 시
- **증상**: book 타입 제출 → agent-select domain strategy가 DB에서 에이전트 못 찾음 → fallback으로 랜덤 house agent 선택 → 역할(role) 매칭 안 됨 → synthesizer 없음 → synthesis 스킵 → 불완전한 분석 결과
- **해결**: 배포 시 반드시 `node scripts/seed-domains.js` 실행
- **심각도**: HIGH (배포 누락 시 기능 불능)

### P2. 50MB PDF 메모리 압박
- **조건**: 대용량 PDF 업로드 시
- **증상**: multer memoryStorage(50MB) + pdf-parse 처리(~50MB) + Supabase upload → 피크 메모리 ~150MB
- **영향**: Railway 인스턴스 메모리 제한(512MB)에 근접할 수 있음
- **완화**: 현재 단일 요청이므로 동시 업로드가 아니면 OK. 동시 업로드 많으면 OOM 가능
- **근본 해결**: diskStorage로 전환 또는 업로드 크기 제한 하향 (20MB 추천)
- **심각도**: MEDIUM

### P3. 전체 프로젝트 snake_case/camelCase 불일치
- **현황**: 백엔드 raw SQL → snake_case 응답. 프론트 TypeScript 인터페이스 → camelCase 정의. 런타임에 불일치.
- **현재 영향 범위**: `creation_type`, `domain_slug`, `created_by_name`, `debate_status`, `current_round`, `max_rounds` 등 다수 필드가 detail page에서 both snake/camelCase fallback으로 처리 중 (`c.debate_status || c.debateStatus`)
- **위험**: 새 필드 추가 시 계속 이중 접근 패턴 필요
- **근본 해결**: API 레이어에 camelCase 변환 미들웨어 추가 (예: `humps` 패키지) 또는 DB 쿼리에서 alias 통일
- **심각도**: MEDIUM (현재 동작하지만 기술 부채)

### P4. AgentAutonomyService + book 도메인 연동
- **현황**: book 포스트에 에이전트 자율 코멘트 가능 (domain_id 매칭)
- **조건**: seed 후 book 에이전트들이 domain_id 설정되어야 autonomy가 올바른 에이전트 선택
- **잠재 이슈**: book 에이전트 persona가 학술 분석 톤인데, autonomy 코멘트 프롬프트는 "conversational and natural" 톤을 요구. 톤 불일치 가능
- **심각도**: LOW

### P5. contest 타입의 domain_slug 이중성
- **현황**: contest는 DB에 `domain_slug = 'novel'`로 저장 (프론트 domainMap)
- **잠재 이슈**: creation list 필터링 시 contest와 novel이 같은 도메인으로 분류됨. 추후 contest-only 리스팅이 필요하면 `creation_type` 필터로 가능하지만 도메인 기반 필터로는 불가
- **심각도**: LOW

### P6. CommentReactionService + analysis 작품
- **현황**: critique 완료 후 status가 'open'이 되면 human comment에 agent 자동 반응
- **잠재 이슈**: book/contest 작품에 대한 human comment → novel 도메인 에이전트(narrative-structure 등)가 반응. 분석 톤이 아닌 critique 톤으로 reply할 수 있음 (comment-reply workflow는 isAnalysis 분기 없음)
- **근본 해결**: comment-reply workflow에서도 creation_type 확인하여 톤 분기
- **심각도**: LOW

### P7. Next.js API 프록시 대용량 파일 전달
- **현황**: `upload-pdf/route.ts`에서 `request.formData()` → `fetch(backend, { body: formData })`
- **잠재 이슈**: Next.js 14 App Router의 formData 처리가 전체 바디를 메모리에 버퍼링. 50MB PDF에서 Vercel 함수 타임아웃(10초) 또는 body size 제한(4.5MB default)에 걸릴 수 있음
- **완화**: Vercel 배포 시 `maxDuration` 설정, 또는 클라이언트에서 직접 백엔드 업로드 (프록시 우회)
- **심각도**: HIGH (프로덕션 배포 시)

---

## Checklist (배포 전 확인)

- [ ] `node scripts/seed-domains.js` 실행하여 book 도메인 에이전트 시딩
- [ ] Vercel 환경에서 PDF 업로드 body size 제한 확인 (`vercel.json`의 `functions.maxDuration` 및 body size)
- [ ] Railway 인스턴스 메모리 모니터링 설정
- [ ] E2E 테스트: book 타입 → PDF 업로드 → 텍스트 추출 → 제출 → SSE 스트리밍 → analysis synthesis 확인
- [ ] E2E 테스트: contest 타입 → 텍스트 입력 → 제출 → novel 에이전트 사용 → analysis synthesis 확인
- [ ] detail page에서 book/contest 배지가 올바르게 표시되는지 확인
