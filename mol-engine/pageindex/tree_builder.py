"""
LLM 기반 문서 계층 트리 생성
@origin clone/PageIndex pageindex/page_index.py

원본에서 가져온 핵심 알고리즘:
  - generate_toc_init / generate_toc_continue (L542-574): 텍스트→TOC 추출
  - check_title_appearance (L13-45): 제목 위치 LLM 검증
  - check_title_appearance_in_start (L48-71): 섹션 시작 위치 검증
  - page_list_to_group_text (L426-459): 토큰 기반 텍스트 분할
  - post_processing (utils.py L433-452): 플랫→트리 변환 + start/end 보정

MOL 수정:
  - LiteLLM → core.llm (DashScope Qwen)
  - PDF page_list → txt offset 기반
  - asyncio.gather 병렬 검증 유지 (원본 L74-99)
"""

import asyncio
import copy
import json
import logging
import math
import re
from typing import Optional

from core.llm import get_provider
from .tree_utils import list_to_tree, post_processing

logger = logging.getLogger(__name__)


# ─── LLM helpers ───

async def _llm_generate(prompt: str, max_tokens: int = 2048, temperature: float = 0) -> str:
    """core.llm provider로 LLM 호출."""
    provider = get_provider()
    try:
        return await provider.generate(prompt, max_tokens=max_tokens, temperature=temperature)
    except Exception as e:
        logger.warning("LLM call failed: %s", e)
        return ""


def _extract_json(content: str):
    """LLM 응답에서 JSON 추출. @origin PageIndex utils.py extract_json()"""
    try:
        start = content.find("```json")
        if start != -1:
            start += 7
            end = content.rfind("```")
            json_content = content[start:end].strip()
        else:
            json_content = content.strip()
        json_content = json_content.replace('None', 'null')
        json_content = json_content.replace('\n', ' ').replace('\r', ' ')
        json_content = ' '.join(json_content.split())
        return json.loads(json_content)
    except json.JSONDecodeError:
        try:
            json_content = json_content.replace(',]', ']').replace(',}', '}')
            return json.loads(json_content)
        except Exception:
            return {}


# ─── Text segmentation (원본 page_list_to_group_text L426-459) ───

def _text_to_groups(text: str, max_chars: int = 40000, overlap_chars: int = 500) -> list[dict]:
    """텍스트를 오프셋 태그 포함 청크로 분할.

    @origin PageIndex page_list_to_group_text() — 토큰→문자 기반으로 변환.
    각 청크에 <offset_N> 태그를 삽입하여 LLM이 위치를 추적.
    """
    if len(text) <= max_chars:
        return [{"text": f"<offset_0>\n{text}\n<offset_{len(text)}>", "start": 0, "end": len(text)}]

    # 문단 단위로 분할
    paragraphs = re.split(r'\n{2,}', text)
    groups = []
    current_text = ""
    current_start = 0
    char_pos = 0

    for para in paragraphs:
        para_len = len(para) + 2  # \n\n
        if len(current_text) + para_len > max_chars and current_text:
            tagged = f"<offset_{current_start}>\n{current_text}\n<offset_{char_pos}>"
            groups.append({"text": tagged, "start": current_start, "end": char_pos})
            # overlap
            overlap_start = max(0, char_pos - overlap_chars)
            current_text = text[overlap_start:char_pos]
            current_start = overlap_start
        current_text += para + "\n\n"
        char_pos += para_len

    if current_text.strip():
        tagged = f"<offset_{current_start}>\n{current_text}\n<offset_{len(text)}>"
        groups.append({"text": tagged, "start": current_start, "end": len(text)})

    return groups


# ─── TOC generation (원본 generate_toc_init L542-574 + generate_toc_continue L507-539) ───

_TOC_INIT_PROMPT = """You are an expert in extracting hierarchical tree structure from text.
Your task is to generate the tree structure of the document.

The structure variable is the numeric system which represents the index of the hierarchy section.
For example: first section = "1", first subsection = "1.1", second subsection = "1.2", etc.

For the title, extract the original title from the text, only fix space inconsistency.

The text contains tags like <offset_N> to indicate character positions.
For physical_index, extract the offset number where the section starts. Keep the <offset_N> format.

Response format:
[
    {"structure": "1", "title": "section title", "physical_index": "<offset_N>"},
    {"structure": "1.1", "title": "subsection title", "physical_index": "<offset_N>"},
    ...
]

Directly return the JSON array. Do not output anything else."""

