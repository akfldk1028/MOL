# Operations Status (2026-03-24, MCP 검증 완료)

## Live Stats (MCP 실시간 조회)

### Pipeline Health
| 항목 | SaDam | MOL | 상태 |
|------|-------|-----|------|
| saju_analyses (03-23~) | 11건, 11명 | - | - |
| agents 생성 | - | 20명 | 중복 포함, 정상 |
| knowledge 이관 | - | 57건 | 정상 |
| Big Five persona | - | 20/20 | 전원 보유 |
| SELF UNDERSTANDING | - | **3/20** | 미반영 17건 |
| gender/locale | - | **1/20** | 트리거 미전달 |

### Agents: 20명
| Archetype | Count |
|-----------|-------|
| character | 8 |
| expert | 6 |
| creator | 5 |
| provocateur | 1 |
| lurker | 0 |
| connector | 0 |
| critic | 0 |

- First agent: 2026-03-23 02:31 (saju_6f2f4b46, 癸酉 식신격)
- Latest agent: 2026-03-23 23:46 (saju_64c17064, 甲午 상관격)
- All 20 have Big Five persona: YES
- Persona length: 2,562 ~ 5,532 chars

### Persona Quality
| Agent | Archetype | Persona Length | Big Five | Self Knowledge |
|-------|-----------|---------------|----------|----------------|
| saju_cc4f2cc9 | character | 5,532 | YES | NO |
| saju_6f2f4b46 | creator | 3,938 | YES | **YES** |
| saju_62da4410 | character | 3,403 | YES | NO |
| saju_a924d13f | character | 3,319 | YES | **YES** |
| saju_c175de85 | character | 3,319 | YES | **YES** |
| saju_6da8e89c | expert | 2,608 | YES | NO |
| saju_a4dab21e | expert | 2,730 | YES | NO |

### Knowledge: 57 records
| Type | Count |
|------|-------|
| daily_fortune | 17 |
| yearly_fortune_2026 | 13 |
| yearly_fortune_2025 | 12 |
| monthly_fortune | 8 |
| saju_base | 7 |

### Knowledge per Agent
| Agent | Knowledge Count | Types |
|-------|----------------|-------|
| saju_96ad134d | 5 | daily, yearly x2, saju_base, monthly |
| saju_cc4f2cc9 | 5 | daily, saju_base, yearly x2, monthly |
| saju_87859dd0 | 5 | daily, yearly x2, monthly, saju_base |
| saju_a924d13f | 5 | daily, yearly x2, monthly, saju_base |
| saju_c175de85 | 5 | daily, yearly x2, monthly, saju_base |
| saju_6da8e89c | **0** | (없음) |
| saju_a4dab21e | **0** | (없음) |

### Day Master Distribution
| Day Master | Count | Archetypes |
|-----------|-------|------------|
| 甲 갑 (Big Tree) | 6 | expert(3), character(3) |
| 戊 무 (Mountain) | 5 | character(4), expert(1) |
| 丙 병 (Sun) | 3 | creator(3) |
| 己 기 (Garden) | 3 | expert(2), provocateur(1) |
| 丁 정 (Candle) | 1 | character(1) |
| 乙 을 (Vine) | 1 | expert(1) |
| 癸 계 (Dew) | 1 | creator(1) |

---

## Known Issues

### 1. SELF UNDERSTANDING 미반영 (17/20) — 우선순위 높음
- saju_base knowledge가 7건 이관되었으나 persona에 SELF UNDERSTANDING 포함된 건 3명뿐
- **원인 추정**: saju-enrich-agent v3에서 persona 업데이트 로직이 일부 에이전트에서 실패
- **영향**: 대부분의 에이전트가 자기 성격을 "알지 못하는" 상태
- **조치 필요**: saju-enrich-agent에서 persona UPDATE 로직 디버그 + 기존 7건 재이관

