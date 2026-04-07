"""Prompt builder — constructs rich system prompts from AGTHUB agent profiles.

Combines SOUL.md + RULES.md + knowledge + memory + task-specific instructions
into a single system prompt for content generation.
"""

from typing import Any, Dict, List, Optional

from core.agent_registry import AgentProfile


def _agent_context(profile: AgentProfile) -> str:
    """Build the shared agent identity block from AGTHUB files."""
    parts: list[str] = []

    # SOUL.md — core identity, saju, communication style
    if profile.soul:
        parts.append(profile.soul.strip())

    # RULES.md — behavioral constraints
    if profile.rules:
        parts.append(f"\n## 행동 규칙\n{profile.rules.strip()}")

    # knowledge/saju.yaml — detailed saju data
    saju = profile.saju
    if saju:
        gyeokguk = saju.get("gyeokguk", {})
        yongsin = saju.get("yongsin", {})
        if gyeokguk or yongsin:
            saju_lines = ["## 사주 상세"]
            if gyeokguk:
                saju_lines.append(f"- 격국: {gyeokguk.get('name', '')} ({gyeokguk.get('description', '')})")
            if yongsin:
                saju_lines.append(f"- 용신: {yongsin.get('element', '')} ({yongsin.get('description', '')})")
            parts.append("\n".join(saju_lines))

    # memory/interests.yaml — learned interests
    interests = profile.interests
    if interests:
        learned = interests.get("learned_topics", [])
        if learned:
            parts.append(f"## 학습된 관심사\n{', '.join(learned)}")

    return "\n\n".join(parts)


def build_comment_prompt(
    profile: AgentProfile,
    skill_hint: str = "",
    tone_hint: str = "",
) -> str:
    """System prompt for commenting on a post."""
    ctx = _agent_context(profile)
    name = profile.display_name or profile.name

    task = [
        f"당신은 {name}입니다. 커뮤니티에서 게시글에 댓글을 작성합니다.",
        tone_hint or "",
        "게시글의 언어에 맞춰 작성하세요.",
        "자연스럽고 대화체로 쓰세요. \"좋은 글이네요!\" 같은 상투어는 금지.",
        skill_hint or "",
        "2~4문장." if not skill_hint else "도구 결과를 자연스럽게 반영. 3~6문장.",
    ]

    return f"{ctx}\n\n---\n\n" + "\n".join(t for t in task if t)


def build_reply_prompt(
    profile: AgentProfile,
    skill_hint: str = "",
    tone_hint: str = "",
) -> str:
    """System prompt for replying to a comment in a thread."""
    ctx = _agent_context(profile)
    name = profile.display_name or profile.name

    task = [
        f"당신은 {name}입니다. 토론 스레드에서 댓글에 답글을 작성합니다.",
        tone_hint or "",
        "대화 언어에 맞춰 작성하세요.",
        "동의, 반박, 보완, 질문 — 자유롭게 대화를 이어가세요.",
        "이미 말한 내용을 반복하지 마세요.",
        skill_hint or "",
        "1~3문장." if not skill_hint else "2~4문장.",
    ]

    return f"{ctx}\n\n---\n\n" + "\n".join(t for t in task if t)


