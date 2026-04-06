/**
 * Start Series Behavior
 * Agent autonomously creates a new webtoon or novel series
 */

const { queryOne, queryAll } = require('../../config/database');
const { bridgeGenerateWithFallback } = require('../../services/BridgeClient');
const BrainClient = require('../../services/BrainClient');

const GENRES = ['fantasy', 'romance', 'thriller', 'sci-fi', 'slice-of-life', 'horror', 'comedy', 'drama'];

function buildSeriesPrompt(agent, topics, brainContext) {
  const contentType = Math.random() < 0.4 ? 'webtoon' : 'novel';
  const contextBlock = brainContext.length > 0
    ? `\n\nINSPIRATION FROM YOUR KNOWLEDGE GRAPH:\n${brainContext.map(n => `- [${n.type}] ${n.title}: ${(n.description || '').slice(0, 100)}`).join('\n')}\nUse these as creative seeds — combine, twist, or expand on them.\n`
    : '';

  return {
    contentType,
    prompt: [
      `You are ${agent.display_name || agent.name}, a creative agent starting a new ${contentType} series.`,
      agent.persona ? agent.persona.slice(0, 300) : '',
      '',
      `Your interests/expertise: ${topics.join(', ')}`,
      contextBlock,
      `Create a compelling ${contentType} series concept. Respond in this exact JSON:`,
      '{"title": "series title (Korean, under 20 chars)", "synopsis": "engaging synopsis (3-5 sentences, Korean)", "genre": "one of: fantasy, romance, thriller, sci-fi, slice-of-life, horror, comedy, drama", "target_word_count": 800}',
      '',
      'RULES:',
      '- Title should be catchy and memorable in Korean',
      '- Synopsis should hook readers immediately',
      '- Genre must match your personality and interests',
      '- Draw inspiration from your knowledge graph — make unexpected connections',
      '- Be creative and original — avoid cliche plots',
    ].filter(Boolean).join('\n'),
  };
}

/**
 * Execute start-series behavior
 * @param {Object} agent - Agent row from DB
 * @returns {Object|null} Created series or null
 */
async function execute(agent) {
  // Max 2 ongoing series per agent
  const ongoingCount = await queryOne(
    `SELECT COUNT(*) as cnt FROM series WHERE created_by_agent_id = $1 AND status = 'ongoing'`,
    [agent.id]
  );
  if (parseInt(ongoingCount?.cnt || '0') >= 2) return null;

  // Get agent interests
  const topics = agent.expertise_topics || ['creative writing', 'storytelling'];
  const parsedTopics = Array.isArray(topics) ? topics : (typeof topics === 'string' ? JSON.parse(topics) : ['creative writing']);

  // CGB Brain: search for creative inspiration from knowledge graph
  let brainContext = [];
  try {
    const research = await BrainClient.research(agent.id, parsedTopics.slice(0, 3).join(' '));
    brainContext = research?.graphContext || [];
  } catch {}

  const { contentType, prompt } = buildSeriesPrompt(agent, parsedTopics.slice(0, 5), brainContext);

  let response;
  try {
    response = await bridgeGenerateWithFallback(
      '/v1/generate/raw',
      { system_prompt: prompt, user_prompt: 'Create a new series concept now.', max_tokens: 512 },
      { model: 'gemini-2.5-flash-lite', systemPrompt: prompt, userPrompt: 'Create a new series concept now.', options: { maxOutputTokens: 512 } },
      30000,
    );
  } catch (err) {
    console.error(`StartSeries: LLM failed for ${agent.name}: ${err.message}`);
    return null;
  }

  if (!response || !response.trim()) return null;

  // Parse JSON
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  if (!parsed.title || !parsed.synopsis) return null;

  const genre = GENRES.includes(parsed.genre) ? parsed.genre : 'fantasy';
  const slug = `${agent.name}-${Date.now().toString(36)}`;

  // Insert series
  const series = await queryOne(
    `INSERT INTO series (id, slug, title, description, synopsis, content_type, genre, status,
       created_by_agent_id, schedule_cron, target_word_count, episode_count, next_episode_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'ongoing',
       $7, '0 */4 * * *', $8, 0, NOW())
     RETURNING *`,
    [slug, parsed.title, parsed.synopsis, parsed.synopsis, contentType, genre,
     agent.id, parsed.target_word_count || 800]
  );

  if (!series) return null;

  // Schedule first episode immediately
  const TaskScheduler = require('../../services/TaskScheduler');
  await TaskScheduler.createTask({
    type: 'create_episode',
    agentId: agent.id,
    targetId: series.id,
    targetType: 'series',
    delayMinutes: 1,
  });

  // Record to CGB brain: new series as an Idea node
  BrainClient.addToGraph(agent.id, {
    id: `series-${series.id}`,
    type: 'Idea',
    title: `Series: ${parsed.title}`,
    description: parsed.synopsis,
    contentDomain: genre,
  }).catch(() => {});

  console.log(`StartSeries: ${agent.name} created "${parsed.title}" (${contentType}/${genre}) with ${brainContext.length} brain inspirations`);

  return series;
}

module.exports = { execute };
