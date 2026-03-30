# Handoff — 2026-03-28~29 세션

## 이전 세션
- 에이전트 재설계 B안 (사주 기반 334개)
- OpenJarvis Bridge, AGTHUB 구축
- 커뮤니티 UI 리디자인 + 관계 그래프

---

## 이번 세션 완료 (15 커밋)

### 1. 웹툰 시스템 v2 (완전 리라이트)
- `episodes` 테이블 신설 (011_webtoon_v2.sql) — creations에서 분리
- EpisodeGenerator → ScriptParser → PageGenerator → EpisodeService
- Nano Banana **Pro** 모델 (Flash→Pro 전환, 품질 대폭 향상)
- [PAGE N] 블록 포맷 (기존 [PANEL] 대체)
- 캐릭터시트 자동 생성 (front/side/full + rembg)
- cron-parser 기반 SeriesContentScheduler
- EpisodeViewer (세로 스크롤 + 키보드 네비 + CritiqueSection)
- critique_episode 태스크 타입 + _handleCritiqueEpisode 핸들러
- 한국어 프롬프트 + MOOD 텍스트 렌더링 버그 수정
- EP1~5 생성 테스트 완료

### 2. AGTHUB 334개 동기화
- AGTHUBSync 서비스 (persona → Big Five + speaking style regex 파싱)
- 레거시 한국 이름 20개 폴더 삭제
- 334개 영어 이름 폴더 생성 (agent.yaml, SOUL.md, RULES.md, knowledge/)
- CLI: `scripts/sync-agthub.js` (--backfill, --single, --clean)

### 3. SEO 에이전트 시스템
- sitemap.ts, robots.ts (Next.js)
- SEOService (serenade, switch, lore — 재성 강한 에이전트 선발)
- seo_post 행동 (AgentLifecycle, 20% 확률)
- posts/series SEO 필드 (012_seo.sql)
- Episode 페이지 SEO metadata (layout.tsx generateMetadata)

### 4. 코드리뷰 5라운드
- Episode number race condition → atomic INSERT...SELECT MAX
- comments.post_id DROP NOT NULL (episode critique용)
- comments.episode_id FK 추가
- 부분 인덱스 (episodes.status, posts.seo_optimized)
- subfolder path traversal 방지
- CritiqueSection API 신설

### 5. 한국 웹툰 스타일 실험 (5회)
- EP1: 기본 → 서양풍 (실패)
- EP2: 키워드 과잉 → 여전히 서양풍 (실패)
- EP3: "2d Korean naver webtoon" → 약간 나아짐 (부분)
- EP4: **Flash→Pro 모델 전환** → 품질 대폭 향상 (부분 성공)
- EP5: Pro + 네이버웹툰 style reference + 한국어 프롬프트 → 가장 가까운 결과

---

## 현재 상태

### DB (마이그레이션 012까지)
- episodes 테이블 (18 컬럼, 5행 — test-webtoon-v2)
- comments.episode_id (nullable FK)
- posts/series SEO 필드
- series.schedule_cron, max_episodes
- series_characters.reference_urls JSONB

### Storage
- `agents/{name}/series/{slug}/ep{N}/page-{NNN}.webp`
- `agents/{name}/series/{slug}/style-reference.webp`
- `agents/{name}/series/{slug}/characters/{char}_{view}.webp`
- avatars/ → agents/ 마이그레이션 미완 (스크립트 있음, 실행 안 함)

### 서버 실행
```bash
cd openmolt && npm run dev  # frontend:3000 + backend:4000
```

### 테스트
```bash
node scripts/test-webtoon-pipeline.js --create   # 시리즈+캐릭터
node scripts/test-webtoon-pipeline.js --episode   # 에피소드 생성
node scripts/sync-agthub.js --backfill            # AGTHUB 동기화
```

---

## 다음 세션 TODO

### 우선순위 높음
1. **레퍼런스 업로드 UI** — brainstorming부터. 시리즈 생성 시 유저가 화풍/캐릭터 이미지 업로드
2. **자체 오리지널 style reference** — 저작권 안전한 방식으로 한국 웹툰 스타일 확보
3. **프로덕션 배포** — Railway + Vercel + 환경변수 (GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview)

### 중간
4. **AGTHUB git push** (334개 폴더)
5. **avatars/ → agents/ Storage 마이그레이션** 실행
6. **SEO 에이전트 동작 확인**

### 장기
7. SD + InstantStyle 파이프라인 (논문: research/webtoon-style-transfer-papers.md)
8. 자체 LoRA 학습 + OpenClaw weight-level RL
9. 1컷=1이미지 네이버 스타일 전환

---

## 핵심 교훈 (메모리에 저장됨)
- Nano Banana **Pro 필수** (Flash 품질 부족)
- MOOD를 프롬프트에 넣으면 텍스트로 렌더링됨
- 실제 이미지 reference > 어떤 프롬프트
- 한국어 프롬프트가 영어보다 효과적
- 프롬프트는 추상적으로 (키워드 나열 X)
- 캐릭터 이름 태그 (Jin) 자동 제거 필요
