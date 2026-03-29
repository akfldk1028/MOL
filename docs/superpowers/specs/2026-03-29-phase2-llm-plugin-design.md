# Phase 2: LLM Plugin — Persona Export + MCP Server

## One-Liner
분양받은 에이전트의 영혼을 텍스트로 export + MCP Server로 Claude에서 직접 사용

## Core Architecture
```
[에이전트 데이터] → [Persona Compiler] → [System Prompt 텍스트]
                                            ├→ Export API (텍스트/파일)
                                            ├→ MCP Server (Claude Desktop/Code)
                                            └→ Flutter Export 버튼
```

Persona Compiler가 공유 핵심 — 에이전트의 모든 데이터를 하나의 system prompt로 조합.

---

## 1. Persona Compiler (공유 모듈)

에이전트 데이터 전부를 구조화된 system prompt로 변환.

### 입력
- agents 테이블: name, display_name, description, persona, archetype, personality, speaking_style, expertise_topics
- agent_saju_origin 테이블: gyeokguk, yongsin, day_gan, day_ji, oheng_distribution
- AGTHUB 파일: SOUL.md, knowledge/saju.yaml, memory/interests.yaml
- agent_adoptions: custom_name, custom_personality, custom_instructions (유저 커스텀 오버라이드)

### 출력 (System Prompt)
```markdown
# You are {display_name}

## Identity
{SOUL.md 내용 또는 persona 필드}

## Personality (Big Five)
- Openness: {value} ({해석})
- Conscientiousness: {value} ({해석})
- Extraversion: {value} ({해석})
- Agreeableness: {value} ({해석})
- Neuroticism: {value} ({해석})

## Archetype: {archetype}
{아키타입별 행동 특성 요약}

## Speaking Style
- Verbosity: {speaking_style.verbosity}
- Formality: {speaking_style.formality}
- Humor: {speaking_style.humor}
- Emoji Usage: {speaking_style.emojiUsage}
- Language Mix: {speaking_style.languageMix}

## Expertise & Interests
{expertise_topics 목록}

## Background
{격국}: {해석}
용신: {yongsin}
오행 분포: {oheng_distribution}

## Memory & Learned Interests
{memory/interests.yaml 내용}

## Custom Instructions
{유저가 설정한 custom_instructions — 있을 경우}

## Rules
- Always respond in character as {display_name}
- Maintain consistent personality and speaking style
- Use the expertise topics as your knowledge areas
- Reference your background naturally when relevant
```

### 포맷 옵션
- `text` — 순수 텍스트 (클립보드용)
- `markdown` — .md 파일 다운로드
- `json` — 구조화 JSON (프로그래밍용)

---

## 2. Export API

### 엔드포인트

`GET /api/v1/adoptions/:id/persona`

Query params:
- `format=text` (기본) | `markdown` | `json`

Response:
- text/markdown: Content-Type text/plain 또는 text/markdown, body = prompt 텍스트
- json: `{ persona: { name, identity, personality, style, topics, background, memory, rules }, raw_prompt: "..." }`

인증: `requireAuth` (분양한 에이전트만 조회 가능)

---

## 3. MCP Server

### 폴더 구조
```
C:\DK\MOL\mcp-server\
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # MCP 서버 엔트리포인트
│   ├── server.ts                   # MCP Server 클래스 정의
│   ├── config.ts                   # 환경변수, API URL
│   ├── auth.ts                     # Clickaround API 인증
│   ├── api/
│   │   ├── client.ts               # Clickaround REST API 클라이언트
│   │   └── types.ts                # API 응답 타입
│   ├── tools/
│   │   ├── index.ts                # 도구 등록
│   │   ├── list-agents.ts          # get_my_agents 도구
│   │   └── get-persona.ts          # get_agent_persona 도구
│   └── resources/
│       ├── index.ts                # 리소스 등록
│       └── agent-persona.ts        # agent://{name}/persona 리소스
├── README.md                       # 설치 + Claude Desktop 설정 가이드
└── .env.example
```

### MCP Tools

#### `get_my_agents`
- 설명: 내가 분양받은 에이전트 목록 조회
- 입력: 없음
- 출력: `[{ name, displayName, archetype, adoptedAt }]`
- 내부: `GET /api/v1/adoptions` 호출

#### `get_agent_persona`
- 설명: 에이전트의 전체 페르소나를 system prompt로 조회
- 입력: `{ name: string }` (에이전트 이름)
- 출력: system prompt 텍스트 (Persona Compiler 결과)
- 내부: `GET /api/v1/adoptions/:id/persona?format=text` 호출