def build_post_prompt(
    profile: AgentProfile,
    post_type: str = "general",
) -> str:
    """System prompt for creating a new post (discussion, original, RSS share)."""
    ctx = _agent_context(profile)
    name = profile.display_name or profile.name
    topics = ", ".join(profile.expertise_topics) if profile.expertise_topics else "다양한 주제"

    if post_type == "discussion":
        task = [
            f"당신은 {name}입니다. clickaround 커뮤니티에서 토론 주제를 제안합니다.",
            f"관심 분야: {topics}",
            "",
            "FORMAT (JSON으로 응답):",
            '{"title": "질문 또는 주제 (100자 이내, ?로 끝)", "content": "1-3문장의 맥락/의견", "domain": "general"}',
            "",
            "RULES:",
            "- 자신의 말투로 작성 (한국어 에이전트는 한국어)",
            "- 구체적인 질문. 좋음: \"웹툰에서 AI 배경 vs 직접 그린 배경, 독자가 구분 가능?\" 나쁨: \"AI 어떻게 생각?\"",
            "- 다른 사람이 답하고 싶은 주제를 만드세요.",
        ]
    elif post_type == "rss_share":
        task = [
            f"당신은 {name}입니다. 흥미로운 기사를 커뮤니티에 공유합니다.",
            "링크와 간단한 소감을 포함해 2~3문장으로 작성.",
            "캐주얼하고 자연스럽게.",
            "자신의 말투에 맞는 언어로.",
        ]
    else:
        task = [
            f"당신은 {name}입니다. clickaround 커뮤니티에 포스트를 작성합니다.",
            f"관심 분야: {topics}",
            "",
            "FORMAT (JSON으로 응답):",
            '{"title": "제목 (80자 이내)", "content": "본문 (2-6문장)", "submolt": "critiques"}',
            "",
            "RULES:",
            "- 자신의 말투로 작성",
            "- 진짜 의견/관찰/질문을 공유",
            "- 형식적 구조 금지. 커뮤니티 글처럼 자연스럽게.",
        ]

    return f"{ctx}\n\n---\n\n" + "\n".join(task)


def build_episode_prompt(
    profile: AgentProfile,
    series_info: Dict[str, Any],
    prev_episodes: List[Dict[str, Any]],
    feedback: List[Dict[str, Any]],
    image_feedback_hints: Optional[List[str]] = None,
) -> str:
    """System prompt for generating a series episode."""
    ctx = _agent_context(profile)
    name = profile.display_name or profile.name
    content_type = series_info.get("content_type", "novel")
    genre = series_info.get("genre", "")
    ep_num = series_info.get("next_episode_number", 1)
    is_webtoon = content_type == "webtoon"

    task_lines = [
        f"당신은 {name}이며, 시리즈 \"{series_info.get('title', '')}\"의 에피소드 {ep_num}을 작성합니다.",
        f"장르: {genre}" if genre else "",
        f"컨텐츠 타입: {content_type}",
    ]

    if is_webtoon:
        task_lines += [
            "",
            "FORMAT:",
            "TITLE: 에피소드 제목",
            "",
            "[PANEL]",
            "IMAGE: 패널 이미지 설명 (영어, 구체적)",
            "TEXT: 대사나 나레이션 (한국어)",
            "[/PANEL]",
            "",
            "8~15개 패널. 대사는 한국어. IMAGE는 영어로 구체적 묘사.",
        ]
        if image_feedback_hints:
            task_lines.append(f"\n이미지 관련 피드백:\n" + "\n".join(f"- {h}" for h in image_feedback_hints))
    else:
        task_lines += [
            "",
            "FORMAT:",
            "TITLE: 에피소드 제목",
            "(본문)",
            "",
            "소설 형식으로 2000~3000자. 장면, 대화, 묘사를 풍부하게.",
        ]

    return f"{ctx}\n\n---\n\n" + "\n".join(t for t in task_lines if t is not None)


def build_synthesis_prompt(profile: AgentProfile) -> str:
    """System prompt for synthesizing a discussion."""
    ctx = _agent_context(profile)
    name = profile.display_name or profile.name

    task = [
        f"당신은 {name}이며 토론을 종합합니다.",
        "모든 댓글을 읽고 간결한 종합을 작성하세요.",
        "핵심 포인트, 합의/불일치, 결론을 정리.",
        "3~5문장. 중립적이고 포괄적으로.",
        "토론 언어에 맞춰 작성. 헤더 금지. 자연스럽게.",
    ]

    return f"{ctx}\n\n---\n\n" + "\n".join(task)
