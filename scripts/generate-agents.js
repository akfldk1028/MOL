#!/usr/bin/env node
/**
 * Agent Generator CLI
 *
 * Usage:
 *   node scripts/generate-agents.js --archetype creator --domain tech --count 5
 *   node scripts/generate-agents.js --all --per-domain 25
 *   node scripts/generate-agents.js --list-archetypes
 *   node scripts/generate-agents.js --dry-run --archetype lurker --domain general --count 3
 */

require('dotenv').config({ path: '.env.local' });

const { query, queryOne, queryAll, close } = require('../src/backend/config/database');
const AgentGenerator = require('../src/backend/agent-system/generator');
const ArchetypeRegistry = require('../src/backend/agent-system/archetypes');

const db = { query, queryOne, queryAll };

async function main() {
  const args = process.argv.slice(2);
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }

  // List archetypes
  if (flags['list-archetypes'] || flags['list']) {
    console.log('\nAvailable Archetypes:');
    console.log('─'.repeat(60));
    for (const a of ArchetypeRegistry.list()) {
      const dist = ArchetypeRegistry.defaultDistribution();
      console.log(`  ${a.id.padEnd(14)} ${a.name.padEnd(12)} ${a.description}`);
      console.log(`  ${''.padEnd(14)} default: ${dist[a.id]}/domain, tier: ${a.activity.tier}, llm: ${a.llmTier}`);
    }
    console.log(`\nDefault total per domain: ${Object.values(ArchetypeRegistry.defaultDistribution()).reduce((a, b) => a + b, 0)}`);
    process.exit(0);
  }

  // Get existing names
  const existingRows = await queryAll('SELECT name FROM agents');
  const existingNames = new Set(existingRows.map(r => r.name));
  console.log(`\nExisting agents: ${existingNames.size}`);

  let agents = [];

  if (flags.all) {
    // Generate for all domains
    const domains = ['general', 'medical', 'legal', 'investment', 'tech', 'novel', 'webtoon', 'book'];
    for (const domain of domains) {
      const domainAgents = AgentGenerator.generateForDomain(domain, existingNames);
      domainAgents.forEach(a => existingNames.add(a.name));
      agents.push(...domainAgents);
      console.log(`  ${domain}: ${domainAgents.length} agents generated`);
    }
  } else if (flags.archetype && flags.domain) {
    const count = parseInt(flags.count || '5', 10);
    agents = AgentGenerator.generate({
      archetypeId: flags.archetype,
      domainSlug: flags.domain,
      count,
      existingNames,
    });
    console.log(`  ${flags.archetype} × ${count} in ${flags.domain}`);
  } else {
    console.log('Usage:');
    console.log('  --all                          Generate default distribution for all domains');
    console.log('  --archetype <id> --domain <slug> --count <n>  Generate specific agents');
    console.log('  --list-archetypes              List available archetypes');
    console.log('  --dry-run                      Preview without inserting to DB');
    process.exit(1);
  }

  console.log(`\nTotal generated: ${agents.length}`);

  // Preview
  if (flags['dry-run']) {
    console.log('\n--- DRY RUN (not persisted) ---\n');
    for (const a of agents.slice(0, 5)) {
      console.log(`  ${a.name} [${a.archetype}/${a.domain_slug}] tier=${a.llm_tier}`);
      console.log(`    style: ${JSON.parse(a.speaking_style).language}, topics: ${a.expertise_topics.join(', ')}`);
      console.log(`    persona preview: ${a.persona.split('\n').slice(0, 3).join(' | ')}`);
      console.log();
    }
    if (agents.length > 5) console.log(`  ... and ${agents.length - 5} more\n`);
    process.exit(0);
  }

  // Run migration first
  console.log('\nRunning migration...');
  try {
    const fs = require('fs');
    const migrationSql = fs.readFileSync('supabase/migrations/006_agent_community.sql', 'utf8');
    await query(migrationSql);
    console.log('  Migration applied.');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('  Migration already applied.');
    } else {
      console.error('  Migration error:', err.message);
    }
  }

  // Seed to DB
  console.log('\nSeeding agents...');
  const results = await AgentGenerator.seed(agents, db);
  console.log(`  Inserted: ${results.inserted}`);
  console.log(`  Updated:  ${results.updated}`);
  if (results.errors.length > 0) {
    console.log(`  Errors:   ${results.errors.length}`);
    results.errors.slice(0, 5).forEach(e => console.log(`    ${e.name}: ${e.error}`));
  }

  // Summary
  const totalCount = await queryOne('SELECT count(*) as cnt FROM agents');
  console.log(`\nTotal agents in DB: ${totalCount.cnt}`);

  const archetypeCounts = await queryAll(
    `SELECT archetype, count(*) as cnt FROM agents WHERE archetype IS NOT NULL GROUP BY archetype ORDER BY cnt DESC`
  );
  if (archetypeCounts.length > 0) {
    console.log('\nBy archetype:');
    for (const row of archetypeCounts) {
      console.log(`  ${(row.archetype || 'legacy').padEnd(14)} ${row.cnt}`);
    }
  }

  await close();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
