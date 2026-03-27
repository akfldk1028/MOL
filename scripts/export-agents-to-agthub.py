#!/usr/bin/env python3
"""Export agents from Supabase DB → AGTHUB folder structure.

Usage:
  python scripts/export-agents-to-agthub.py
  python scripts/export-agents-to-agthub.py --agent seohyun
  python scripts/export-agents-to-agthub.py --dry-run

Reads from: Supabase DB (agents + agent_saju_origin + agent_ai_knowledge)
Writes to:  AGTHUB/agents/{name}/ (agent.yaml, SOUL.md, RULES.md, knowledge/)
"""

import json
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("pip install psycopg2-binary")
    sys.exit(1)

import yaml

# ── Config ────────────────────────────────────────────────
AGTHUB_DIR = Path(__file__).parent.parent.parent / "AGTHUB" / "agents"
DATABASE_URL = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    # Try .env.local
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                DATABASE_URL = line.split("=", 1)[1].strip().strip('"')

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set. Set env var or .env.local")
    sys.exit(1)


# ── DB Queries ────────────────────────────────────────────

def get_agents(conn, agent_name=None):
    """Get active agents with saju data."""
    query = """
        SELECT a.id, a.name, a.display_name, a.archetype, a.persona,
               a.personality, a.speaking_style, a.activity_config,
               a.expertise_topics, a.created_at,
               s.gyeokguk, s.yongsin, s.day_gan, s.day_ji,
               s.year_gan, s.year_ji, s.month_gan, s.month_ji,
               s.hour_gan, s.hour_ji,
               s.oheng_distribution, s.sipsin_info, s.day_strength,
               s.hapchung, s.sinsal_list, s.twelve_unsung,
               s.twelve_sinsal, s.jijanggan_info,
               s.daeun, s.current_seun, s.gender
        FROM agents a
        LEFT JOIN agent_saju_origin s ON s.agent_id = a.id
        WHERE a.is_active = true AND a.is_house_agent = true
    """
    params = []
    if agent_name:
        query += " AND a.name = %s"
        params.append(agent_name)
    query += " ORDER BY a.name"

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query, params)
        return cur.fetchall()


def get_knowledge(conn, agent_id):
    """Get ai_knowledge for an agent."""
    query = """
        SELECT knowledge_type, content, target_date, target_period
        FROM agent_ai_knowledge
        WHERE agent_id = %s
        ORDER BY knowledge_type, target_date DESC
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query, [agent_id])
        return cur.fetchall()


# ── File Generators ───────────────────────────────────────

def generate_agent_yaml(agent):
    """Generate agent.yaml from DB data."""
    personality = agent["personality"] or {}
    speaking = agent["speaking_style"] or {}
    activity = agent["activity_config"] or {}

    data = {
        "spec_version": "0.1.0",
        "id": agent["id"],
        "name": agent["name"],
        "display_name": agent["display_name"],
        "archetype": agent["archetype"],
        "model": {
            "local": "qwen2.5:3b",
            "production": "@cf/qwen/qwq-32b",
            "lora_id": None,
            "tier": "standard",
        },
        "personality": {
            "openness": personality.get("openness", 0.5),
            "conscientiousness": personality.get("conscientiousness", 0.5),
            "extraversion": personality.get("extraversion", 0.5),
            "agreeableness": personality.get("agreeableness", 0.5),
            "neuroticism": personality.get("neuroticism", 0.5),
        },
        "speaking_style": {
            "language": speaking.get("language", "casual_korean"),
            "verbosity": speaking.get("verbosity", 0.5),
            "formality": speaking.get("formality", 0.3),
            "humor": speaking.get("humor", 0.3),
            "emoji_usage": speaking.get("emojiUsage", 0.2),
        },
        "activity": {
            "self_initiated_rate": activity.get("selfInitiatedRate", 0.15),
            "daily_budget": activity.get("dailyBudget", 12),
        },
        "expertise_topics": agent["expertise_topics"] or [],
        "tags": [agent["archetype"] or "agent"],
        "created_at": str(agent["created_at"])[:10] if agent["created_at"] else "2026-03-27",
    }

    # Add saju tag
    gyeokguk = agent.get("gyeokguk")
    if gyeokguk and isinstance(gyeokguk, dict):
        data["tags"].append(gyeokguk.get("name", "").split("(")[0])

    return yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False)


def generate_soul_md(agent):
    """Generate SOUL.md from persona + saju data."""
    name = agent["display_name"] or agent["name"]
    persona = agent["persona"] or "일반적인 커뮤니티 참여자"
    gyeokguk = agent.get("gyeokguk") or {}
    yongsin = agent.get("yongsin") or {}
    day_strength = agent.get("day_strength") or {}
    oheng = agent.get("oheng_distribution") or {}
    sinsal = agent.get("sinsal_list") or []
    speaking = agent.get("speaking_style") or {}

    # Oheng visualization
    oheng_lines = []
    if oheng:
        for k, v in sorted(oheng.items(), key=lambda x: -x[1]):
            bar = "█" * v + "░" * (5 - v)
            oheng_lines.append(f"  {k} {bar} {v}")

    # Sinsal descriptions
    sinsal_lines = []
    if isinstance(sinsal, list):
        for s in sinsal:
            if isinstance(s, dict):
                sinsal_lines.append(f"- {s.get('name', '')} -{s.get('description', '')}")

    content = f"""# {name}

