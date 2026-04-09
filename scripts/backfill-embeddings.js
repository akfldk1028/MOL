#!/usr/bin/env node
/**
 * Backfill embeddings for graph_nodes without embeddings.
 * Uses Jina v3 (768d) via CGB embedding API pattern.
 *
 * Usage: node scripts/backfill-embeddings.js [--dry-run] [--batch=50] [--limit=N]
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { Pool } = require('pg');

const JINA_KEY = process.env.JINA_API_KEY || '';
const JINA_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v3';
const EMBED_DIM = 768;

async function embedBatch(texts) {
  const res = await fetch(JINA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${JINA_KEY}`,
    },
    body: JSON.stringify({
      model: JINA_MODEL,
      input: texts.map(t => t.slice(0, 8192)),
      dimensions: EMBED_DIM,
      task: 'text-matching',
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jina ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.data || []).map(d => d.embedding);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const batchArg = args.find(a => a.startsWith('--batch='));
  const batchSize = batchArg ? parseInt(batchArg.split('=')[1]) : 50;
  const limitArg = args.find(a => a.startsWith('--limit='));
  const maxLimit = limitArg ? parseInt(limitArg.split('=')[1]) : 50000;

  if (!JINA_KEY) {
    console.error('ERROR: JINA_API_KEY not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Count nulls
  const countResult = await pool.query(
    'SELECT COUNT(*) as cnt FROM graph_nodes WHERE embedding IS NULL AND expired_at IS NULL'
  );
  const totalNull = parseInt(countResult.rows[0].cnt);
  console.log(`Nodes without embedding: ${totalNull}`);
  console.log(`Batch size: ${batchSize}, Limit: ${maxLimit}${dryRun ? ' (DRY RUN)' : ''}`);

  let processed = 0;
  let updated = 0;
  let errors = 0;

  while (processed < maxLimit) {
    // Fetch batch
    const rows = await pool.query(
      `SELECT id, title, description
       FROM graph_nodes
       WHERE embedding IS NULL AND expired_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1`,
      [batchSize]
    );

    if (rows.rows.length === 0) break;

    // Build texts
    const texts = rows.rows.map(r => {
      const desc = r.description || '';
      return desc ? `${r.title}. ${desc}`.slice(0, 8192) : r.title || 'untitled';
    });

    try {
      const embeddings = await embedBatch(texts);

      if (!dryRun) {
        // Update each node
        for (let i = 0; i < rows.rows.length; i++) {
          if (!embeddings[i]) continue;
          await pool.query(
            'UPDATE graph_nodes SET embedding = $1 WHERE id = $2',
            [JSON.stringify(embeddings[i]), rows.rows[i].id]
          );
          updated++;
        }
      } else {
        updated += embeddings.length;
      }

      processed += rows.rows.length;
      const pct = totalNull > 0 ? Math.round((processed / Math.min(totalNull, maxLimit)) * 100) : 0;
      console.log(`  [${pct}%] ${processed} processed, ${updated} updated, ${errors} errors`);

      // Rate limit: 500ms between batches
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      errors++;
      console.warn(`  Batch error: ${err.message}`);
      // Skip this batch and continue
      processed += rows.rows.length;
      // Mark these as attempted by setting a tiny embedding to avoid infinite loop
      // Actually, just break on persistent errors
      if (errors > 10) {
        console.error('Too many errors, stopping');
        break;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Final count
  const finalCount = await pool.query(
    'SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_emb, COUNT(*) as total FROM graph_nodes WHERE expired_at IS NULL'
  );
  const { with_emb, total } = finalCount.rows[0];
  const coverage = (parseInt(with_emb) / parseInt(total) * 100).toFixed(1);

  console.log(`\nDone: ${updated} updated, ${errors} errors`);
  console.log(`Embedding coverage: ${with_emb}/${total} (${coverage}%)`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
