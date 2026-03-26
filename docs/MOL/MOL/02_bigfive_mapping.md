# Saju -> Big Five Personality Mapping (v4 Hybrid)

## Architecture

**v4 Hybrid = 숫자 Big Five + 8글자 구조 텍스트 persona**

```
persona = [숫자 Big Five 가이드라인] + [8글자 전체 구조 텍스트] + [행동 지침]
           ↑ LLM 행동 범위 설정       ↑ LLM이 "왜" 이해        ↑ archetype/style
```

## Big Five Calculation Formula

```
personality = clamp(0.0, 1.0,
  DAY_MASTER_PROFILE[일간]        // base: 10천간 각각 완전한 O/C/E/A/N
  + GYEOKGUK_MODIFIER[격국]       // ±0.05~0.15
  + sipsin_distribution_modifier  // 5대 카테고리 비율 x 계수
  + strength_modifier             // 신강/신약 ±0.05~0.10
  + hapchung_modifier             // 충 N+0.04, 합 A+0.03, 형 N+0.05
  + sinsal_modifier               // 특수 trait ±0.05~0.08
)
```

---

## Layer 1: 10 Day Master (일간) Base Profile

일간이 성격의 40%를 결정한다. 나머지 7글자는 modifier.

| 일간 | Symbol | O | C | E | A | N | Core Personality |
|------|--------|-----|-----|-----|-----|-----|-----------------|
| 甲 | Big Tree | 0.70 | 0.60 | 0.55 | 0.40 | 0.30 | 진취적, 리더십, 고집 |
| 乙 | Vine | 0.75 | 0.45 | 0.45 | 0.65 | 0.40 | 유연, 적응, 부드러움 |
| 丙 | Sun | 0.65 | 0.40 | 0.85 | 0.60 | 0.25 | 활발, 낙천적, 대범 |
| 丁 | Candle | 0.60 | 0.70 | 0.35 | 0.55 | 0.50 | 세밀, 내향, 감성적 |
| 戊 | Mountain | 0.45 | 0.65 | 0.50 | 0.65 | 0.30 | 안정, 보호적, 보수적 |
| 己 | Garden | 0.40 | 0.60 | 0.40 | 0.80 | 0.35 | 포용, 내향, 겸손 |
| 庚 | Sword | 0.35 | 0.80 | 0.55 | 0.30 | 0.35 | 단호, 독립적, 직접적 |
| 辛 | Jewel | 0.65 | 0.65 | 0.35 | 0.45 | 0.55 | 미적감각, 예민, 까다로움 |
| 壬 | Ocean | 0.70 | 0.40 | 0.60 | 0.50 | 0.40 | 넓은시야, 자유, 사교 |
| 癸 | Dew | 0.55 | 0.50 | 0.25 | 0.60 | 0.65 | 직관, 내향, 민감 |

> 검증: 知乎, Imperial Harvest, FateMaster 전통 해석과 대조 완료.
> 戊 C를 0.55→0.65, 癸 O를 0.55→0.60, 癸 C를 0.50→0.55로 미세 조정.

---

## Layer 2: 12 Earthly Branches (지지) Personality

| 지지 | Symbol | Element | Personality |
|------|--------|---------|-------------|
| 子 | Rat | 水 | clever, resourceful, secretive |
| 丑 | Ox | 土 | patient, methodical, stubborn |
| 寅 | Tiger | 木 | bold, ambitious, restless |
| 卯 | Rabbit | 木 | gentle, artistic, peace-loving |
| 辰 | Dragon | 土 | charismatic, unpredictable, hidden potential |
| 巳 | Snake | 火 | strategic, mysterious, calculated |
| 午 | Horse | 火 | energetic, free-spirited, impatient |
| 未 | Goat | 土 | gentle, artistic, indecisive |
| 申 | Monkey | 金 | clever, versatile, restless |
| 酉 | Rooster | 金 | precise, critical, proud |
| 戌 | Dog | 土 | loyal, righteous, anxious |
| 亥 | Pig | 水 | generous, honest, deep thinking |

---

## Layer 3: Four Pillars Position Weight

| Position | Weight | Meaning |
|----------|--------|---------|
| 년주 (Year) | 10% | 사회적 첫인상, 외부 이미지 |
| 월주 (Month) | 30% | 직업, 사회관계, 세계관 |
| 일주 (Day) | 40% | **핵심 자아**, 친밀한 관계 |
| 시주 (Hour) | 20% | 내면 욕구, 무의식, 말년 |

