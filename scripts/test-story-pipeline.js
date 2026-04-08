#!/usr/bin/env node
/**
 * StoryWriter Pipeline 테스트 — 실제 DashScope + CGB 호출
 *
 * 사용법: node scripts/test-story-pipeline.js [seriesTitle]
 * 기본: "강남역 우연"
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const { Pool } = require('pg');
const { StoryOrchestrator } = require('../src/backend/services/story/StoryOrchestrator');

const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

async function llmCall(system, user, opts = {}) {
  const model = opts.model || 'qwen3.5-flash';
  const maxTokens = opts.maxOutputTokens || 4096;
  console.log(`  [LLM] ${model} (${maxTokens} tokens)...`);
  const start = Date.now();

  const res = await fetch(DASHSCOPE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DASHSCOPE_KEY}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: maxTokens,
    }),
  });

  const d = await res.json();
  const content = d.choices?.[0]?.message?.content || '';
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`  [LLM] ${model} → ${content.length} chars (${elapsed}s)`);
  return content;
}

async function main() {
  const seriesTitle = process.argv[2] || '강남역 우연';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Load series from DB
  const { rows: [series] } = await pool.query(
    'SELECT * FROM series WHERE title = $1', [seriesTitle]
  );
  if (!series) {
    console.error(`시리즈 "${seriesTitle}" 없음`);
    await pool.end();
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📚 ${series.title} (${series.genre})`);
  console.log(`   Agent: ${series.created_by_agent_id?.slice(0, 8)}`);
  console.log(`${'='.repeat(60)}\n`);

  // Get previous episodes
  const { rows: prevEps } = await pool.query(
    `SELECT episode_number, title, script_content FROM episodes
     WHERE series_id = $1 ORDER BY episode_number DESC LIMIT 3`,
    [series.id]
  );
  console.log(`이전 에피소드: ${prevEps.length}개`);

  // CGB brain context
  const BrainClient = require('../src/backend/services/BrainClient');
  const getBrainContext = series.created_by_agent_id
    ? async (topic) => {
        try {
          const result = await BrainClient.research(series.created_by_agent_id, topic);
          return result?.graphContext || [];
        } catch { return []; }
      }
    : null;

  // Create orchestrator
  const story = new StoryOrchestrator({
    genre: series.genre,
    language: 'ko',
    targetWordCount: 3000,
    maxEvalRetries: 1,
    llmCall,
    getBrainContext,
    onProgress: (event) => {
      const { type, ...data } = event;
      if (type === 'stage_start') console.log(`\n▶ Stage: ${data.stage} (${data.agent}${data.attempt > 1 ? ` attempt ${data.attempt}` : ''})`);
      else if (type === 'stage_complete') console.log(`  ✅ ${data.stage} complete`, data);
      else if (type === 'rl_context') console.log(`  📊 RL: ${data.goodPatterns} good / ${data.antiPatterns} anti / avg ${data.avgScore.toFixed(1)}`);
      else if (type === 'rl_promoted') console.log(`  🏆 RL promoted! Score: ${data.score}`);
      else if (type === 'pipeline_complete') console.log(`\n🎉 Pipeline complete: "${data.episode}" — ${data.wordCount} words in ${(data.durationMs/1000).toFixed(0)}s`);
      else if (type === 'pipeline_failed') console.error(`\n❌ Failed at ${data.stage}: ${data.error}`);
      else console.log(`  [${type}]`, data);
    },
  });

  const nextEp = prevEps.length > 0 ? Math.max(...prevEps.map(e => e.episode_number)) + 1 : 1;
  console.log(`\n생성할 에피소드: ep${nextEp}`);

  const result = await story.generateEpisode({
    series,
    agentId: series.created_by_agent_id,
    episodeNumber: nextEp,
    previousEpisodes: prevEps.reverse(),
  });

  if (result.success) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ SUCCESS`);
    console.log(`   제목: ${result.episode.title}`);
    console.log(`   분량: ${result.episode.wordCount} words`);
    console.log(`   시도: ${result.writeAttempts}회`);
    console.log(`   시간: ${(result.durationMs / 1000).toFixed(0)}s`);
    console.log(`   평가: ${result.evaluation?.overallScore || 'N/A'}/5 (passed: ${result.evaluation?.passed})`);
    console.log(`${'='.repeat(60)}`);

    // Check for Chinese chars
    const chinese = result.episode.content.match(/[\u4E00-\u9FFF]/g);
    if (chinese) {
      console.log(`\n⚠️ 중국어 ${chinese.length}자 감지: ${chinese.slice(0, 10).join('')}...`);
    } else {
      console.log(`\n✅ 중국어 없음 — 순수 한국어`);
    }

    // Print first 500 chars
    console.log(`\n--- 본문 미리보기 (500자) ---`);
    console.log(result.episode.content.slice(0, 500));
    console.log('...');
  } else {
    console.error(`\n❌ FAILED: ${result.error}`);
  }

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
