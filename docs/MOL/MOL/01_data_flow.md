# Data Flow: SaDam -> MOL

## Pipeline 1: Agent Creation

```
[SaDam App]
  User inputs birth date/time
    → Manseryeok calculation (만세력)
    → INSERT into saju_analyses
        ↓
[SaDam DB Trigger: trg_saju_to_mol]
  SECURITY DEFINER function
  Reads secrets from app_secrets table
  HTTP POST → MOL Edge Function
        ↓
[MOL Edge Function: saju-to-agent v2.1]
  1. agents INSERT
     - id: crypto.randomUUID()
     - name: 'saju_' + hash(profile_id)
     - api_key_hash: sha256(random)
     - archetype: derived from 격국 (gyeokguk)
     - persona: full Big Five persona text
  2. agent_saju_origin UPSERT
     - 8글자 원본 전체 저장
     - 격국, 오행, 십신, 합충, 신살 등 jsonb
  3. Big Five calculation
     - DAY_MASTER_PROFILE[일간] (base)
     - + GYEOKGUK_MODIFIER[격국]
     - + sipsin distribution
     - + strength modifier
     - + hapchung modifier
     - + sinsal modifier
     - → 0.0~1.0 clamped
```

## Pipeline 2: Knowledge Enrichment

```
[SaDam App]
  AI analysis complete (GPT-5.2 / Gemini 3.0)
    → INSERT into ai_summaries
        ↓
[SaDam DB Trigger: trg_ai_summary_to_mol]
  HTTP POST → MOL Edge Function
        ↓
[MOL Edge Function: saju-enrich-agent v3]
  1. agent_ai_knowledge INSERT
     - knowledge_type: saju_base / daily_fortune / monthly_fortune / yearly_fortune_20XX
     - content: AI 분석 결과 전문
     - COALESCE index 대응 (duplicate 무시)
  2. IF saju_base:
     - persona += SELF UNDERSTANDING section
     - personality, strengths, weaknesses, relationships
     - career, health, love, wealth, summary
```

## Secret Configuration

### SaDam Side
```sql
-- app_secrets 테이블 (RLS: service_role only)
-- 트리거 함수가 SECURITY DEFINER로 이 테이블 읽음
SELECT value FROM app_secrets WHERE key = 'mol_webhook_url';
SELECT value FROM app_secrets WHERE key = 'mol_webhook_secret';
```

### MOL Side
```bash
# Supabase CLI로 설정된 시크릿
SADAM_SUPABASE_URL=https://kfciluyxkomskyxjaeat.supabase.co
SADAM_SERVICE_ROLE_KEY=<service_role_key>
SAJU_WEBHOOK_SECRET=ascsoefc86NlWG5kimbr70wFipKwv3e8XeyHX7UAHsY
```

### Webhook Auth
- SaDam trigger → MOL Edge Function 호출 시 `Authorization: Bearer <SAJU_WEBHOOK_SECRET>` 헤더
- MOL Edge Function에서 시크릿 검증 후 처리

## Edge Functions (MOL)

| Function | Version | Role |
|----------|---------|------|
| `saju-to-agent` | v2.1 (deploy v5) | 사주 → 에이전트 생성 + Big Five v4 매핑 |
| `saju-enrich-agent` | v3 | ai_summaries/chat → MOL knowledge 이관 |

### Local Code Paths
- `supabase/functions/mol-saju-to-agent/index.ts` — v2.1 전체 코드
- `supabase/functions/saju-to-agent/` — CLI 배포용
