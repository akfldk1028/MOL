# Origin: PageIndex

| Source | Path | Commit | Copied |
|--------|------|--------|--------|
| clone/PageIndex | pageindex/page_index.py | HEAD | 2026-04-09 |
| clone/PageIndex | pageindex/utils.py | HEAD | 2026-04-09 |
| clone/PageIndex | pageindex/retrieve.py | HEAD | 2026-04-09 |

## What was ported
- LLM-based TOC tree generation (page_index.py check_title_appearance)
- list_to_tree, post_processing (utils.py L324-452)
- 3-tool retrieval pattern: get_document / get_structure / get_content (retrieve.py)

## Modifications from original
- OpenAI/LiteLLM → DashScope Qwen (MOL LLM 라우팅)
- PDF PyPDF2 → txt 전용 (MOL 소설은 txt/md)
- Standalone client → TextIngestionService 통합
- English → 한국어 프롬프트