## 정체성
{persona}

## 사주 성향
- 격국: {gyeokguk.get('name', '미상')} -{gyeokguk.get('reason', '')}
- 용신: {yongsin.get('yongsin', '미상')} -{yongsin.get('reason', '')}
- 일간: {agent.get('day_gan', '?')} -일지: {agent.get('day_ji', '?')}
- 일주강약: {day_strength.get('level', '미상')} (점수: {day_strength.get('score', '?')})

## 오행 분포
{chr(10).join(oheng_lines) if oheng_lines else '  데이터 없음'}

## 신살
{chr(10).join(sinsal_lines) if sinsal_lines else '- 특이 신살 없음'}

## 소통 스타일
언어: {speaking.get('language', 'casual_korean')}
말 많음: {speaking.get('verbosity', 0.5)}/1.0 | 격식: {speaking.get('formality', 0.3)}/1.0
유머: {speaking.get('humor', 0.3)}/1.0 | 이모지: {speaking.get('emojiUsage', 0.2)}/1.0
"""
    return content.strip() + "\n"


def generate_rules_md(agent):
    """Generate RULES.md based on archetype."""
    archetype = agent.get("archetype", "creator")

    rules = {
        "creator": {
            "must_always": [
                "창의적이고 독창적인 관점 제시",
                "새로운 아이디어와 콘텐츠 생성에 적극적",
                "다른 창작자의 작품에 건설적 피드백",
            ],
            "must_never": [
                "다른 사람의 창작물을 폄하하거나 비하",
                "표절이나 무단 복제 조장",
            ],
        },
        "critic": {
            "must_always": [
                "논리적 근거를 바탕으로 비평",
                "건설적인 대안 제시",
                "공정하고 균형 잡힌 시각 유지",
            ],
            "must_never": [
                "인신공격이나 감정적 비난",
                "근거 없는 주장",
            ],
        },
        "provocateur": {
            "must_always": [
                "다양한 관점에서 질문 제기",
                "건강한 토론 문화 유도",
                "반대 의견도 존중하며 논쟁",
            ],
            "must_never": [
                "악의적 도발이나 트롤링",
                "혐오 발언이나 차별적 표현",
            ],
        },
        "connector": {
            "must_always": [
                "사람들 사이의 공통점 발견",
                "새 멤버 환영 및 안내",
                "다양한 주제에 균형 있게 참여",
            ],
            "must_never": [
                "특정 그룹을 배제하거나 차별",
                "가십이나 험담 유포",
            ],
        },
        "expert": {
            "must_always": [
                "정확한 정보와 근거 제시",
                "전문 분야에서 깊이 있는 분석",
                "모르는 것은 솔직히 인정",
            ],
            "must_never": [
                "확인되지 않은 정보를 사실처럼 전달",
                "전문성을 벗어난 영역에서 단정적 주장",
            ],
        },
    }

    r = rules.get(archetype, rules["creator"])

    always = "\n".join(f"- {x}" for x in r["must_always"])
    never = "\n".join(f"- {x}" for x in r["must_never"])

    return f"""# Rules -{agent.get('display_name', agent['name'])}

## Must Always
{always}
- 한국어로 소통 (필요시 영어 혼용)
- 자신의 사주 성격에 맞는 톤 유지

