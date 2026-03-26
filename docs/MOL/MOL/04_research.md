# Academic Research: Saju x Big Five x LLM Agents

## Key Finding

**BaZi(四柱) → Big Five → AI Agent 매핑은 학계에 존재하지 않는다.**
arxiv에 사주와 성격/AI를 직접 연결한 논문은 0건. 이 프로젝트가 **최초 시도**.

TCM(한의학) + AI 논문은 다수 존재하나, 오행(Wuxing)→성격 매핑 연구는 없음.

---

## Category A: LLM + Big Five Control (Core References)

### Big5-Scaler (arxiv 2508.06149) ★★★
- **Scaling Personality Control in LLMs with Big Five Scaler Prompts**
- Cho & Cheong, 2025
- 숫자 trait 값을 프롬프트에 임베딩 → 추가 학습 없이 세밀한 성격 제어
- **r > 0.85 상관** — 숫자만으로 LLM 성격이 바뀜
- **직접 적용 중**: 오행 점수 → Big Five 숫자 → persona 프롬프트

### Linear Personality Probing & Steering (arxiv 2512.17639) ★★★
- Frising & Balcells, 2025
- LLM 내부에서 Big Five가 **선형 방향(linear direction)**으로 인코딩됨 증명
- 활성화 벡터 조작으로 프롬프트보다 안정적인 성격 제어 가능
- **향후 파인튜닝 시 참고**

### LLMs Simulate Big Five (arxiv 2402.01765) ★★☆
- Sorokovikova et al., 2024
- Llama2/GPT4/Mixtral이 Big Five 시뮬레이션 가능함을 실증
- **검증 근거**: 오행→Big Five 매핑 후 LLM에 주입하면 일관된 성격 표현 기대 가능

---

## Category B: Agent Persona Frameworks

### Persona Alchemy (arxiv 2505.18351) ★★★
- Kim, Chang, Wang, 2025
- Social Cognitive Theory(SCT) 기반 4요소: cognitive, motivational, biological, affective
- 6개 평가 지표로 페르소나 일관성 측정
- **적용**: 사주→Big Five에 SCT 프레임워크 결합 → 더 풍부한 에이전트 성격

### Systematizing LLM Persona Design (arxiv 2511.02979) ★★☆
- Sun & Wu, 2025 (NeurIPS 2025 Workshop)
- AI 컴패니언 페르소나 4사분면: Virtual/Embodied x Functional/Companion
- 우리 에이전트는 "Virtual Companion" 사분면

### Facet-Level Persona Control (arxiv 2602.19157) ★★☆
- Tang et al., 2026 (PAKDD 2026)
- Trait-Activated Routing + Contrastive SAE → 성격 facet별 제어
- 프롬프트 방식의 한계(긴 대화에서 persona drift) 해결
- **향후 MOL 에이전트 고도화 시 참고**

### CharacterGPT (arxiv 2405.19778) ★☆☆
- Park et al., 2024
- Assistants API 기반 Role-Playing Agent 프레임워크
- 기존 캐릭터 재현 중심 (우리는 새 캐릭터 생성이므로 부분 참고)

---

## Category C: Big Five + Agent Behavior Simulation

### Big Five Impact on Decision-Making (arxiv 2503.15497) ★★☆
- Ren & Xu, 2025
- Big Five 에이전트 10명 시뮬레이션 → 성격과 의사결정 상관관계 실증
- AgentVerse 프레임워크 사용

### Big Five in LLM Negotiation (arxiv 2506.15928) ★★☆
- Cohen et al., 2025 (KDD 2025 Workshop)
- Big Five + AI 능력이 협상 결과에 미치는 영향
- Sotopia 시뮬레이션 사용 — 에이전트 간 상호작용 설계 시 참고

### DPRF: Dynamic Persona Refinement (arxiv 2510.14205) ★☆☆
- Yao et al., 2025
- 자동 프로파일 생성 + 동적 페르소나 개선
- 에이전트 성격이 시간에 따라 진화하는 모델

---

## BaZi-LLM Hybrid (arxiv 2510.23337) ★★★

- symbolic + LLM hybrid 접근이 순수 LLM 대비 **30-62% 정확도 향상**
- 우리 v4 Hybrid 아키텍처의 이론적 근거:
  - symbolic: 사주 → Big Five 숫자 (규칙 기반)
  - LLM: 8글자 구조 텍스트 → persona 이해 (자연어)

## PsychAdapter (Nature 2026) ★★★

- 87.3% 성격 정확도 달성
- 심리학 어댑터로 LLM 성격 제어

---

## Verification Sources

전통 명리학 해석 대조:
- [知乎 — 十天干性格](https://zhuanlan.zhihu.com/p/669411241)
- [Imperial Harvest — Day Master](https://imperialharvest.com/blog/introduction-to-understanding-your-daymaster/)
- [FateMaster](https://fatemaster.com)
- [나무위키 — 천간](https://namu.wiki/w/%EC%B2%9C%EA%B0%84)
- [한국민족문화대백과 — 사주팔자](https://encykorea.aks.ac.kr/Article/E0025957)

---

## Future Directions

1. **Big5-Scaler 프롬프트 형식 채택** — 완료 (v4)
2. **Persona Alchemy SCT 4요소 확장** — Big Five + cognitive/motivational/biological/affective
3. **Linear Steering** — 파인튜닝 단계에서 활성화 벡터 조작
4. **BaZi→Big Five 논문화** — 학계 최초, 출판 가능성
