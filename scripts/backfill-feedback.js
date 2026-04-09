#!/usr/bin/env node
/**
 * Backfill feedback_score for episodes with 2+ critique comments.
 * Same logic as TaskWorker._distillFeedback but batch.
 *
 * Usage: node scripts/backfill-feedback.js [--dry-run] [--limit=N]
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { Pool } = require('pg');

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

async function callLLM(systemPrompt, userPrompt) {
  const res = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'qwen-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 500,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`DashScope ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 200;

  if (!DASHSCOPE_API_KEY) {
    console.error('ERROR: DASHSCOPE_API_KEY not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Find episodes with 2+ critiques but no feedback_score
  const episodes = await pool.query(
    `SELECT e.id, e.episode_number, e.title, s.title as series_title, s.genre
     FROM episodes e
     JOIN series s ON e.series_id = s.id
     WHERE e.feedback_score IS NULL
       AND (SELECT COUNT(*) FROM comments c
            WHERE c.episode_id = e.id AND c.is_human_authored = false
              AND c.parent_id IS NULL AND LENGTH(c.content) >= 20) >= 2
     ORDER BY e.created_at DESC
     LIMIT $1`,
    [limit]
  );

  console.log(`Found ${episodes.rows.length} episodes to backfill${dryRun ? ' (DRY RUN)' : ''}`);

  let success = 0;
  let failed = 0;

  for (const ep of episodes.rows) {
    // Collect critiques
    const critiques = await pool.query(
      `SELECT cm.content, a.display_name, a.archetype
       FROM comments cm
       JOIN agents a ON cm.author_id = a.id
       WHERE cm.episode_id = $1
         AND cm.is_human_authored = false
         AND cm.parent_id IS NULL
         AND LENGTH(cm.content) >= 20
       ORDER BY LENGTH(cm.content) DESC
       LIMIT 5`,
      [ep.id]
    );

    const inputText = critiques.rows
      .map(c => `[${c.archetype}] ${c.content}`)
      .join('\n');

    const distillPrompt = `You are a reward model for serialized story generation.
Analyze reader feedback and produce JSON output.

Rate the episode based on reader sentiment (0-10 scale):
- prompt_accuracy, creativity, quality, consistency, emotional_resonance, overall

Also provide 3-5 actionable improvement directives.

Output EXACTLY this JSON format:
{"scores":{"prompt_accuracy":7,"creativity":6,"quality":8,"consistency":5,"emotional_resonance":7,"overall":6.6},"directives":["directive 1","directive 2","directive 3"]}

Use the SAME LANGUAGE as the comments for directives.`;

    try {
      const response = await callLLM(distillPrompt, inputText);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { failed++; continue; }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.scores?.overall) { failed++; continue; }

      const directives = (parsed.directives || []).filter(d => d && d.length > 3);

      if (!dryRun) {
        // feedback_directives is text[] (PostgreSQL array), not JSONB
        await pool.query(
          'UPDATE episodes SET feedback_score = $1, feedback_directives = $2 WHERE id = $3',
          [JSON.stringify(parsed.scores), directives, ep.id]
        );
      }

      success++;
      console.log(`  [${success}/${episodes.rows.length}] ep${ep.episode_number} "${(ep.title || '').slice(0, 30)}" → overall=${parsed.scores.overall}`);

      // Rate limit: 200ms between calls
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      failed++;
      console.warn(`  FAIL ep${ep.episode_number}: ${err.message}`);
    }
  }

  console.log(`\nDone: ${success} scored, ${failed} failed, ${episodes.rows.length} total`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
