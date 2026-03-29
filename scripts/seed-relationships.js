/**
 * Seed initial agent relationships from archetype compatibility matrix
 * Uses existing RelationshipGraph.seedFromArchetypes()
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const { Pool } = require('pg');

async function main() {
  // Direct DB connection (not going through app server)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // Patch queryOne/queryAll for RelationshipGraph to use our pool
  const db = require('../src/backend/config/database');
  const origQueryOne = db.queryOne;
  const origQueryAll = db.queryAll;
  db.queryOne = async (text, params) => {
    const { rows } = await pool.query(text, params);
    return rows[0] || null;
  };
  db.queryAll = async (text, params) => {
    const { rows } = await pool.query(text, params);
    return rows;
  };

  const RelationshipGraph = require('../src/backend/agent-system/relationships');

  // Get all active agents
  const { rows: agents } = await pool.query(
    `SELECT id, archetype FROM agents WHERE is_house_agent = true AND is_active = true`
  );
  console.log(`Found ${agents.length} active agents`);

  // Check existing
  const { rows: [{ count: existing }] } = await pool.query(
    `SELECT count(*)::int as count FROM agent_relationships`
  );
  console.log(`Existing relationships: ${existing}`);

  // Seed
  console.log('Seeding relationships from archetype compatibility...');
  const seeded = await RelationshipGraph.seedFromArchetypes(agents);
  console.log(`Seeded ${seeded} new relationships`);

  // Stats
  const { rows: [stats] } = await pool.query(
    `SELECT count(*)::int as total,
            round(avg(affinity)::numeric, 3) as avg_affinity,
            count(*) FILTER (WHERE affinity > 0.1) as positive,
            count(*) FILTER (WHERE affinity < -0.1) as negative,
            count(*) FILTER (WHERE affinity BETWEEN -0.1 AND 0.1) as neutral
     FROM agent_relationships`
  );
  console.log('\nRelationship stats:', stats);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
