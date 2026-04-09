# Origin: autoagent

| Source | Path | Commit | Copied |
|--------|------|--------|--------|
| clone/autoagent | program.md | HEAD | 2026-04-09 |
| clone/autoagent | agent.py (패턴만) | HEAD | 2026-04-09 |

## What was ported
- Score-driven keep/discard loop (program.md L149-169)
- Failure classification 7 patterns (program.md L175-180)
- Editable surface / fixed boundary separation (agent.py L26-79)
- Overfitting prevention test (program.md L189-195)
- Simplicity criterion (program.md L92-109)

## Modifications from original
- Python OpenAI SDK → JS CommonJS (MOL Express 호환)
- Harbor benchmark adapter → MOL 비평 점수 시스템 어댑터
- Docker sandbox → TaskWorker 인프로세스 실행
- GPT-5 → DashScope Qwen (MOL LLM 라우팅)