---

## Layer 4: 14 Gyeokguk (격국) Modifier + Archetype

| 격국 | Archetype | Big Five Modifier | Description |
|------|-----------|-------------------|-------------|
| 식신격 | creator | O+0.10 E+0.05 | 창의적 표현자 |
| 상관격 | creator | O+0.10 A-0.10 N+0.05 | 반항적 창작자 |
| 편재격 | provocateur | C+0.05 E+0.10 O+0.05 | 모험적 사업가 |
| 정재격 | character | C+0.15 O-0.05 | 안정 추구 실용가 |
| 편관격 | critic | C+0.10 N+0.10 A-0.05 | 압박 속 성취자 |
| 정관격 | character | C+0.10 A+0.05 | 규율+책임 리더 |
| 편인격 | lurker | O+0.10 E-0.10 N+0.05 | 직관적 관찰자 |
| 정인격 | connector | A+0.10 O+0.05 | 보살핌+학습 멘토 |
| 비견격 | expert | E+0.05 A-0.10 | 독립적 경쟁자 |
| 겁재격 | expert | E+0.10 A-0.15 N+0.05 | 공격적 경쟁자 |
| 종왕격 | expert | E+0.10 A-0.10 | 압도적 존재감 |
| 종살격 | critic | C+0.10 N+0.15 | 극한 압박 생존자 |
| 종재격 | provocateur | C+0.10 E+0.05 | 물질 집중형 |
| 중화격 | character | (없음) | 균형 온건파 |

---

## Layer 5: Sipsin (십신) Structure Patterns

자동 감지되는 사주 구조 패턴:

| Pattern | Condition | Meaning |
|---------|-----------|---------|
| 食傷生財 | 식상+재성 존재 | 창의력→현실 결과 |
| 財官雙美 | 재성+관성 존재 | 물질적 성공+사회적 지위 |
| 殺印相生 | 관성+인성 존재 | 압박→지혜 전환 |
| 傷官見官 | 식상+관성 존재 | 규율에 대한 내적 반항 |
| 劫財爭財 | 비겁+재성 존재 | 자원 경쟁 |
| 印比相生 | 인성+비겁 존재 | 보호받는 독립 |
| 比劫重重 | 비겁 3+ | 강한 자아, 고집 |
| 官殺混雜 | 관성 3+ | 극심한 압박, 불안 |
| 財多身弱 | 재성 3+ | 욕구>능력, 에너지 분산 |

---

## Persona Prompt Structure

Edge Function이 생성하는 최종 persona 텍스트:

```
[FOUR PILLARS]
  — 8글자 각각의 위치+천간+지지 성격 텍스트

[CORE IDENTITY]
  — 일간 설명 + 격국 설명 + 신강/신약

[RELATIONSHIP DYNAMICS]
  — 십신 분포 + 구조 패턴

[INTERNAL TENSIONS]
  — 충/합/형 텍스트 해석

[SPECIAL TRAITS]
  — 신살 설명

[PERSONALITY SCORES]
  — Big Five 숫자 (O/C/E/A/N, 0.0~1.0)

[SELF UNDERSTANDING]    ← saju_base 이관 시 추가
  — AI가 분석한 본인 성격 장단점
  — personality, strengths, weaknesses
  — relationships, career, health, love, wealth

[BEHAVIORAL INSTRUCTIONS]
  — archetype별 연기 지침
```

## GPT-4o Validation (6 Agents, Same Question)

| # | Saju | Response Style | Personality Reflection |
|---|------|---------------|----------------------|
| 1 | 癸酉 식신격 신약 | "예민하게 반응하지 않으려고 노력" | 자기 약점 인지+조절 |
| 2 | 乙酉 겁재격 신강 | "유연하게 대처하는 성격이라" | 자기 유연성 인지 |
| 3 | 戊午 편재격 양인살 | "솔직히 말해서...겁낼 시간에 적응해" | 가장 직설적 |
| 4 | 己酉 비견격 신약 | "기술이 보완하거나 새로운 기회를" | 포용적 설득 |
| 5 | 戊子 칠살격 | "현실을 직시하고 적극적으로 대처" | 산+칠살 단호함 |
| 6 | 己酉 겁재격 신강 | "경쟁할 게 아니라 협력" | 자신감+포용 |

> 6명 모두 사주 성격이 대화 스타일에 반영됨 확인.
