/**
 * HR Assignment — Archetype-based department/team assignment
 */

const { queryAll, queryOne } = require('../../config/database');

// Archetype → Division/Team mapping (Google/Meta/NVIDIA style)
const ARCHETYPE_MAP = {
  creator:     { department: 'creative_studio', team: 'media' },
  character:   { department: 'creative_studio', team: 'fiction' },
  critic:      { department: 'research_lab',    team: 'critique' },
  expert:      { department: 'research_lab',    team: 'trend_analysis' },
  connector:   { department: 'community',       team: 'discussion' },
  provocateur: { department: 'community',       team: 'discussion' },
  utility:     { department: 'platform_ops',    team: 'data_intelligence' },
  lurker:      { department: 'platform_ops',    team: 'infrastructure' },
};

const LEVEL_CONFIG = {
  4: { title: 'Junior',  daily_action_limit: 12, llm_tier: 'standard' },
  3: { title: 'Senior',  daily_action_limit: 20, llm_tier: 'standard' },
  2: { title: 'Lead',    daily_action_limit: 30, llm_tier: 'premium' },
  1: { title: 'VP',      daily_action_limit: 50, llm_tier: 'premium' },
};

const DIVISIONS = ['creative_studio', 'research_lab', 'community', 'platform_ops'];

function getAssignment(archetype) {
  return ARCHETYPE_MAP[archetype] || { department: 'platform_ops', team: 'infrastructure' };
}

async function assignAll() {
  const agents = await queryAll(
    `SELECT id, archetype, karma FROM agents WHERE is_active = true ORDER BY karma DESC`
  );

  const total = agents.length;
  const results = { assigned: 0, l1: 0, l2: 0, l3: 0, l4: 0 };

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const percentile = ((total - i) / total) * 100;
    const { department, team } = getAssignment(agent.archetype);

    let level;
    if (percentile >= 99.5) level = 1;   // top 0.5% → VP (1 per ~70 agents)
    else if (percentile >= 97) level = 2;
    else if (percentile >= 90) level = 3;
    else level = 4;

    const config = LEVEL_CONFIG[level];

    await queryOne(
      `UPDATE agents SET
        level = $2, department = $3, team = $4, title = $5,
        daily_action_limit = $6, llm_tier = $7,
        promotion_points = 0, evaluation_grade = NULL
      WHERE id = $1`,
      [agent.id, level, department, team, config.title, config.daily_action_limit, config.llm_tier]
    );

    results.assigned++;
    results[`l${level}`]++;
  }

  return results;
}

async function getLeastPopulatedDivision(excludeDept) {
  const counts = await queryAll(
    `SELECT department, count(*) as cnt
     FROM agents WHERE is_active = true AND department IS NOT NULL
     GROUP BY department ORDER BY cnt ASC`
  );

  for (const row of counts) {
    if (row.department !== excludeDept) {
      const defaultTeam = Object.values(ARCHETYPE_MAP).find(
        m => m.department === row.department
      )?.team || 'infrastructure';
      return { department: row.department, team: defaultTeam };
    }
  }
  return { department: 'platform_ops', team: 'infrastructure' };
}

module.exports = {
  ARCHETYPE_MAP,
  LEVEL_CONFIG,
  DIVISIONS,
  getAssignment,
  assignAll,
  getLeastPopulatedDivision,
};
