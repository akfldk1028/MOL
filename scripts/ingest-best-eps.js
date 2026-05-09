#!/usr/bin/env node
/**
 * ingest-best-eps.js — Phase B2 자체 우수 에피소드 추출 + CGB 인제스션
 *
 * Goal: 라이브 시리즈에서 HANNA 6D ≥ 3.5 통과한 에피소드를
 *       CGB 그래프에 style references / good-pattern 노드로 ingest.
 *       → 다음 ep 생성 시 ContextComposer가 RRF 검색으로 자동 주입.
 *
 * Usage:
 *   node scripts/ingest-best-eps.js [--limit 10] [--genre fantasy] [--dry]
 *
 * Required env: DATABASE_URL, CGB_API_URL, CGB_API_KEY
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const limit = parseInt(args.find((a, i) => args[i - 1] === '--limit')) || 10;
const genreFilter = args[args.indexOf('--genre') + 1] || null;
const dryRun = args.includes('--dry');

(async () => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  const sql = `
    SELECT
      e.id, e.episode_number, e.title, e.script_content, e.word_count,
      e.quality_scores, e.created_by_agent_id,
      s.title AS series_title, s.genre, s.id AS series_id
    FROM episodes e
    JOIN series s ON e.series_id = s.id
    WHERE e.pipeline_type = 'storywriter'
      AND e.quality_scores IS NOT NULL
      AND (e.quality_scores->>'overallScore')::numeric >= 3.5
      AND (e.quality_scores->>'surprise')::numeric >= 3.0
      AND e.word_count >= 2000
      AND e.script_content IS NOT NULL
      ${genreFilter ? "AND s.genre = $2" : ''}
    ORDER BY (e.quality_scores->>'overallScore')::numeric DESC, e.created_at DESC
    LIMIT $1
  `;
  const params = genreFilter ? [limit, genreFilter] : [limit];
  const { rows } = await pool.query(sql, params);
  console.log(`Found ${rows.length} qualifying episodes${genreFilter ? ` (genre=${genreFilter})` : ''}`);

  if (rows.length === 0) {
    console.warn('No episodes meet quality bar (overall ≥ 3.5, surprise ≥ 3.0, words ≥ 2000).');
    console.warn('Reduce thresholds or wait for Phase A/B effects to accumulate (24h+).');
    await pool.end();
    process.exit(0);
  }

  const TextIngestionService = require('../src/backend/services/story/TextIngestionService');

  for (const row of rows) {
    const overall = parseFloat(row.quality_scores?.overallScore || 0);
    console.log(`\n[ep${row.episode_number}] ${row.series_title} — "${row.title}" (HANNA ${overall.toFixed(1)}, ${row.word_count}w)`);
    if (dryRun) {
      console.log('  [DRY] would ingest first 500 chars:', row.script_content.slice(0, 200));
      continue;
    }
    try {
      await TextIngestionService.ingest(row.script_content, {
        agentId: row.created_by_agent_id,
        title: `${row.series_title} ep${row.episode_number}: ${row.title}`,
        category: row.genre,
        nodeRole: 'good-pattern',
        sourceEpisodeId: row.id,
        seriesId: row.series_id,
        qualityScore: overall,
      });
      console.log(`  ✓ ingested`);
    } catch (err) {
      console.warn(`  ✗ ingest failed: ${err.message}`);
    }
  }

  await pool.end();
  console.log(`\nDone. ${rows.length} episodes ${dryRun ? 'previewed' : 'ingested'}.`);
})();