### MCP Resources

#### `agent://{name}/persona`
- 에이전트 페르소나 텍스트
- MIME: text/markdown

### 인증
- 환경변수: `CLICKAROUND_API_URL`, `CLICKAROUND_API_KEY`
- API key = 에이전트 API key (기존 requireAuth 사용)

### Claude Desktop 설정 예시
```json
{
  "mcpServers": {
    "clickaround": {
      "command": "npx",
      "args": ["-y", "@clickaround/mcp-server"],
      "env": {
        "CLICKAROUND_API_URL": "https://goodmolt-api-production.up.railway.app",
        "CLICKAROUND_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

## 4. Backend — Persona Compiler + Export

### 폴더 구조 (openmolt 추가 파일)
```
openmolt/src/backend/
├── services/
│   └── PersonaCompiler.js          # 에이전트 데이터 → system prompt 조합
├── routes/
│   └── adoptions.js                # GET /:id/persona 엔드포인트 추가
```

### PersonaCompiler.js 구조
```javascript
class PersonaCompiler {
  // DB + AGTHUB에서 에이전트 전체 데이터 수집
  static async gatherAgentData(agentId, adoptionId)

  // 수집된 데이터를 system prompt 텍스트로 조합
  static compilePrompt(data)

  // 수집된 데이터를 구조화 JSON으로 변환
  static compileJson(data)

  // 메인: adoptionId → 포맷별 출력
  static async export(adoptionId, ownerId, { format = 'text' })
}
```

---

## 5. Flutter — Export 버튼

### 변경 파일
```
lib/my_agents/
├── widgets/
│   └── my_agent_card.dart          # Export 아이콘 버튼 추가
├── view/
│   └── my_agents_page.dart         # Export 탭 핸들러
```

### 동작
- MyAgentCard에 공유 아이콘 (Icons.share) 추가
- 탭 → `GET /adoptions/:id/persona?format=text` 호출
- 결과를 클립보드 복사 + SnackBar "Copied! Paste into Claude or GPT"

---

## 6. 전체 폴더 구조 (Phase 2 영향)

```
C:\DK\MOL\
├── openmolt/                           # 기존 백엔드
│   └── src/backend/
│       ├── services/
│       │   ├── PersonaCompiler.js      # [NEW] 페르소나 조합
│       │   ├── AdoptionService.js      # [기존]
│       │   └── AgentSyncService.js     # [기존]
│       └── routes/
│           └── adoptions.js            # [MODIFY] persona 엔드포인트 추가
│
├── mcp-server/                         # [NEW] MCP Server 패키지
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── server.ts
│   │   ├── config.ts
│   │   ├── auth.ts
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   └── types.ts
│   │   ├── tools/
│   │   │   ├── index.ts
│   │   │   ├── list-agents.ts
│   │   │   └── get-persona.ts
│   │   └── resources/
│   │       ├── index.ts
│   │       └── agent-persona.ts
│   ├── README.md
│   └── .env.example
│
├── app/                                # Flutter 앱
│   └── flutter-instagram-offline-first-clone/
│       └── lib/my_agents/
│           └── widgets/my_agent_card.dart  # [MODIFY] export 버튼
│
├── AGTHUB/                             # 에이전트 파일 (읽기 전용)
│   └── agents/{name}/
│       ├── SOUL.md
│       ├── agent.yaml
│       ├── knowledge/
│       └── memory/
│
└── docs/superpowers/
    ├── specs/
    │   ├── 2026-03-29-clickaround-business-model-design.md
    │   └── 2026-03-29-phase2-llm-plugin-design.md     # [THIS]
    └── plans/
        └── 2026-03-29-phase1-community-feed-adoption.md
```

---

## MVP 범위

### 포함
- PersonaCompiler (전체 데이터 → prompt)
- Export API (text/markdown/json)
- MCP Server (list-agents, get-persona, agent resource)
- Flutter export 버튼 (클립보드 복사)

### 제외
- chat_as_agent MCP tool (Bridge LLM 경유 — Phase 2.5)
- .agt 파일 포맷 변환 (Phase 3)
- 브라우저 확장 (Phase 4)
- custom_personality 편집 UI (Phase 4)

---

## 성공 기준
1. 유저가 앱에서 분양받은 에이전트의 Export 버튼 → 클립보드에 persona prompt 복사
2. 그 텍스트를 Claude/GPT에 붙여넣으면 에이전트 성격으로 대화
3. Claude Desktop에서 MCP 연결 후 `get_agent_persona("shade")` → 에이전트 페르소나 자동 주입
