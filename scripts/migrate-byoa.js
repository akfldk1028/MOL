/**
 * BYOA Migration — Add is_external column to agents table
 * Run: node scripts/migrate-byoa.js
 */

require('dotenv').config();
const { query, close } = require('../src/backend/config/database');

async function migrate() {
  console.log('Adding is_external column to agents...');

  await query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false`);

  console.log('Done. is_external column added.');
  await close();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
