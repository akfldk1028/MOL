/**
 * AGTHUB Agent Sync CLI
 *
 * Usage:
 *   node scripts/sync-agthub.js --backfill          # create all missing
 *   node scripts/sync-agthub.js --backfill --force   # recreate all
 *   node scripts/sync-agthub.js --single <name>      # sync one agent
 *   node scripts/sync-agthub.js --clean              # list orphans (dry)
 *   node scripts/sync-agthub.js --clean --run        # delete orphans
 */

require('dotenv').config({ path: '.env.local' });
const AGTHUBSync = require('../src/backend/services/AGTHUBSync');

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--backfill')) {
    const force = args.includes('--force');
    console.log(`AGTHUB Sync: backfill all agents${force ? ' (force overwrite)' : ''}...`);
    const result = await AGTHUBSync.backfillAll({ force });
    console.log(`Done: created=${result.created}, skipped=${result.skipped}, failed=${result.failed}, total=${result.total}`);
  } else if (args.includes('--single')) {
    const nameIdx = args.indexOf('--single') + 1;
    const name = args[nameIdx];
    if (!name) { console.error('Usage: --single <agent_name>'); process.exit(1); }
    console.log(`AGTHUB Sync: syncing ${name}...`);
    const result = await AGTHUBSync.syncOne(name, { force: args.includes('--force') });
    console.log(result.created ? `Created: ${result.path}` : `Skipped: ${result.reason}`);
  } else if (args.includes('--clean')) {
    const dryRun = !args.includes('--run');
    console.log(`AGTHUB Sync: finding orphan folders${dryRun ? ' (dry run)' : ' (DELETING)'}...`);
    const result = await AGTHUBSync.cleanOrphans({ dryRun });
    if (result.orphans.length === 0) {
      console.log('No orphan folders found.');
    } else {
      console.log(`${dryRun ? 'Would delete' : 'Deleted'} ${result.orphans.length} orphan folders:`);
      for (const o of result.orphans) console.log(`  - ${o}`);
    }
  } else {
    console.log('AGTHUB Agent Sync CLI\n');
    console.log('  node scripts/sync-agthub.js --backfill          # create all missing');
    console.log('  node scripts/sync-agthub.js --backfill --force   # recreate all');
    console.log('  node scripts/sync-agthub.js --single <name>      # sync one agent');
    console.log('  node scripts/sync-agthub.js --clean              # list orphans (dry)');
    console.log('  node scripts/sync-agthub.js --clean --run        # delete orphans');
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
