-- ════════════════════════════════════════════════════════════════════════
--   2026 지상최대 웹소설 공모전 응모 시리즈 시드
--
--   응모 기간: 5/13(수) ~ 6/21(일) (40일)
--   요건: 응모 기간 내 30화 이상 또는 12만 자 이상 연재
--   목표: 특선(200만 × 20) / 우수상(1천만 × 10) 부문
--
--   작가: Cadence (creator archetype, conscientiousness 0.74, directness 0.9)
--         메모리상 storywriter 검증된 작가 (강남역 우연 18화 정상 진행)
--
--   장르: fantasy
--   파이프라인: storywriter v3 (Phase A 수정 적용)
--   분량 목표: 한 화 4,000자 × 30화 = 12만 자 (요건 통과 + 버퍼)
--   cron: 0 */6 * * * (매 6시간 = 하루 4화 잠재 → 30화 7-8일 도달)
--
--   ══════════════════════════════════════════════════════════════════════
--   ⚠️ 5/12(D-1) 저녁 사용자가 직접 실행. 그 전엔 절대 실행 금지.
--   응모 기간 전에 생성된 화는 응모 분량으로 카운트 안 됨.
--   ══════════════════════════════════════════════════════════════════════

-- 1. Cadence 에이전트 ID 확인
DO $$
DECLARE
  cadence_id TEXT;
  new_series_id UUID;
BEGIN
  SELECT id INTO cadence_id FROM agents WHERE name = 'cadence' LIMIT 1;
  IF cadence_id IS NULL THEN
    RAISE EXCEPTION 'Cadence agent not found in DB. Run AGTHUBSync first.';
  END IF;

  -- 2. 시리즈 INSERT (character_sheet + world_setting 사전 정의)
  INSERT INTO series (
    id, slug, title, description, synopsis, content_type, genre, language, status,
    created_by_agent_id, schedule_cron, target_word_count, pipeline_type,
    episode_count, next_episode_at,
    character_sheet, world_setting,
    creative_category, sub_genre
  ) VALUES (
    gen_random_uuid(),
    'contest-2026-fantasy',
    '잿빛 왕좌의 이단자',
    '봉인된 옛 왕조의 마지막 후계자가 자신의 정체를 모른 채 변방의 도시에서 발견한 한 권의 일기. 그 안에 적힌 이름들이 차례로 죽어 나가기 시작한다.',
    -- synopsis (시리즈 페이지 노출)
    '봉인된 옛 왕조의 마지막 후계자가 자신의 정체를 모른 채 변방의 도시에서 발견한 한 권의 일기. 그 안에 적힌 이름들이 차례로 죽어 나가기 시작한다. 일기를 펼친 자에게 내려진 저주인지, 아니면 일기 자체가 진실을 향한 안내서인지 — 진실을 좇는 여정이 곧 그를 잿빛 왕좌의 자리로 이끈다.',
    'novel',
    'fantasy',
    'ko',
    'ongoing',
    cadence_id,
    -- ⚠️ cron: 5/13 자정 시작 기준 매 6시간. 첫 트리거는 next_episode_at으로 제어.
    '0 */6 * * *',
    4000,                    -- target_word_count: 한 화 4000자
    'storywriter',           -- ★ pipeline_type 강제 — Phase A 코드가 적용됨
    0,
    -- ⚠️ next_episode_at은 5/13 00:00 KST = 5/12 15:00 UTC로 설정. 그 시간 이후 첫 cron이 ep1 생성.
    '2026-05-13 00:00:00+09'::timestamptz,
    -- character_sheet: STRICT NAME LOCK 강제용 사전 정의 3명
    '[
      {
        "name": "이서린",
        "age": 19,
        "role": "주인공 — 변방 출신 약초 채집인. 자신이 옛 왕조의 마지막 후계자임을 모름.",
        "personality": "관찰력 예리하고 말수 적음. 위기에선 본능적으로 거짓을 간파한다. 자신의 출생에 대한 의문을 평생 안고 살아왔다.",
        "appearance": "은회색 머리에 회색 눈. 약초 채집인 가죽 옷에 작은 칼을 허리에 찬다. 왼쪽 손목 안쪽에 별 모양 흉터.",
        "backstory": "유년기에 변방 마을 약초 노파에게 거두어졌다. 노파는 죽기 직전 \"북쪽으로 가지 마라\"는 한 마디만 남겼다."
      },
      {
        "name": "한도현",
        "age": 28,
        "role": "조력자 — 떠돌이 학자. 옛 왕조의 일기를 추적해 변방까지 흘러들어왔다.",
        "personality": "겉으로는 냉정하고 분석적이지만 진실 앞에서는 흔들린다. 서린의 정체를 추측하나 확신 없음.",
        "appearance": "검은 머리를 뒤로 묶고, 안경 대신 외알 렌즈. 낡은 가죽 가방에 책과 잉크병을 넣고 다닌다.",
        "backstory": "옛 왕조 학사 가문 출신. 가문이 몰락한 후 일기의 흔적을 좇아 7년간 떠돌고 있다."
      },
      {
        "name": "차윤후",
        "age": 35,
        "role": "적대자 — 현 왕정의 비밀 정보국 수장. 옛 왕조의 후계자를 제거하라는 명을 받음.",
        "personality": "냉소적이고 효율 지상주의. 인간미를 의도적으로 억누른다. 자신이 하는 일의 정당성을 끊임없이 의심하면서도 멈추지 않는다.",
        "appearance": "회색 군복 위에 짙은 외투. 왼쪽 눈 위로 가는 흉터. 항상 장갑을 낀다.",
        "backstory": "원래 옛 왕조 호위 출신. 왕조가 무너질 때 살아남기 위해 새 왕정에 충성을 맹세했고, 그 죄책감을 임무로 덮고 있다."
      }
    ]'::jsonb,
    -- world_setting: 세계관 + 옛 왕조의 일기 + 저주 메커니즘
    '## 세계관: 잿빛 왕조

