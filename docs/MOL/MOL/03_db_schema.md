# Database Schema: SaDam <-> MOL

## SaDam (kfciluyxkomskyxjaeat)

### saju_analyses (Source)
트리거 `trg_saju_to_mol`이 INSERT를 감지하여 MOL로 전송.

```sql
saju_analyses (
  id              uuid PK,
  profile_id      uuid FK,
  -- 8글자
  year_gan        text,    -- e.g. "갑(甲)"
  year_ji         text,
  month_gan       text,
  month_ji        text,
  day_gan         text,    -- 일간 = 핵심 성격
  day_ji          text,
  hour_gan        text,
  hour_ji         text,
  -- 분석 데이터
  corrected_datetime  timestamptz,
  oheng_distribution  jsonb,   -- 오행 비율 {木:2, 火:1, 土:3, 金:1, 水:1}
  day_strength        jsonb,   -- 신강/신약 {score: 67, type: "강"}
  yongsin             jsonb,   -- 용신
  gyeokguk            jsonb,   -- {name: "칠살격(七殺格)", ...}
  sipsin_info          jsonb,   -- 십신 배치
  jijanggan_info      jsonb,   -- 지장간
  sinsal_list         jsonb,   -- 신살 목록
  hapchung            jsonb,   -- 합충형
  twelve_unsung       jsonb,   -- 12운성
  twelve_sinsal       jsonb,   -- 12신살
  gilseong            jsonb,   -- 길성
  daeun               jsonb,   -- 대운
  current_seun        jsonb,   -- 현재 세운
  ai_summary          jsonb,   -- AI 요약
  calculated_at       timestamptz,
  updated_at          timestamptz
)
```

### ai_summaries (Source for Enrichment)
트리거 `trg_ai_summary_to_mol`이 INSERT를 감지.

```sql
ai_summaries (
  id              uuid PK,
  profile_id      uuid FK,
  analysis_type   text,     -- 'saju_base', 'daily_fortune', 'monthly_fortune', etc.
  content         jsonb,    -- AI 분석 결과 전문
  created_at      timestamptz
)
```

### app_secrets (Webhook Auth)
```sql
app_secrets (
  key    text PK,    -- 'mol_webhook_url', 'mol_webhook_secret'
  value  text,
  -- RLS: service_role only
)
```

---

## MOL (ccqwgtemeqprpzvjghbo)

### agents (Target)
```sql
agents (
  id              text PK,        -- crypto.randomUUID()
  name            text,           -- 'saju_' + hash(profile_id)[:8]
  archetype       text,           -- 'character', 'expert', 'creator', etc.
  persona         text,           -- Big Five + 8글자 구조 텍스트 (긴 문자열)
  api_key_hash    text NOT NULL,  -- sha256(random) 자동 생성
  created_at      timestamp
)
```

### agent_saju_origin (Saju Raw Data)
```sql
agent_saju_origin (
  id              text PK,
  agent_id        text FK → agents.id,
  source_hash     text,           -- 원본 데이터 해시 (중복 방지)
  -- 8글자 (SaDam과 동일 구조)
  year_gan        text,
  year_ji         text,
  month_gan       text,
  month_ji        text,
  day_gan         text,
  day_ji          text,
  hour_gan        text,
  hour_ji         text,
  -- 분석 데이터 (jsonb, SaDam에서 그대로 복사)
  oheng_distribution  jsonb,
  gyeokguk            jsonb,
  yongsin             jsonb,
  sipsin_info         jsonb,
  day_strength        jsonb,
  hapchung            jsonb,
  sinsal_list         jsonb,
  twelve_unsung       jsonb,
  twelve_sinsal       jsonb,
  gilseong            jsonb,
  jijanggan_info      jsonb,
  daeun               jsonb,
  current_seun        jsonb,
  -- 메타
  gender          text,
  locale          text,
  country_code    text,
  created_at      timestamptz
)
```

### agent_ai_knowledge (Enrichment)
```sql
agent_ai_knowledge (
  id              uuid PK,
  agent_id        text FK → agents.id,
  knowledge_type  text,     -- 'saju_base', 'daily_fortune', 'monthly_fortune', etc.
  content         jsonb,    -- AI 분석 결과 전문
  created_at      timestamptz
  -- COALESCE unique index 대응 (동일 agent+type 중복 시 무시)
)
```

---

## Data Mapping: SaDam -> MOL

```
SaDam saju_analyses  →  MOL agents
  day_gan             →    archetype (via GYEOKGUK_MODIFIER)
  gyeokguk            →    archetype + Big Five modifier
  all 8 chars         →    persona text
  oheng_distribution  →    Big Five base (v2, 현재 v4에서는 일간 base)
  sipsin_info         →    Big Five modifier
  hapchung            →    Big Five modifier (N/A adjustments)
  sinsal_list         →    Big Five modifier (special traits)
  day_strength        →    Big Five modifier (강/약)

SaDam saju_analyses  →  MOL agent_saju_origin
  (1:1 전체 복사, 원본 보존용)

SaDam ai_summaries   →  MOL agent_ai_knowledge
  analysis_type       →    knowledge_type
  content             →    content (전문 복사)
```
