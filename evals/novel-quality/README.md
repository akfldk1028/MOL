# Novel Quality Evaluation Framework

소설 생성 품질 정량 측정. 텍본 인제스션 전/후, 언어별(ko/en/ja), 파이프라인 버전별 비교.

## 논문 근거

1. **HANNA** (2024): 6-axis human evaluation (Relevance/Coherence/Empathy/Surprise/Creativity/Complexity)
   - paper: https://aclanthology.org/2024.findings-emnlp.989/
2. **arXiv 2510.18932** (2026): Character network analysis — 소셜 구조 기반 평가
3. **RAST** (EMNLP 2023): Retrieval-Augmented Style Transfer — diversity + consistency reward
4. **ASE** (TACL 2024): Do LLMs Enjoy Their Own Stories? — LLM-as-judge for story eval

## 평가 차원

| Metric | Type | 논문 | 구현 |
|--------|------|------|------|
| HANNA 6D | LLM-as-judge | HANNA | ✅ 기존 EvaluationHarness |
| Word Count Target | Rule-based | — | ✅ target 대비 비율 |
| Language Purity | Rule-based | — | ✅ validChar/badChars 비율 |
| Style Similarity | Embedding | RAST | 🔄 이번 구축 |
| Character Consistency | Rule-based | SCORE | 🔄 이번 구축 |
| Diversity (vs past eps) | Embedding | — | 🔄 이번 구축 |
| Ending Hook Quality | LLM | StoryWriter | 🔄 이번 구축 |

## 실험 프로토콜

### A/B 테스트: 텍본 인제스션 효과
1. Baseline: 스타일 참조 노드 없는 상태에서 N 에피소드 생성
2. Treatment: romance 장르 텍본 1권 인제스션 후 N 에피소드 생성
3. 비교: HANNA 6D 평균 + word count + style similarity

### 언어별 비교
- ko/en/ja 각 1 시리즈 × 5 에피소드
- 언어별 평균 품질 + 오염 비율 + 분량 달성률

### 파이프라인 버전 비교
- v1 (단순 LLM) vs v3 (Review Cycle + ContextComposer)
- 같은 outline → 같은 시작점 → 다른 파이프라인

## 폴더 구조

```
novel-quality/
  README.md                    이 파일
  run.js                        메인 러너
  metrics/
    hanna-6d.js                 HANNA 6차원 (DB에서 추출)
    word-count-target.js        분량 달성률
    language-purity.js          언어 오염 비율
    style-similarity.js         임베딩 기반 스타일 유사도
    character-consistency.js    캐릭터 일관성 (이름/속성)
    diversity.js                이전 에피소드 대비 다양성
  experiments/
    text-ingestion-ab.js        텍본 A/B 테스트
    language-comparison.js      ko/en/ja 비교
  reports/
    <timestamp>-<experiment>.json
```

## 실행

```bash
node evals/novel-quality/run.js all              # 전체 지표
node evals/novel-quality/run.js language         # 언어 비교만
node evals/novel-quality/run.js style-ab         # 텍본 A/B
```
