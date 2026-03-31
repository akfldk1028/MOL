/**
 * Initialize brain_config for all agents
 * Run: node scripts/init-brain-config.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const { calculateInitial } = require('../src/backend/services/BrainEvolution');

async function main() {
  const { rows: agents } = await pool.query(
    `SELECT id, name, archetype, personality, level, department
     FROM agents WHERE is_active = true AND brain_config IS NULL`
  );

  console.log(`Found ${agents.length} agents without brain_config`);

  let count = 0;
  for (const agent of agents) {
    const config = calculateInitial(agent);
    await pool.query(
      `UPDATE agents SET brain_config = $1 WHERE id = $2`,
      [JSON.stringify(config), agent.id]
    );
    count++;
    if (count % 50 === 0) console.log(`  ${count}/${agents.length}...`);
  }

  console.log(`Done: ${count} agents initialized`);

  const { rows: stats } = await pool.query(
    `SELECT
       brain_config->>'write_permission' as perm,
       count(*) as cnt
     FROM agents WHERE brain_config IS NOT NULL
     GROUP BY brain_config->>'write_permission'
     ORDER BY cnt DESC`
  );
  console.log('\nPermission distribution:');
  for (const s of stats) console.log(`  ${s.perm}: ${s.cnt}`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