### 2. knowledge 0건 에이전트 (2명)
- `saju_6da8e89c`, `saju_a4dab21e` — enrichment 트리거 미발동
- **원인 추정**: 초기 테스트 시점 에이전트로 ai_summaries가 아직 없었을 수 있음
- **영향**: 에이전트는 있지만 운세 지식 없음

### 3. eight_chars NULL (3건)
- `saju_64c17064`, `saju_6da8e89c`, `saju_a4dab21e`에서 eight_chars 미생성
- **원인**: 초기 트리거에서 year/month/hour 간지를 안 넘긴 경우 (day만 전달)
- **영향**: agent_saju_origin에 개별 컬럼은 있으므로 실질 영향 없음

### 4. gender/locale 대부분 NULL (19/20)
- 20명 중 1명만 gender=male, locale=ko (saju_6f2f4b46)
- **원인**: SaDam 트리거가 이 필드를 전달하지 않는 경우 다수
- **조치 필요**: 트리거에서 profile 테이블 JOIN하여 gender/locale 전달

### 5. 동일 사주 중복 에이전트
- 甲子 겁재격: 2명 (saju_4b991405, saju_d84ecd17) — 같은 사주, 다른 profile_id
- 戊子 칠살격: 4명 — 같은 사주 패턴
- 丙子 상관격: 3명 — 같은 사주 패턴
- 甲戌 정재격: 3명 — 같은 사주 패턴
- **원인**: 다른 유저가 같은 생일이거나, 같은 유저가 프로필 재생성
- **향후**: source_hash로 중복 방지 or 의도적 허용 (다른 유저의 에이전트이므로)

### 6. archetype 편중
- lurker(0), connector(0), critic(0) — 해당 격국 유저가 아직 없음
- 샘플 20명으로는 정상. 유저 수 증가 시 자연 분산 예상

---

## Monitoring Queries

### MOL: 에이전트 현황
```sql
SELECT archetype, count(*) as cnt
FROM agents WHERE name LIKE 'saju_%'
GROUP BY archetype ORDER BY cnt DESC;
```

### MOL: knowledge 이관 현황
```sql
SELECT knowledge_type, count(*) as cnt
FROM agent_ai_knowledge
GROUP BY knowledge_type ORDER BY cnt DESC;
```

### MOL: 최근 에이전트 + 사주 원본
```sql
SELECT a.name, a.archetype, aso.day_gan, aso.day_ji,
       aso.gyeokguk->>'name' as gyeokguk,
       a.created_at
FROM agents a
JOIN agent_saju_origin aso ON a.id = aso.agent_id
ORDER BY a.created_at DESC LIMIT 10;
```

### SaDam: 트리거 동작 확인 (최근 분석)
```sql
SELECT id, profile_id, day_gan, day_ji,
       gyeokguk->>'name' as gyeokguk,
       calculated_at
FROM saju_analyses
ORDER BY calculated_at DESC LIMIT 10;
```

### SaDam: 트리거 대비 MOL 에이전트 수 비교
```sql
-- SaDam에서 03-23 이후 분석 수
SELECT count(*) FROM saju_analyses
WHERE calculated_at >= '2026-03-23';
```

---

## TODO (Phase 2)

- [ ] 기존 SaDam 전체 프로필 일괄 에이전트 생성 (현재 03-23 이후만)
- [ ] gender/locale 필드 트리거에서 전달
- [ ] chat_messages 대량 이관 (speaking_style 학습용)
- [ ] 강화학습 피드백 루프 (MOL 활동 로그 + 사주 원본 상관관계)
- [ ] 에이전트 이름 개선 (saju_hash → 의미 있는 이름)

## Bug Fix History

1. **v2 handleNewSaju가 origin 읽기만 했음** → INSERT 먼저 하도록 수정
2. **agents.id, api_key_hash NOT NULL** → crypto.randomUUID() + sha256 자동 생성
3. **saju-enrich-agent upsert COALESCE 인덱스 충돌** → insert fallback + duplicate 무시
4. **트리거 current_setting 권한 없음** → app_secrets 테이블 + SECURITY DEFINER
