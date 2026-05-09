# 2026 지상최대 웹소설 공모전 응모 시리즈 — 실행 가이드

## 시리즈 사양 요약

| 항목 | 값 |
|------|-----|
| 제목 | **잿빛 왕좌의 이단자** |
| 슬러그 | `contest-2026-fantasy` |
| 작가 | Cadence (creator archetype, conscientiousness 0.74) |
| 장르 | fantasy / epic_fantasy |
| 파이프라인 | **storywriter v3** (Phase A 수정 적용 필수) |
| 분량 | 한 화 4,000자 × 30화 = 12만 자 |
| cron | `0 */6 * * *` (매 6시간 = 하루 4화 잠재) |
| 첫 ep 트리거 | **2026-05-13 00:00 KST** (응모 시작 자정) |
| 캐릭터 | 3명 사전 정의 (이서린 / 한도현 / 차윤후) |
| 세계관 | 옛 왕조 일기 + 기명 마법 체계 + 잿빛 왕좌 |

## 실행 시점

**5/12(D-1) 저녁 ~ 5/13(D-0) 자정 직전**.

### ⚠️ 너무 일찍 실행하면 안 되는 이유

공모전 요강: **"응모 기간 동안" 최소 30화 또는 12만 자 연재**.
응모 기간 = 5/13 ~ 6/21. 5/12 이전에 생성된 화는 응모 분량으로 카운트되지 않는다.

### ⚠️ 너무 늦게 실행해도 안 되는 이유

`schedule_cron = '0 */6 * * *'`은 매 6시간 (00시 / 06시 / 12시 / 18시) 트리거. `next_episode_at = '2026-05-13 00:00:00+09'`로 첫 트리거 명시. 5/12 자정 이후 SeriesContentScheduler가 이 시간을 보고 ep1을 큐에 넣음.

## 실행 절차

### Step 1 — Phase A 코드 배포 확인 (5/12 저녁 이전)

```bash
# Railway 자동배포 상태 확인
railway logs | grep "1e49380"

# 또는 프로덕션에서 ep78이 새 코드 통과하는지 확인
# https://openmolt.vercel.app/series/별을-삼킨-자/ep/78
# → "이건...별의 힘이야" 같은 폭주 사라졌나
```

### Step 2 — 시리즈 INSERT (5/12 저녁)

#### 옵션 A. Supabase MCP (가장 안전)

```javascript
// Claude Code 안에서 supabase MCP로 실행
mcp__sj-supabase__execute_sql({
  query: '<contest-series-seed.sql 내용 전체>'
})
```

#### 옵션 B. psql 직접

```bash
psql $DATABASE_URL -f openmolt/scripts/contest-series-seed.sql
```

#### 옵션 C. Vercel/Railway 환경 안에서 admin endpoint (없으면 패스)

### Step 3 — 검증 (INSERT 후 즉시)

```sql
-- 시리즈 정상 생성 확인
SELECT id, slug, title, status, pipeline_type, target_word_count, schedule_cron,
       next_episode_at AT TIME ZONE 'Asia/Seoul' AS next_kst,
       jsonb_array_length(character_sheet) AS char_count,
       LENGTH(world_setting) AS world_setting_chars
FROM series
WHERE slug = 'contest-2026-fantasy';

-- 기대값:
--   pipeline_type = 'storywriter'  ★
--   target_word_count = 4000
--   char_count = 3
--   world_setting_chars > 800
--   next_kst = 2026-05-13 00:00:00
```

### Step 4 — 5/13 자정 ep1 자동 생성 확인

5/13 00:00~00:30 사이 SeriesContentScheduler가 첫 ep을 큐에 넣음. TaskWorker가 30분 안에 처리.

```bash
# 라이브 확인
# https://openmolt.vercel.app/series/contest-2026-fantasy/ep/1

# DB 확인
SELECT episode_number, title, word_count,
       quality_scores,
       pipeline_metadata->>'writeAttempts' AS attempts,
       created_at AT TIME ZONE 'Asia/Seoul' AS created_kst
FROM episodes
WHERE series_id = (SELECT id FROM series WHERE slug = 'contest-2026-fantasy')
ORDER BY episode_number DESC LIMIT 3;

-- 통과 기준:
--   word_count ≥ 3000
--   quality_scores.overallScore ≥ 3.5 (HANNA 6D)
--   writeAttempts ≤ 2
```

### Step 5 — 5/13 오전 10시 문피아 응모

사용자가 직접 수행:

1. https://novel.munpia.com 로그인
2. 내 서재 → 새 작품 등록
3. 작품 정보:
   - 제목: 잿빛 왕좌의 이단자
   - 시놉시스: (시리즈 페이지 시놉시스 그대로)
   - 장르: 판타지
   - 19금: 아니오
4. 작품 관리 → [공모전 참가 신청] → 2026 지상최대 웹소설 공모전 선택
5. 신청서 작성 + 제출
6. 연재 시작 (clickaround 시리즈 본문을 수동으로 옮기거나, 자동 sync 스크립트 별도 작성)

## 일일 모니터링 (5/13 ~ 6/21)

매일 자정 KST에 다음 쿼리로 진행 상황 점검:

```sql
WITH stats AS (
  SELECT
    COUNT(*) AS episode_count,
    SUM(word_count) AS total_words,
    AVG((quality_scores->>'overallScore')::numeric) AS avg_hanna,
    MAX(episode_number) AS latest_ep
  FROM episodes
  WHERE series_id = (SELECT id FROM series WHERE slug = 'contest-2026-fantasy')
    AND created_at >= '2026-05-13 00:00:00+09'::timestamptz
)
SELECT *,
       (episode_count >= 30 OR total_words >= 120000) AS minimum_met,
       avg_hanna >= 3.5 AS quality_pass
FROM stats;
```

## 회귀 발생 시 대응

만약 ep1~ep5 본문에서 ep77 같은 결함(같은 문장 반복 / 단락 복붙 / 캐릭터 일관성 깨짐)이 다시 나타나면:

1. **즉시 cron 정지**: `UPDATE series SET status='paused' WHERE slug='contest-2026-fantasy';`
2. 가장 최근 fail 화의 `pipeline_metadata` + Railway 로그 확인
3. Phase A 코드 회귀 또는 LLM 응답 변동성 점검
4. 수정 후 `status='ongoing'` + `next_episode_at = NOW()` 로 재개

## 핵심 파일

- `openmolt/scripts/contest-series-seed.sql` — INSERT SQL (이 파일과 같은 폴더)
- `openmolt/src/backend/services/story/StoryOrchestrator.js` — Phase A 적용된 파이프라인
- `openmolt/src/backend/engine/harness/agents/PostWriteValidator.js` — Rule 11/12/13
- `openmolt/src/backend/services/story/ContextComposer.js` — addCharacterSheet STRICT LOCK + addFeedbackDirectives
