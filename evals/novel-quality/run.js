#!/usr/bin/env node
/**
 * Novel Quality Evaluation Runner
 *
 * 사용법:
 *   node evals/novel-quality/run.js all
 *   node evals/novel-quality/run.js word-count
 *   node evals/novel-quality/run.js language
 *   node evals/novel-quality/run.js hanna
 *   node evals/novel-quality/run.js --days 1
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.local') });
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const { scoreWordCountTarget } = require('./metrics/word-count-target');
const { scoreLanguagePurity } = require('./metrics/language-purity');
const { scoreHanna6D } = require('./metrics/hanna-6d');

async function main() {
  const args = process.argv.slice(2);
  const scope = args.find(a => !a.startsWith('--')) || 'all';
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) : 7;
  const jsonOnly = args.includes('--json');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const results = {};

  if (scope === 'all' || scope === 'word-count') {
    results.wordCountTarget = await scoreWordCountTarget(pool, { days });
  }
  if (scope === 'all' || scope === 'language') {
    results.languagePurity = await scoreLanguagePurity(pool, { days });
  }
  if (scope === 'all' || scope === 'hanna') {
    results.hanna = await scoreHanna6D(pool, { days });
  }

  await pool.end();

  if (jsonOnly) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Pretty report
  console.log('=' .repeat(70));
  console.log(`Novel Quality Evaluation — last ${days} days`);
  console.log('='.repeat(70));

  if (results.wordCountTarget) {
    console.log('\n📏 WORD COUNT TARGET (actual / target ratio)');
    console.log('-'.repeat(70));
    console.table(results.wordCountTarget.summary);
    console.log(`Total samples: ${results.wordCountTarget.samples.length}`);
    const below60 = results.wordCountTarget.samples.filter(s => s.ratio < 0.6);
    if (below60.length > 0) {
      console.log(`⚠️  ${below60.length} episodes below 60% target (should have been rejected by validate)`);
      below60.slice(0, 5).forEach(s => console.log(`   [${s.language}] ${s.series} — ${s.episode}: ${s.actual}/${s.target} (${(s.ratio*100).toFixed(0)}%)`));
    }
  }

  if (results.languagePurity) {
    console.log('\n🌐 LANGUAGE PURITY (valid chars / total)');
    console.log('-'.repeat(70));
    console.table(results.languagePurity.summary);
    const contaminated = results.languagePurity.samples.filter(s => s.purity < 0.8);
    if (contaminated.length > 0) {
      console.log(`⚠️  ${contaminated.length} episodes with < 80% purity:`);
      contaminated.slice(0, 5).forEach(s => console.log(`   [${s.language}] ${s.series} — ${s.episode}: purity=${(s.purity*100).toFixed(0)}% (valid=${s.valid}, pollution=${s.pollution})`));
    }
  }

  if (results.hanna) {
    console.log('\n⭐ HANNA 6D (Evaluation Harness scores)');
    console.log('-'.repeat(70));
    console.table(results.hanna.summary);
  }

  // Save report
  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(reportsDir, `${ts}-${scope}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Report saved: ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
