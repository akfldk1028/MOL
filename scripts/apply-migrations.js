#!/usr/bin/env node
/**
 * Apply pending migrations (021, 022) to Supabase PostgreSQL.
 *
 * Usage: node scripts/apply-migrations.js
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const migrations = [
    '021_evolution_upgrade.sql',
    '022_eval_results.sql',
  ];

  for (const file of migrations) {
    const filepath = path.resolve(__dirname, '..', 'supabase', 'migrations', file);
    if (!fs.existsSync(filepath)) {
      console.log(`SKIP: ${file} not found`);
      continue;
    }

    const sql = fs.readFileSync(filepath, 'utf-8');
    try {
      await pool.query(sql);
      console.log(`OK: ${file}`);
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log(`SKIP: ${file} (already applied)`);
      } else {
        console.error(`FAIL: ${file} — ${err.message}`);
      }
    }
  }

  // Verify
  const ft = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='agent_tasks' AND column_name='failure_type'");
  console.log(`\nVerify: agent_tasks.failure_type = ${ft.rows.length > 0 ? 'EXISTS' : 'MISSING'}`);

  const er = await pool.query("SELECT to_regclass('eval_results')");
  console.log(`Verify: eval_results table = ${er.rows[0]?.to_regclass ? 'EXISTS' : 'MISSING'}`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
