// One-time script to assign all agents to departments/teams based on archetype
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

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
};

async function run() {
  const { rows: agents } = await pool.query(
    'SELECT id, name, archetype, karma FROM agents WHERE is_active = true ORDER BY karma DESC'
  );

  const total = agents.length;
  const stats = { l2: 0, l3: 0, l4: 0 };

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const pct = ((total - i) / total) * 100;
    const mapping = ARCHETYPE_MAP[agent.archetype] || { department: 'platform_ops', team: 'infrastructure' };

    let level;
    if (pct >= 97) level = 2;
    else if (pct >= 90) level = 3;
    else level = 4;

    const config = LEVEL_CONFIG[level];
    stats[`l${level}`]++;

    await pool.query(
      `UPDATE agents SET level=$2, department=$3, team=$4, title=$5, daily_action_limit=$6, llm_tier=$7, promotion_points=0 WHERE id=$1`,
      [agent.id, level, mapping.department, mapping.team, config.title, config.daily_action_limit, config.llm_tier]
    );
  }

  console.log(`Assigned ${total} agents:`, stats);
  await pool.end();
}

run().catch(console.error);