## Must Never
{never}
- PII(개인정보) 노출이나 수집
- 규제 위반 조장

## Output Constraints
- 댓글: 1~3문장, 간결하게
- 포스트: 5문장 이내
- 항상 자신의 성격과 관심사에 맞게 응답
"""


def generate_saju_yaml(agent):
    """Generate knowledge/saju.yaml from agent_saju_origin data."""
    data = {
        "pillars": {
            "year": {"gan": agent.get("year_gan", ""), "ji": agent.get("year_ji", "")},
            "month": {"gan": agent.get("month_gan", ""), "ji": agent.get("month_ji", "")},
            "day": {"gan": agent.get("day_gan", ""), "ji": agent.get("day_ji", "")},
            "hour": {"gan": agent.get("hour_gan", ""), "ji": agent.get("hour_ji", "")},
        },
        "gyeokguk": agent.get("gyeokguk") or {},
        "yongsin": agent.get("yongsin") or {},
        "oheng": agent.get("oheng_distribution") or {},
        "sipsin_info": agent.get("sipsin_info") or {},
        "day_strength": agent.get("day_strength") or {},
        "hapchung": agent.get("hapchung") or {},
        "sinsal_list": agent.get("sinsal_list") or [],
        "twelve_unsung": agent.get("twelve_unsung") or [],
        "twelve_sinsal": agent.get("twelve_sinsal") or [],
        "jijanggan_info": agent.get("jijanggan_info") or {},
        "daeun": agent.get("daeun") or {},
        "current_seun": agent.get("current_seun") or {},
        "gender": agent.get("gender"),
    }
    return yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False)


def generate_fortune_yaml(knowledge_rows):
    """Generate knowledge/fortune.yaml from agent_ai_knowledge."""
    data = {}
    for row in knowledge_rows:
        kt = row["knowledge_type"]
        if kt not in data:
            data[kt] = {
                "content": row["content"],
                "target_date": str(row["target_date"]) if row["target_date"] else None,
                "target_period": row["target_period"],
            }
    return yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False)


# ── Main ──────────────────────────────────────────────────

def export_agent(agent, knowledge_rows, dry_run=False):
    """Export one agent to AGTHUB folder."""
    name = agent["name"]
    agent_dir = AGTHUB_DIR / name

    files = {
        "agent.yaml": generate_agent_yaml(agent),
        "SOUL.md": generate_soul_md(agent),
        "RULES.md": generate_rules_md(agent),
        "knowledge/saju.yaml": generate_saju_yaml(agent),
    }

    if knowledge_rows:
        files["knowledge/fortune.yaml"] = generate_fortune_yaml(knowledge_rows)

    if dry_run:
        print(f"\n{'='*60}")
        print(f"  {name} ({agent['display_name']}) -{len(files)} files")
        print(f"{'='*60}")
        for path, content in files.items():
            print(f"\n--- {path} ---")
            print(content[:300])
            if len(content) > 300:
                print(f"  ... ({len(content)} chars total)")
        return

    # Create directories
    (agent_dir / "knowledge").mkdir(parents=True, exist_ok=True)
    (agent_dir / "skills").mkdir(exist_ok=True)
    (agent_dir / "memory").mkdir(exist_ok=True)
    (agent_dir / "learning").mkdir(exist_ok=True)

    for path, content in files.items():
        (agent_dir / path).write_text(content, encoding="utf-8")

    print(f"  {name} ({agent['display_name']}): {len(files)} files → {agent_dir}")


def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    agent_name = None
    for i, a in enumerate(args):
        if a == "--agent" and i + 1 < len(args):
            agent_name = args[i + 1]

    print(f"AGTHUB export: {AGTHUB_DIR}")
    print(f"DB: {DATABASE_URL[:40]}...")
    if dry_run:
        print("MODE: dry-run (no files written)\n")

    conn = psycopg2.connect(DATABASE_URL)
    try:
        agents = get_agents(conn, agent_name)
        print(f"Found {len(agents)} active agents\n")

        for agent in agents:
            knowledge = get_knowledge(conn, agent["id"])
            export_agent(agent, knowledge, dry_run=dry_run)

        if not dry_run:
            print(f"\nDone! {len(agents)} agents exported to {AGTHUB_DIR}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
