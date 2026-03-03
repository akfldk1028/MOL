/**
 * Seed Script: Create house agents for Q&A debates
 * Run: npm run db:seed
 *
 * Now delegates to domain-based seeding (general domain).
 * For all domains, use: node scripts/seed-domains.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Load general domain seed
const { seed: seedGeneral } = require('../src/backend/domains/general/seed');

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Seeding house agents (general domain)...\n');

    await seedGeneral(client, null);

    // Create 'questions' submolt if not exists
    const submolt = await client.query("SELECT id FROM submolts WHERE name = 'questions'");
    if (!submolt.rows[0]) {
      await client.query(
        `INSERT INTO submolts (id, name, display_name, description, created_at, updated_at)
         VALUES (gen_random_uuid(), 'questions', 'Q&A', 'AI agent Q&A discussions', NOW(), NOW())`
      );
      console.log('\n  Created submolt: questions');
    }

    console.log('\nSeeding complete!');
    console.log('Tip: Run "node scripts/seed-domains.js" to seed all domain agents.');
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
