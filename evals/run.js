#!/usr/bin/env node
/**
 * MOL Performance Evaluation CLI
 *
 * Usage:
 *   node evals/run.js agent           # 에이전트 벤치마크
 *   node evals/run.js cgb             # CGB 그래프 건강도 + 검색 품질
 *   node evals/run.js engine          # 엔진 처리량 + 자율 루프
 *   node evals/run.js content         # 콘텐츠 품질
 *   node evals/run.js all             # 전부
 *   node evals/run.js --json          # JSON 리포트 생성
 *   node evals/run.js agent --days=14 # 14일 기간
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const config = require('./config');

// Lazy DB wrapper (reuses openmolt's pool)
let _db = null;
function getDb() {
  if (_db) return _db;
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  _db = {
    queryOne: async (sql, params) => { const r = await pool.query(sql, params); return r.rows[0] || null; },
    queryAll: async (sql, params) => { const r = await pool.query(sql, params); return r.rows; },
    close: () => pool.end(),
  };
  return _db;
}

// ── Eval suites ──

async function runAgent(db, days) {
  const { runAgentBenchmark } = require('./agent/agent-benchmark');
  return runAgentBenchmark(db, { days });
}

async function runCgb(db, days) {
  const { GraphHealthScorer } = require('./cgb/graph-health');
  const { SearchQualityScorer } = require('./cgb/search-quality');

  const health = await new GraphHealthScorer().score({ db, days });
  const search = await new SearchQualityScorer().score({ db, days });

  return {
    evalType: 'cgb', evalName: 'overview',
    results: [
      { name: 'Graph Health', ...health },
      { name: 'Search Quality (MRR)', ...search },
    ],
  };
}

async function runEngine(db, days) {
  const { TaskThroughputScorer } = require('./engine/task-throughput');
  const { AutonomyHealthScorer } = require('./engine/autonomy-health');

  const throughput = await new TaskThroughputScorer().score({ db, days });
  const autonomy = await new AutonomyHealthScorer().score({ db, days });

  return {
    evalType: 'engine', evalName: 'overview',
    results: [
      { name: 'Task Throughput', ...throughput },
      { name: 'Autonomy Health', ...autonomy },
    ],
  };
}

async function runContent(db, days) {
  const { EpisodeQualityScorer } = require('./content/episode-quality');
  const quality = await new EpisodeQualityScorer().score({ db, days });

  return {
    evalType: 'content', evalName: 'overview',
    results: [{ name: 'Episode Quality', ...quality }],
  };
}

// ── CLI ──

async function main() {
  const args = process.argv.slice(2);
  const suite = args.find(a => !a.startsWith('--')) || 'all';
  const useJson = args.includes('--json');
  const daysArg = args.find(a => a.startsWith('--days='));
  const days = daysArg ? parseInt(daysArg.split('=')[1]) : config.EVAL_WINDOW_DAYS;

  if (!config.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL not set. Run from openmolt/ with .env');
    process.exit(1);
  }

  const db = getDb();
  const results = [];

  try {
    const suites = suite === 'all' ? ['agent', 'cgb', 'engine', 'content'] : [suite];

    for (const s of suites) {
      console.log(`Running ${s} eval (${days} days)...`);
      switch (s) {
        case 'agent': results.push(await runAgent(db, days)); break;
        case 'cgb': results.push(await runCgb(db, days)); break;
        case 'engine': results.push(await runEngine(db, days)); break;
        case 'content': results.push(await runContent(db, days)); break;
        default: console.warn(`Unknown suite: ${s}`);
      }
    }

    if (useJson) {
      const { report } = require('./reporters/json-reporter');
      report(results);
    } else {
      const { reportMultiple } = require('./reporters/console-reporter');
      reportMultiple(results);
    }
  } catch (err) {
    console.error('Eval failed:', err.message);
    process.exit(1);
  } finally {
    await db.close();
  }
}

main();