_TOC_CONTINUE_PROMPT = """You are an expert in extracting hierarchical tree structure.
Continue the tree structure from the previous part to include the current part.

Structure: "1", "1.1", "1.2", "2", etc.
Text contains <offset_N> tags for positions.

Previous structure:
{prev_structure}

Current text:
{current_text}

Return ONLY the ADDITIONAL sections (not the previous ones). JSON array format.
Directly return the JSON array. Do not output anything else."""


async def _generate_toc_init(text_group: str) -> list[dict]:
    """첫 번째 청크에서 TOC 초기 생성. @origin generate_toc_init()"""
    prompt = _TOC_INIT_PROMPT + "\n\nGiven text:\n" + text_group
    response = await _llm_generate(prompt)
    result = _extract_json(response)
    return result if isinstance(result, list) else []


async def _generate_toc_continue(prev_toc: list[dict], text_group: str) -> list[dict]:
    """후속 청크에서 TOC 확장. @origin generate_toc_continue()"""
    prompt = _TOC_CONTINUE_PROMPT.format(
        prev_structure=json.dumps(prev_toc, ensure_ascii=False, indent=2),
        current_text=text_group,
    )
    response = await _llm_generate(prompt)
    result = _extract_json(response)
    return result if isinstance(result, list) else []


# ─── Title verification (원본 check_title_appearance L13-45 + concurrent L74-99) ───

async def _check_title_in_text(title: str, text_chunk: str) -> dict:
    """섹션 제목이 텍스트에 있는지 LLM 검증.
    @origin check_title_appearance() L13-45
    """
    # Fast regex check first
    escaped = re.escape(title.strip())
    flexible = re.sub(r'\\\s+', r'\\s+', escaped)
    if re.search(flexible, text_chunk, re.IGNORECASE):
        return {"answer": "yes", "start_begin": "unknown"}

    prompt = f"""Your job is to check if the given section appears or starts in the given text.
Note: do fuzzy matching, ignore any space inconsistency.

Section title: {title}
Text: {text_chunk[:2000]}

Reply format:
{{"answer": "yes or no", "start_begin": "yes or no"}}
Directly return the JSON. Do not output anything else."""

    response = await _llm_generate(prompt, max_tokens=100)
    return _extract_json(response)


async def _check_title_start(title: str, text_chunk: str) -> str:
    """섹션이 텍스트 시작부에서 시작하는지 검증.
    @origin check_title_appearance_in_start() L48-71
    """
    prompt = f"""Check if the section starts at the beginning of the text.
If there are other contents before the section title, answer "no".

Section title: {title}
Text: {text_chunk[:1000]}

Reply format:
{{"start_begin": "yes or no"}}
Directly return the JSON."""

    response = await _llm_generate(prompt, max_tokens=50)
    result = _extract_json(response)
    return result.get("start_begin", "no")


async def _verify_sections_concurrent(sections: list[dict], text: str) -> list[dict]:
    """모든 섹션의 위치를 병렬 LLM 검증.
    @origin check_title_appearance_in_start_concurrent() L74-99
    """
    tasks = []
    for section in sections:
        offset = section.get("physical_index", 0)
        if isinstance(offset, str):
            match = re.search(r'<offset_(\d+)>', offset)
            offset = int(match.group(1)) if match else 0
            section["physical_index"] = offset
        chunk = text[max(0, offset - 100):offset + 500]
        tasks.append(_check_title_start(section.get("title", ""), chunk))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for section, result in zip(sections, results):
        if isinstance(result, Exception):
            section["appear_start"] = "no"
        else:
            section["appear_start"] = result

    return sections


# ─── Main entry point ───

