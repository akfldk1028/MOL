# Phase B2 — 텍본 Ingestion 가이드

CGB 그래프에 우수 본문을 학습시켜 ContextComposer가 다음 ep 생성 시 style references로 자동 주입하게 만든다.

## 두 가지 소스

### 1. 자체 라이브 우수 ep (★ 추천 — 바로 가능)

라이브 시리즈에서 HANNA 6D ≥ 3.5 + surprise ≥ 3.0 + 분량 ≥ 2,000자 통과한 ep만 추출 → CGB에 ingest.

```bash
# 미리보기 (실행 안 함)
DATABASE_URL=... node scripts/ingest-best-eps.js --limit 10 --dry

# fantasy 장르만
DATABASE_URL=... node scripts/ingest-best-eps.js --limit 10 --genre fantasy --dry

# 실제 ingest
DATABASE_URL=... node scripts/ingest-best-eps.js --limit 10 --genre fantasy
```

**중요**: Phase A/B 적용된 코드가 24~48h 작동한 후에 실행해야 의미 있는 결과 나옴 (옛 코드로 만든 ep77/ep30 같은 폭주 본문이 ingest되면 학습이 잘못된 방향으로 감).

### 2. 저작권 만료 텍본 (선택)

저작권은 작가 사망 후 70년 만료 (한국 기준). 2026년 기준으로 **1955년 이전 사망자** 작품 사용 가능.

| 작가 | 사망 | 작품 후보 |
|------|------|----------|
| 이광수 | 1950 | "무정", "흙", "사랑" — 한국 근대 소설의 원형 |
| 김광주 | 1953 | "장강일기", "비호" — 무협 기원 |
| 신채호 | 1936 | "꿈하늘" — 환상 / 상징 |
| 한용운 | 1944 | "흑풍" — 항일 / 무협 요소 |

저작권 만료 텍스트는 다음 사이트에서 무료 다운로드 가능:
- 한국 국립중앙도서관 디지털 컬렉션
- 위키문헌 (ko.wikisource.org)
- 프로젝트 구텐베르크 한국어 자료

다운로드 후 사용:
```bash
node scripts/ingest-novel.js ~/Downloads/이광수-무정.txt \
  --title "무정 (이광수, 1917)" \
  --genre romance \
  --agent cadence
```

## CGB가 흡수하는 것

`TextIngestionService.ingest()` (이미 구현됨)는 본문을 다음으로 분해:

1. **챕터 분리** (PageIndex 트리 또는 정규식 fallback)
2. **각 챕터에서 추출**:
   - `nodeRole='summary'` — 챕터 요약 1개
   - `nodeRole='style'` — 명문장 최대 3개
   - `nodeRole='dialogue'` — 대화 샘플 최대 5개
   - `nodeRole='concept'` — LLM이 추출한 핵심 개념
   - `nodeRole='style-analysis'` — 문체 분석

3. **CGB 노드로 영속**:
   - Idea 노드 + BELONGS_TO 엣지 (Domain) + USES_CONCEPT 엣지

## 자동 주입 경로

ingestion 후 다음 ep 생성 시:

```
StoryOrchestrator → BrainClient.getBrainContext(`${genre} style 명문장 대화 문체`)
  → CGB graph_hybrid_search (cosine + BM25 + BFS)
  → ContextComposer.addStyleReferences(top 3 nodes)
  → WritingHarness 시스템 프롬프트에 주입
```

## 검증

ingest 후 다음 cron에 ep 생성될 때:

```sql
-- CGB Idea 노드 중 우수 본문 출처 확인
SELECT type, title, metadata->'nodeRole' AS role, metadata->>'qualityScore' AS quality
FROM graph_nodes
WHERE metadata->>'nodeRole' IN ('good-pattern', 'style', 'dialogue')
ORDER BY created_at DESC
LIMIT 20;
```

라이브 ep1 본문이 클리셰 대신 ingest된 본문 패턴을 따르는지 직접 정독.

## 일정

- **5/12 (D-1) 저녁**: 첫 회차 ingest. 24h 작동한 Phase A/B 코드로 만든 ep 중 통과작 추출.
- **5/15+ (D+2)**: 추가 회차. 새로 만들어진 우수 ep 누적 ingest.
- **6/1+ (D+19)**: 30화 도달 시점. 그동안 누적된 우수 ep으로 후반부 화 자동 강화.

## 주의

- **dry-run 먼저**: `--dry` 로 어떤 ep가 추출되는지 확인 후 실제 ingest
- **장르 분리**: fantasy 시리즈 작성용은 fantasy ep만, romance용은 romance만
- **품질 임계값**: 첫 회차는 `--limit 10` 정도. 너무 많이 ingest하면 그래프 노이즈
- **중복 방지**: TextIngestionService 내부 `domainId = source-hash()` 자동 dedup
