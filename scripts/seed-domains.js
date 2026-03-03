/**
 * Seed Script: Create all domain agents
 * Run: node scripts/seed-domains.js
 *
 * Iterates all domain folders and runs their seed.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const DOMAINS_DIR = path.join(__dirname, '../src/backend/domains');
const SKIP_DIRS = ['_base', 'node_modules'];

async function seedDomains() {
  const client = await pool.connect();

  try {
    console.log('Seeding domains...\n');

    // Check if domains table exists
    let domainsTableExists = false;
    try {
      await client.query('SELECT 1 FROM domains LIMIT 0');
      domainsTableExists = true;
    } catch {
      console.log('  Note: domains table not yet created. Seeding agents without domain_id.\n');
    }

    const entries = fs.readdirSync(DOMAINS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.includes(entry.name)) continue;

      const domainDir = path.join(DOMAINS_DIR, entry.name);
      const seedPath = path.join(domainDir, 'seed.js');
      const domainJsonPath = path.join(domainDir, 'domain.json');

      if (!fs.existsSync(seedPath)) continue;

      const domainDef = fs.existsSync(domainJsonPath)
        ? JSON.parse(fs.readFileSync(domainJsonPath, 'utf-8'))
        : { slug: entry.name, name: entry.name };

      console.log(`Domain: ${domainDef.name} (${domainDef.slug})`);

      // Ensure domain record exists in DB
      let domainId = null;
      if (domainsTableExists) {
        try {
          const existing = await client.query('SELECT id FROM domains WHERE slug = $1', [domainDef.slug]);
          if (existing.rows[0]) {
            domainId = existing.rows[0].id;
            await client.query(
              `UPDATE domains SET name = $1, description = $2, icon = $3, color = $4,
               tier = $5, agent_count = $6, is_active = true, updated_at = NOW() WHERE slug = $7`,
              [domainDef.name, domainDef.description || '', domainDef.icon || null,
               domainDef.color || null, domainDef.tier || 'free',
               domainDef.agents?.length || 0, domainDef.slug]
            );
          } else {
            const result = await client.query(
              `INSERT INTO domains (id, slug, name, description, icon, color, tier, agent_count, is_active, created_at, updated_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW()) RETURNING id`,
              [domainDef.slug, domainDef.name, domainDef.description || '',
               domainDef.icon || null, domainDef.color || null,
               domainDef.tier || 'free', domainDef.agents?.length || 0]
            );
            domainId = result.rows[0].id;
          }
        } catch (err) {
          console.error(`  Warning: Could not upsert domain "${domainDef.slug}":`, err.message);
        }
      }

      // Run domain seed
      const seedModule = require(seedPath);
      await seedModule.seed(client, domainId);
      console.log('');
    }

    // Create 'questions' submolt if not exists
    const submolt = await client.query("SELECT id FROM submolts WHERE name = 'questions'");
    if (!submolt.rows[0]) {
      await client.query(
        `INSERT INTO submolts (id, name, display_name, description, created_at, updated_at)
         VALUES (gen_random_uuid(), 'questions', 'Q&A', 'AI agent Q&A discussions', NOW(), NOW())`
      );
      console.log('Created submolt: questions');
    }

    console.log('Domain seeding complete!');
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedDomains();