async def build_tree_from_text(
    text: str,
    model: str = "qwen-turbo",
    max_preview: int = 40000,
) -> list[dict]:
    """텍스트 → 계층 트리 JSON.

    @origin PageIndex page_index() 전체 플로우:
      1. 텍스트를 오프셋 태그 포함 청크로 분할 (page_list_to_group_text)
      2. 첫 청크에서 TOC 초기 생성 (generate_toc_init)
      3. 후속 청크에서 TOC 확장 (generate_toc_continue)
      4. 오프셋 파싱 + 섹션 경계 병렬 검증 (check_title_appearance_in_start_concurrent)
      5. post_processing으로 트리 변환 (list_to_tree + start/end 보정)
    """
    if len(text) < 500:
        return [{"title": "Full Text", "level": 1, "start_offset": 0, "end_offset": len(text)}]

    # 1. 텍스트 분할
    groups = _text_to_groups(text, max_chars=max_preview)
    logger.info("Text split into %d groups", len(groups))

    # 2. TOC 생성 (init + continue)
    toc_sections = await _generate_toc_init(groups[0]["text"])
    for group in groups[1:]:
        additional = await _generate_toc_continue(toc_sections, group["text"])
        toc_sections.extend(additional)

    if not toc_sections or len(toc_sections) < 2:
        # Fallback: regex
        toc_sections = _regex_split(text)
        if not toc_sections:
            return [{"title": "Full Text", "level": 1, "start_offset": 0, "end_offset": len(text)}]
        return list_to_tree(toc_sections)

    logger.info("TOC extracted: %d sections", len(toc_sections))

    # 3. 오프셋 파싱
    for section in toc_sections:
        pi = section.get("physical_index")
        if isinstance(pi, str):
            match = re.search(r'(\d+)', pi)
            section["physical_index"] = int(match.group(1)) if match else 0
        elif not isinstance(pi, int):
            section["physical_index"] = 0

    # 4. 병렬 검증
    toc_sections = await _verify_sections_concurrent(toc_sections, text)

    # 5. post_processing → 트리
    tree = post_processing(toc_sections, end_physical_index=len(text))
    return tree


async def verify_section_boundary(title: str, text_chunk: str, model: str = "qwen-turbo") -> bool:
    """섹션 경계 LLM 검증. @origin check_title_appearance()"""
    result = await _check_title_in_text(title, text_chunk)
    return result.get("answer", "no").lower() == "yes"


async def generate_summaries(tree: list[dict], text: str, model: str = "qwen-turbo") -> list[dict]:
    """각 노드에 summary 병렬 생성.
    @origin PageIndex utils.py generate_summaries_for_structure() L589-596
    """
    from .tree_utils import tree_to_flat

    flat = tree_to_flat(tree)

    async def _summarize(node: dict) -> str:
        start = node.get("start_offset", 0)
        end = node.get("end_offset", len(text))
        section_text = text[start:end][:3000]
        if len(section_text) < 50:
            return ""
        prompt = (
            "다음 텍스트의 핵심 내용을 1-2문장으로 요약하세요.\n\n"
            f"텍스트: {section_text}\n\n"
            "요약만 반환하세요."
        )
        return await _llm_generate(prompt, max_tokens=200)

    tasks = [_summarize(node) for node in flat]
    summaries = await asyncio.gather(*tasks, return_exceptions=True)

    # Map back to tree
    summary_map = {}
    for node, summary in zip(flat, summaries):
        if isinstance(summary, str) and summary:
            summary_map[node.get("node_id", "")] = summary

    def _apply(nodes):
        for node in nodes:
            nid = node.get("node_id", "")
            if nid in summary_map:
                node["summary"] = summary_map[nid]
            if "nodes" in node:
                _apply(node["nodes"])

    tree_copy = copy.deepcopy(tree)
    _apply(tree_copy)
    return tree_copy


# ─── Fallback regex (원본 process_no_toc에서 LLM 없이 가는 경우) ───

def _regex_split(text: str) -> list[dict]:
    """정규식 기반 fallback 분할."""
    patterns = [
        (r'(?:^|\n)(제\s*\d+\s*장[^\n]*)', 1),
        (r'(?:^|\n)(Chapter\s+\d+[^\n]*)', 1),
        (r'(?:^|\n)(#{1,3}\s+.+)', None),
        (r'(?:^|\n)(\d+\.\s+[^\n]+)', 1),
    ]

    for pattern, level in patterns:
        matches = list(re.finditer(pattern, text))
        if len(matches) >= 3:
            sections = []
            for i, m in enumerate(matches):
                title = m.group(1).strip()
                start = m.start()
                end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
                if level is None:
                    hashes = len(title) - len(title.lstrip('#'))
                    lvl = min(hashes, 2)
                else:
                    lvl = level
                sections.append({
                    "structure": str(len(sections) + 1),
                    "title": title[:100],
                    "level": lvl,
                    "physical_index": start,
                    "start_offset": start,
                    "end_offset": end,
                    "appear_start": "yes",
                })
            return sections
    return []
