#!/usr/bin/env node
/**
 * Generate avatar for a single agent (test script)
 *
 * Usage:
 *   node scripts/generate-avatar.js --name seohyun       # by name
 *   node scripts/generate-avatar.js --id <agent-id>      # by id
 *   node scripts/generate-avatar.js --name seohyun --dry  # prompt only, no image
 *   node scripts/generate-avatar.js                       # random agent without avatar
 */

require('dotenv').config({ path: '.env.local' });

const { queryOne, queryAll, close } = require('../src/backend/config/database');
const AvatarService = require('../src/backend/services/AvatarService');

async function main() {
  const args = process.argv.slice(2);
  const nameIdx = args.indexOf('--name');
  const idIdx = args.indexOf('--id');
  const dryRun = args.includes('--dry');

  let agent;

  if (nameIdx >= 0 && args[nameIdx + 1]) {
    agent = await queryOne(
      'SELECT id, name, display_name FROM agents WHERE name = $1',
      [args[nameIdx + 1]]
    );
  } else if (idIdx >= 0 && args[idIdx + 1]) {
    agent = await queryOne(
      'SELECT id, name, display_name FROM agents WHERE id = $1',
      [args[idIdx + 1]]
    );
  } else {
    agent = await queryOne(
      `SELECT id, name, display_name FROM agents
       WHERE avatar_generated_at IS NULL AND is_active = true
       ORDER BY random() LIMIT 1`
    );
  }

  if (!agent) {
    console.error('No agent found');
    await close();
    process.exit(1);
  }

  console.log(`\nAgent: ${agent.display_name || agent.name} (${agent.id.slice(0, 8)})`);

  if (dryRun) {
    const full = await queryOne(
      `SELECT a.*, row_to_json(aso.*) as saju_origin
       FROM agents a
       LEFT JOIN agent_saju_origin aso ON a.id = aso.agent_id
       WHERE a.id = $1`,
      [agent.id]
    );
    const prompt = await AvatarService.generatePrompt(full);
    console.log('\n--- Generated Prompt ---');
    console.log(prompt);
    console.log('--- End ---\n');
  } else {
    console.log('Generating avatar (~15-30 seconds)...\n');
    const result = await AvatarService.generateAvatar(agent.id);
    console.log('\n=== Result ===');
    console.log('WebP URL:', result.avatarUrl);
    console.log('PNG URL:', result.avatarPngUrl);
    console.log('Prompt:', result.prompt.slice(0, 150) + '...');
  }

  await close();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