10년 전 변방 반란으로 200년 통치하던 옛 왕조가 무너졌다. 새 왕정이 들어선 뒤로 옛 왕조의 흔적은 모두 지워졌고, 후계자는 학살되었다고 알려졌다.

## 일기

옛 왕조의 마지막 왕이 죽기 직전 봉인한 일기. 표지에는 일곱 개의 이름이 적혀 있다.
- 일기를 펼친 자만이 그 이름들을 읽을 수 있다.
- 이름이 적힌 순서대로, 그 사람들이 7년 안에 죽는다.
- 마지막 이름의 주인이 죽으면 일기는 다시 봉인되고, 옛 왕조의 비밀은 영원히 사라진다.

## 마법 체계

이 세계에서 마법은 "기록"의 형태로만 작동한다. 적힌 글이 현실에 영향을 주는 "기명 마법"이 유일한 마법이다.
- 글로 적은 약속은 어겨지면 글쓴이에게 대가가 돌아온다.
- 이름을 적는 행위 자체가 그 사람의 운명을 묶는다.

## 무대

- 변방 마을 "은령" — 약초가 자라는 안개 도시. 옛 왕조의 영향력이 닿지 않았다.
- 수도 "광휘" — 새 왕정의 중심. 옛 왕조의 모든 기록이 불태워진 곳.
- 잿빛 왕좌 — 옛 왕조의 폐허에 남은 텅 빈 옥좌. 일기를 읽은 자만이 그 위치를 알 수 있다.',
    'novel-fantasy',
    'epic_fantasy'
  ) RETURNING id INTO new_series_id;

  -- 3. truth files 초기 시드 (TruthManager가 ep1에서 다시 채우지만 미리 깔아둠)
  -- 이 부분은 truth_files 테이블이 있다면 INSERT, 없으면 TruthManager.initialize가 ep1에서 자동 생성
  -- 현재 020 migration에는 truth_files 테이블 명시 없음 → TruthManager가 자체 저장소 사용 가능

  RAISE NOTICE 'Contest series created: id=%, slug=contest-2026-fantasy, agent=%, ep1 trigger at 2026-05-13 00:00 KST',
               new_series_id, 'cadence';
END $$;

-- 4. 검증 쿼리 (실행 후)
SELECT id, slug, title, status, pipeline_type, target_word_count, schedule_cron,
       next_episode_at AT TIME ZONE 'Asia/Seoul' AS next_kst,
       jsonb_array_length(character_sheet) AS char_count,
       LENGTH(world_setting) AS world_setting_chars
FROM series
WHERE slug = 'contest-2026-fantasy';

-- 5. 응모 분량 추적용 뷰 (선택)
-- 아래 쿼리로 5/13 이후 생성된 화 + 누적 글자수 추적
-- SELECT episode_number, title, word_count, created_at AT TIME ZONE 'Asia/Seoul' AS created_kst
-- FROM episodes
-- WHERE series_id = (SELECT id FROM series WHERE slug = 'contest-2026-fantasy')
--   AND created_at >= '2026-05-13 00:00:00+09'::timestamptz
-- ORDER BY episode_number DESC;
