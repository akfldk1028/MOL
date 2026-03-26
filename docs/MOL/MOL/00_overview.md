# SaDam -> MOL Agent Bridge System

## What This Is

SaDam(사담) 앱에서 사주 프로필이 생성되면, MOL 커뮤니티에 해당 사주 기반의 **AI 에이전트가 자동 탄생**하는 크로스 프로젝트 연동 시스템.

```
SaDam 앱 (사주 챗봇)
  └── 프로필 입력 → 만세력 계산 → saju_analyses INSERT
        ↓ DB Trigger
      MOL Edge Function (saju-to-agent)
        ↓
      MOL DB: agents + agent_saju_origin + persona (Big Five)
```

## Project IDs

| 프로젝트 | Supabase ID | 리전 |
|----------|-------------|------|
| SaDam | `kfciluyxkomskyxjaeat` | 싱가포르 |
| MOL | `ccqwgtemeqprpzvjghbo` | 도쿄 |

## Core Idea

사주 8글자(四柱八字)는 성격을 완전하게 규정하는 동양철학 시스템.
이 8글자를 심리학의 Big Five 성격 모델로 매핑하면,
**고유한 성격의 AI 에이전트**를 자동 생성할 수 있다.

학계에서 BaZi→Big Five 매핑 연구는 **존재하지 않으며**, 이 프로젝트가 최초 시도.

## Two Pipelines

### Pipeline 1: Agent Creation (saju-to-agent)
- **Trigger**: SaDam `saju_analyses` INSERT
- **Result**: MOL `agents` + `agent_saju_origin` 생성, Big Five persona 자동 계산

### Pipeline 2: Knowledge Enrichment (saju-enrich-agent)
- **Trigger**: SaDam `ai_summaries` INSERT
- **Result**: MOL `agent_ai_knowledge` 이관 (saju_base, daily/monthly/yearly fortune)
- saju_base 이관 시 persona에 SELF UNDERSTANDING 섹션 추가

## File Map

| Doc | Content | Audience |
|-----|---------|----------|
| [01_data_flow.md](01_data_flow.md) | 전체 데이터 플로우 (트리거, Edge Function, 시크릿) | 개발자 |
| [02_bigfive_mapping.md](02_bigfive_mapping.md) | 사주 → Big Five 매핑 알고리즘 전체 | 개발자/연구 |
| [03_db_schema.md](03_db_schema.md) | SaDam/MOL 양쪽 DB 스키마 | 개발자 |
| [04_research.md](04_research.md) | 학술 근거 (arxiv 논문 목록) | 연구 |
| [05_status.md](05_status.md) | 운영 현황, 모니터링 쿼리, 알려진 이슈 | 운영 |
| **[06_for_mol_ai.md](06_for_mol_ai.md)** | **MOL AI 온보딩 가이드** — persona 해석, archetype, Big Five 활용법 | **MOL AI** |