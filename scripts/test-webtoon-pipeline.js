/**
 * Manual test: create a test series with characters, generate 1 episode
 *
 * Usage:
 *   node scripts/test-webtoon-pipeline.js --create    # create test series + characters
 *   node scripts/test-webtoon-pipeline.js --episode   # generate episode
 *   node scripts/test-webtoon-pipeline.js --episode --dry  # LLM script only, no images
 */

require('dotenv').config({ path: '.env.local' });
const { queryOne, queryAll } = require('../src/backend/config/database');
const { EpisodeGenerator, CharacterSheetGenerator } = require('../src/backend/services/webtoon');
const EpisodeService = require('../src/backend/services/EpisodeService');
const google = require('../src/backend/nodes/llm-call/providers/google');
const { buildEpisodeSystemPrompt, buildEpisodeUserPrompt } = require('../src/backend/services/prompts/episode-generation');
const ScriptParser = require('../src/backend/services/webtoon/ScriptParser');

const TEST_SERIES_SLUG = 'test-webtoon-v2';

async function createTestSeries() {
  const agent = await queryOne(`SELECT * FROM agents WHERE is_house_agent = true ORDER BY RANDOM() LIMIT 1`);
  console.log(`Agent: ${agent.name} (${agent.display_name})`);

  let series = await queryOne(`SELECT * FROM series WHERE slug = $1`, [TEST_SERIES_SLUG]);
  if (!series) {
    series = await queryOne(
      `INSERT INTO series (slug, title, description, content_type, genre, status, created_by_agent_id, schedule_cron, style_preset)
       VALUES ($1, $2, $3, 'webtoon', 'fantasy', 'ongoing', $4, '0 1 * * 1,4', 'korean_webtoon')
       RETURNING *`,
      [TEST_SERIES_SLUG, 'Test Webtoon V2', 'A test series for webtoon pipeline v2', agent.id]
    );
    console.log(`Series created: ${series.title} (${series.id})`);
  } else {
    console.log(`Series exists: ${series.title} (${series.id})`);
  }

  console.log('Generating character sheets...');
  const characters = [
    { name: 'Hero', description: 'A young warrior with spiky silver hair, bright green eyes, wearing blue armor with gold trim, athletic build', personality: 'brave and determined' },
    { name: 'Mentor', description: 'An elderly wizard with long white beard, purple robes with star patterns, tall and thin, carrying a wooden staff', personality: 'wise and mysterious' },
  ];

  const results = await CharacterSheetGenerator.generateAll({
    seriesId: series.id, seriesSlug: series.slug, agentName: agent.name, characters,
  });

  for (const r of results) {
    console.log(`  ${r.name}: ${Object.keys(r.referenceUrls).join(', ')} ${r.error ? '(ERROR: ' + r.error + ')' : ''}`);
  }
  console.log('Done! Run with --episode to generate first episode.');
}

async function generateEpisode(dryRun = false) {
  const series = await queryOne(`SELECT * FROM series WHERE slug = $1`, [TEST_SERIES_SLUG]);
  if (!series) { console.error('Series not found. Run with --create first.'); process.exit(1); }

  const agent = await queryOne(`SELECT * FROM agents WHERE id = $1`, [series.created_by_agent_id]);
  const nextEp = await EpisodeService.getNextNumber(series.id);

  console.log(`Generating episode ${nextEp} for "${series.title}" by ${agent.name}...`);

  const systemPrompt = buildEpisodeSystemPrompt(agent, series, nextEp);
  const userPrompt = buildEpisodeUserPrompt(series, [], []);

  console.log('Calling LLM...');
  const response = await google.call('gemini-2.5-flash-lite', systemPrompt, userPrompt, { maxOutputTokens: 8192 });

  const { title, pages } = ScriptParser.parse(response);
  console.log(`Script: "${title}", ${pages.length} pages`);

  if (dryRun) {
    for (const [i, p] of pages.entries()) {
      console.log(`\n--- PAGE ${i + 1} ---`);
      console.log(`SCENE: ${p.scene.slice(0, 100)}...`);
      console.log(`DIALOGUE: ${p.dialogue}`);
      console.log(`MOOD: ${p.mood}`);
    }
    console.log('\nDry run complete. Run without --dry to generate images.');
    process.exit(0);
  }

  const { episode, imageUrls } = await EpisodeGenerator.generate({
    llmResponse: response, series, agent, episodeNumber: nextEp,
  });

  console.log(`\nEpisode created: "${episode.title}"`);
  console.log(`Pages: ${imageUrls.length}`);
  for (const [i, url] of imageUrls.entries()) {
    console.log(`  page ${i + 1}: ${url}`);
  }
  process.exit(0);
}

const args = process.argv.slice(2);
if (args.includes('--create')) {
  createTestSeries().catch(err => { console.error(err); process.exit(1); });
} else if (args.includes('--episode')) {
  generateEpisode(args.includes('--dry')).catch(err => { console.error(err); process.exit(1); });
} else {
  console.log('Usage:');
  console.log('  node scripts/test-webtoon-pipeline.js --create         # create test series + characters');
  console.log('  node scripts/test-webtoon-pipeline.js --episode        # generate episode');
  console.log('  node scripts/test-webtoon-pipeline.js --episode --dry  # LLM script only');
}