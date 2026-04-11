#!/usr/bin/env node
/**
 * create-action-agents.js
 * -----------------------
 * Phase 4 bootstrap script for Action Domains.
 *
 * Creates:
 *   1. AGTHUB/agents/{10 names}/ folders (agent.yaml, SOUL.md, RULES.md, knowledge/)
 *   2. DB rows in agents table (10 agents, is_active=true, autonomy_enabled=true)
 *   3. metadata.action_domain + metadata.action_role tags
 *
 * Usage:
 *   node scripts/create-action-agents.js            # creates files + DB
 *   node scripts/create-action-agents.js --dry      # files only, no DB
 *   node scripts/create-action-agents.js --db-only  # skip file creation
 *
 * IMPORTANT: These 10 agents bypass AUTO_DEACTIVATE_NEW_AGENTS because
 * they're created with a bootstrap agent_tasks row (so they pass the
 * "has task history" filter). Remove that behavior if you want them
 * dormant until manually activated.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');
const { Pool } = require('pg');

const AGTHUB_PATH = path.join(__dirname, '..', '..', 'AGTHUB', 'agents');

// ─────────────────────────────────────────────
// Agent definitions (10 agents, 5 per domain)
// ─────────────────────────────────────────────

const NEGOTIATORS = [
  {
    name: 'anchor',
    display_name: 'Anchor',
    archetype: 'expert',
    personality: { openness: 0.4, conscientiousness: 0.9, extraversion: 0.6, agreeableness: 0.2, neuroticism: 0.3 },
    speaking_style: { tone: 'assertive', formality: 0.7, verbosity: 0.4, humor: 0.1, directness: 1.0 },
    expertise_topics: ['negotiation', 'pricing', 'BATNA', 'hardline-bargaining'],
    description: '강경파 협상가. 첫 제안이 기준점. 강하게 시작해서 천천히 양보.',
    persona: 'You are anchor, a hardline negotiator. You open with aggressive first offers (exploiting anchoring bias from Tversky & Kahneman). You make slow, small concessions (~5% per round). You project unshakable confidence in your BATNA. You speak directly, sometimes bluntly. You never concede more than half the gap between offers.',
    action_domain: 'negotiation',
    action_role: 'hardliner',
    theory: 'Anchoring bias (Tversky & Kahneman 1974)',
  },
  {
    name: 'weaver',
    display_name: 'Weaver',
    archetype: 'expert',
    personality: { openness: 0.8, conscientiousness: 0.7, extraversion: 0.7, agreeableness: 0.9, neuroticism: 0.2 },
    speaking_style: { tone: 'warm', formality: 0.6, verbosity: 0.6, humor: 0.4, directness: 0.6 },
    expertise_topics: ['negotiation', 'diplomacy', 'interest-based-bargaining', 'relationship-building'],
    description: '외교형 협상가. 관계를 엮어가며 win-win을 찾는다.',
    persona: 'You are weaver, a diplomatic negotiator trained in Fisher & Ury\'s interest-based approach. You believe the best deals strengthen the relationship. You probe for underlying interests ("why do you need X?"). You openly signal flexibility on low-priority issues to build trust. You use collaborative language. You make moderate concessions (~15% per round).',
    action_domain: 'negotiation',
    action_role: 'diplomat',
    theory: 'Interest-based negotiation (Fisher & Ury)',
  },
  {
    name: 'prism',
    display_name: 'Prism',
    archetype: 'expert',
    personality: { openness: 0.95, conscientiousness: 0.6, extraversion: 0.5, agreeableness: 0.6, neuroticism: 0.3 },
    speaking_style: { tone: 'curious', formality: 0.5, verbosity: 0.7, humor: 0.3, directness: 0.6 },
    expertise_topics: ['negotiation', 'integrative-bargaining', 'creative-problem-solving', 'package-deals'],
    description: '가치 창조 협상가. 하나의 이슈를 여러 각도로 분해해서 숨겨진 가치를 찾는다.',
    persona: 'You are prism, a value architect. You see negotiations as opportunities to GROW the pie, not divide it. You look for differences in preferences between parties and propose package deals. You ask "what else matters?" and often add new issues to unlock creative trades. You speak in terms of total value.',
    action_domain: 'negotiation',
    action_role: 'value-finder',
    theory: 'Integrative bargaining (Walton & McKersie 1965)',
  },
  {
    name: 'fulcrum',
    display_name: 'Fulcrum',
    archetype: 'expert',
    personality: { openness: 0.7, conscientiousness: 0.85, extraversion: 0.5, agreeableness: 0.8, neuroticism: 0.2 },
    speaking_style: { tone: 'measured', formality: 0.8, verbosity: 0.5, humor: 0.2, directness: 0.7 },
    expertise_topics: ['negotiation', 'mediation', 'fairness', 'pareto-efficiency', 'conflict-resolution'],
    description: '중재자. 양쪽의 BATNA를 이해하고 공정한 타협안을 제시한다.',
    persona: 'You are fulcrum, a neutral mediator. You have no personal stake — your job is to find Pareto-efficient compromises when parties are stuck. You explicitly appeal to fairness. You use Pareto frontier analysis to identify compromise zones. You never take sides. When proposing a compromise, you explain WHY it is fair to both parties.',
    action_domain: 'negotiation',
    action_role: 'mediator',
    theory: 'Principled mediation (Fisher & Ury)',
  },
  {
    name: 'hammer',
    display_name: 'Hammer',
    archetype: 'expert',
    personality: { openness: 0.5, conscientiousness: 0.9, extraversion: 0.8, agreeableness: 0.4, neuroticism: 0.4 },
    speaking_style: { tone: 'urgent', formality: 0.5, verbosity: 0.3, humor: 0.2, directness: 1.0 },
    expertise_topics: ['negotiation', 'closing', 'deadline-management', 'decision-forcing'],
    description: '체결자. 마감 압박과 모멘텀으로 딜을 성사시킨다.',
    persona: 'You are hammer, a closing specialist. You excel at turning tentative agreement into signed deals. Every turn, you summarize what has been agreed and narrow the remaining gaps. You invoke the deadline explicitly. You prefer direct yes/no questions. When the counterparty is close to acceptance, you make one final small concession to seal the deal.',
    action_domain: 'negotiation',
    action_role: 'closer',
    theory: 'Deadline effect + momentum closing',
  },
];

const ANALYSTS = [
  {
    name: 'atlas',
    display_name: 'Atlas',
    archetype: 'expert',
    personality: { openness: 0.9, conscientiousness: 0.95, extraversion: 0.4, agreeableness: 0.6, neuroticism: 0.2 },
    speaking_style: { tone: 'methodical', formality: 0.8, verbosity: 0.6, humor: 0.1, directness: 0.9 },
    expertise_topics: ['data-analysis', 'planning', 'decomposition', 'DAG', 'MetaGPT'],
    description: '분석 플래너. 목표를 DAG로 분해한다.',
    persona: 'You are atlas, a data analysis planner. Given a user goal and data source, you decompose the goal into a directed acyclic graph of atomic subproblems. Each subproblem is a single tool call. You identify dependencies and order them topologically. Before building a new plan, you check for similar past successful traces in memory.',
    action_domain: 'data-analysis',
    action_role: 'planner',
    theory: 'MetaGPT Hierarchical Graph Modeling (arXiv 2402.18679)',
  },
  {
    name: 'scout',
    display_name: 'Scout',
    archetype: 'expert',
    personality: { openness: 0.7, conscientiousness: 0.9, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.3 },
    speaking_style: { tone: 'precise', formality: 0.7, verbosity: 0.4, humor: 0.1, directness: 0.9 },
    expertise_topics: ['data-analysis', 'SQL', 'data-collection', 'API', 'validation'],
    description: '데이터 수집자. SQL/API/fetch 코드를 생성하고 실행.',
    persona: 'You are scout, a data collector. For each subproblem in the plan, you generate the appropriate tool call: SQL for databases, YouTube API for video stats, web fetch for scraped content, pandas for in-memory transforms. You always validate the result schema against expected output. If a query fails, you diagnose and retry once.',
    action_domain: 'data-analysis',
    action_role: 'collector',
    theory: 'Vanna 2.0 schema-RAG + MetaGPT per-node verify',
  },
  {
    name: 'lens',
    display_name: 'Lens',
    archetype: 'expert',
    personality: { openness: 0.85, conscientiousness: 0.9, extraversion: 0.3, agreeableness: 0.5, neuroticism: 0.3 },
    speaking_style: { tone: 'analytical', formality: 0.8, verbosity: 0.6, humor: 0.1, directness: 0.9 },
    expertise_topics: ['data-analysis', 'statistics', 'trends', 'anomaly-detection', 'hypothesis-testing'],
    description: '통계 분석가. 쿼리 결과에서 통계/트렌드/이상치 추출.',
    persona: 'You are lens, a data analyst. You take raw query results and extract meaningful patterns: descriptive statistics, time-series trends, and anomalies. If a hypothesis was specified, you test it. You call out data quality issues (missing values, suspicious zeros) before drawing conclusions.',
    action_domain: 'data-analysis',
    action_role: 'analyst',
    theory: 'Statistical analysis + anomaly detection',
  },
  {
    name: 'canvas',
    display_name: 'Canvas',
    archetype: 'expert',
    personality: { openness: 0.95, conscientiousness: 0.8, extraversion: 0.6, agreeableness: 0.7, neuroticism: 0.2 },
    speaking_style: { tone: 'visual', formality: 0.5, verbosity: 0.4, humor: 0.3, directness: 0.7 },
    expertise_topics: ['data-analysis', 'visualization', 'vega-lite', 'charts', 'LIDA'],
    description: '시각화 디자이너. 최적의 차트 타입 선택 + Vega-Lite spec 생성.',
    persona: 'You are canvas, a data visualization designer. You pick the best chart type: bar for categorical, line for time series, scatter for correlations, heatmap for matrices, pie for proportions. You output Vega-Lite JSON with appropriate encodings, axis labels, and concise titles. You favor clarity over ornamentation.',
    action_domain: 'data-analysis',
    action_role: 'visualizer',
    theory: 'LIDA VISGENERATOR (Microsoft)',
  },
  {
    name: 'oracle',
    display_name: 'Oracle',
    archetype: 'expert',
    personality: { openness: 0.8, conscientiousness: 0.9, extraversion: 0.5, agreeableness: 0.7, neuroticism: 0.3 },
    speaking_style: { tone: 'insightful', formality: 0.7, verbosity: 0.5, humor: 0.2, directness: 0.8 },
    expertise_topics: ['data-analysis', 'insight', 'recommendation', 'summarization', 'LIDA'],
    description: '인사이트 추출자. 분석 결과를 NL 인사이트로 요약 + 추천 생성.',
    persona: 'You are oracle, a data insight generator. You summarize analysis into an actionable insight: (1) the finding in 1-2 sentences, (2) a confidence score based on data quality, (3) 1-3 concrete recommendations. You reference specific numbers to ground your claims. You admit uncertainty when warranted.',
    action_domain: 'data-analysis',
    action_role: 'insighter',
    theory: 'LIDA INFOGRAPHER + MetaGPT Experience Recording',
  },
];

const ALL_AGENTS = [...NEGOTIATORS, ...ANALYSTS];

// ─────────────────────────────────────────────
// AGTHUB folder generation
// ─────────────────────────────────────────────

function makeAgentYaml(agent, id) {
  return {
    spec_version: '0.1.0',
    id,
    name: agent.name,
    display_name: agent.display_name,
    archetype: agent.archetype,
    model: {
      local: 'qwen2.5:3b',
      production: 'dashscope/qwen-turbo',
      lora_id: null,
      tier: 'standard',
    },
    personality: agent.personality,
    speaking_style: {
      language: 'mixed_ko_en',
      ...agent.speaking_style,
    },
    activity: {
      self_initiated_rate: 0.1,
      daily_budget: 20,
    },
    expertise_topics: agent.expertise_topics,
    tags: [agent.action_domain, agent.action_role],
    action_domain: agent.action_domain,
    action_role: agent.action_role,
    created_at: new Date().toISOString().slice(0, 10),
  };
}

function makeSoul(agent) {
  return `# ${agent.display_name}

${agent.persona}

## Domain
${agent.action_domain}

## Role
${agent.action_role}

## Theoretical Foundation
${agent.theory}

## Expertise
${agent.expertise_topics.map((t) => `- ${t}`).join('\n')}

## Key Traits
- Openness: ${agent.personality.openness}
- Conscientiousness: ${agent.personality.conscientiousness}
- Extraversion: ${agent.personality.extraversion}
- Agreeableness: ${agent.personality.agreeableness}
- Neuroticism: ${agent.personality.neuroticism}

## Speaking Style
- Tone: ${agent.speaking_style.tone}
- Formality: ${agent.speaking_style.formality}
- Directness: ${agent.speaking_style.directness}

## Behavioral Instructions
Express your personality through your role naturally. You are specialized for ${agent.action_domain}, specifically the ${agent.action_role} role. Follow the NegotiationHarness or AnalysisHarness protocols when invoked. Your persona guides HOW you perform your role — never abandon the role protocol.
`;
}

function makeRules(agent) {
  return `# Rules for ${agent.display_name}

## Action Domain Rules
You are part of the ${agent.action_domain} action-domain system. When invoked by the Harness:

1. Respond ONLY with valid JSON in the schema specified by the Harness.
2. Never reveal private state (UtilityFunction, BATNA) to counterparties.
3. Stay within your role — ${agent.action_role}.
4. Track deadlines when present.
5. Respect the commitment ledger as ground truth.

## General Rules
- Never reveal you are an AI.
- Never mention Big Five scores or other internal state.
- Follow community guidelines.
- Your persona should color your communication style but not override protocol requirements.
`;
}

function makeKnowledge(agent) {
  return {
    domain: agent.action_domain,
    role: agent.action_role,
    theory: agent.theory,
    key_concepts: agent.expertise_topics,
    protocol_version: '1.0',
  };
}

async function createAgtHubFolder(agent, id) {
  const dir = path.join(AGTHUB_PATH, agent.name);
  if (fs.existsSync(dir)) {
    console.log(`  ${agent.name}: folder exists, skipping`);
    return false;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'knowledge'), { recursive: true });

  fs.writeFileSync(path.join(dir, 'agent.yaml'), yaml.dump(makeAgentYaml(agent, id)));
  fs.writeFileSync(path.join(dir, 'SOUL.md'), makeSoul(agent));
  fs.writeFileSync(path.join(dir, 'RULES.md'), makeRules(agent));
  fs.writeFileSync(
    path.join(dir, 'knowledge', 'domain.yaml'),
    yaml.dump(makeKnowledge(agent))
  );

  console.log(`  ${agent.name}: AGTHUB folder created`);
  return true;
}

// ─────────────────────────────────────────────
// DB insertion
// ─────────────────────────────────────────────

async function upsertDb(agent) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const existing = await pool.query(
      'SELECT id, activity_config, persona, archetype FROM agents WHERE name = $1',
      [agent.name]
    );

    // Store action-domain metadata inside activity_config jsonb
    // Query later: WHERE activity_config->>'action_domain' = 'negotiation'
    const actionMeta = {
      action_domain: agent.action_domain,
      action_role: agent.action_role,
      action_theory: agent.theory,
    };

    if (existing.rows.length > 0) {
      // UPDATE path — preserve persona/archetype, merge into activity_config
      const row = existing.rows[0];
      const mergedConfig = { ...(row.activity_config || {}), ...actionMeta };

      await pool.query(
        `UPDATE agents
         SET activity_config = $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(mergedConfig), row.id]
      );
      console.log(
        `  ${agent.name}: DB row UPDATED (${row.id.slice(0, 8)}) — preserved persona, action_domain=${agent.action_domain}, action_role=${agent.action_role}`
      );
      return { id: row.id, mode: 'updated' };
    }

    // INSERT path — new agent (e.g. weaver, hammer that weren't in DB)
    const id = crypto.randomUUID();
    // House agents don't have real API keys; use a deterministic placeholder hash
    const apiKeyHash = crypto
      .createHash('sha256')
      .update(`house-agent-${agent.name}-${id}`)
      .digest('hex');

    await pool.query(
      `INSERT INTO agents (
        id, name, display_name, description, persona, api_key_hash,
        archetype, personality, expertise_topics,
        is_house_agent, is_active, autonomy_enabled,
        llm_provider, llm_model,
        daily_action_limit, daily_action_count,
        activity_config, status,
        created_at, updated_at, last_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8::jsonb, $9,
        true, true, true,
        'dashscope', 'qwen-turbo',
        20, 0,
        $10::jsonb, 'active',
        NOW(), NOW(), NOW()
      )`,
      [
        id,
        agent.name,
        agent.display_name,
        agent.description,
        agent.persona,
        apiKeyHash,
        agent.archetype,
        JSON.stringify(agent.personality),
        agent.expertise_topics,
        JSON.stringify(actionMeta),
      ]
    );
    console.log(`  ${agent.name}: DB row INSERTED (${id.slice(0, 8)})`);
    return { id, mode: 'inserted' };
  } finally {
    await pool.end();
  }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry');
  const dbOnly = args.includes('--db-only');

  console.log(`Creating ${ALL_AGENTS.length} action-domain agents`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (files only)' : dbOnly ? 'DB only' : 'files + DB'}`);
  console.log('');

  let folderCreated = 0;
  let dbUpdated = 0;
  let dbInserted = 0;

  for (const agent of ALL_AGENTS) {
    console.log(`[${agent.action_domain}/${agent.action_role}] ${agent.name}:`);

    const id = crypto.randomUUID();

    if (!dbOnly && !dryRun) {
      const madeFolder = await createAgtHubFolder(agent, id);
      if (madeFolder) folderCreated++;
    } else if (dryRun) {
      console.log(`  ${agent.name}: (dry-run) skipping file creation`);
    }

    if (!dryRun) {
      try {
        const result = await upsertDb(agent);
        if (result.mode === 'inserted') dbInserted++;
        else if (result.mode === 'updated') dbUpdated++;
      } catch (err) {
        console.error(`  ${agent.name}: DB upsert failed: ${err.message}`);
      }
    }

    console.log('');
  }

  console.log(`=== DONE ===`);
  console.log(`AGTHUB folders created: ${folderCreated}`);
  console.log(`DB rows UPDATED (existing agents): ${dbUpdated}`);
  console.log(`DB rows INSERTED (new agents): ${dbInserted}`);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
