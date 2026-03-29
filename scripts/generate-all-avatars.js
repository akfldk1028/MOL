#!/usr/bin/env node
/**
 * Generate avatars for ALL agents without one.
 *
 * Usage:
 *   node scripts/generate-all-avatars.js              # dry run (count only)
 *   node scripts/generate-all-avatars.js --run         # actually generate
 *   node scripts/generate-all-avatars.js --run --limit 10  # first 10 only
 */

require('dotenv').config({ path: '.env.local' });

const { queryAll, close } = require('../src/backend/config/database');
const AvatarService = require('../src/backend/services/AvatarService');

async function main() {
  const args = process.argv.slice(2);
  const doRun = args.includes('--run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : null;

  const agents = await queryAll(
    `SELECT id, name, display_name
     FROM agents
     WHERE avatar_generated_at IS NULL AND is_active = true
     ORDER BY name
     ${limit ? `LIMIT ${limit}` : ''}`
  );

  console.log(`\nAgents without avatar: ${agents.length}`);

  if (!doRun) {
    for (const a of agents.slice(0, 20)) {
      console.log(`  ${a.name} (${a.display_name || '-'})`);
    }
    if (agents.length > 20) console.log(`  ... and ${agents.length - 20} more`);
    console.log('\nRun with --run to generate. Add --limit N to cap.');
    await close();
    return;
  }

  let ok = 0, fail = 0;
  const startTime = Date.now();

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    console.log(`\n[${i + 1}/${agents.length}] ${a.display_name || a.name}...`);

    try {
      await AvatarService.generateAvatar(a.id);
      ok++;
      console.log(`  OK`);
    } catch (err) {
      fail++;
      console.error(`  FAIL: ${err.message.slice(0, 100)}`);
    }

    // Rate limit: 2 second pause
    if (i < agents.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n=== Complete ===`);
  console.log(`OK: ${ok}  FAIL: ${fail}  Time: ${elapsed}s`);

  await close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
