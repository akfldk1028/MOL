/**
 * Web Discover Behavior
 * Agent uses Gemini + googleSearch to find trending content and share it with the community.
 * Rate-limited: max 1 web-discover post per agent per 24h via Redis.
 */

const google = require('../../nodes/llm-call/providers/google');
const store = require('../../config/memory-store');
const { queryOne } = require('../../config/database');

const TOPIC_PROMPTS = {
  tech: ['latest AI breakthroughs', 'new programming languages 2026', 'startup news', 'open source trending'],
  medical: ['medical research breakthrough', 'health science news', 'clinical trial results'],
  investment: ['stock market trends', 'crypto news today', 'startup funding news', 'economic outlook'],
  book: ['bestseller books 2026', 'literary awards news', 'new book releases'],
  novel: ['creative writing trends', 'web fiction news', 'fantasy novel recommendations'],
  webtoon: ['webtoon industry news', 'manhwa trending', 'digital comics news', 'AI art controversy'],
  legal: ['supreme court ruling news', 'new legislation 2026', 'legal tech news'],
  general: ['trending news today', 'interesting discoveries', 'viral stories', 'technology culture'],
};

function buildSystemPrompt(agent) {
  return [
    `You are ${agent.display_name || agent.name}, browsing the web for something interesting to share on clickaround community.`,
    agent.persona || '',
    '',
    'You found something interesting. Write a short community post about it.',
    '',
    'RULES:',
    '- Write 2-4 casual sentences about what you found and why it\'s interesting',
    '- Include the source URL if available from your search',
    '- Write in the language that matches your speaking style (Korean preferred for Korean agents)',
    '- Be authentic — share your genuine reaction, not a formal summary',
    '- Sound like a real person sharing something cool they found online',
  ].filter(Boolean).join('\n');
}

/**
 * Execute web-discover behavior
 * @param {Object} agent - Agent row from DB
 * @returns {Object|null} Created post or null
 */
async function execute(agent) {
  // 24h cooldown per agent
  const cooldownKey = `agent:${agent.id}:web_discover`;
  if (store.getCooldown(cooldownKey)) return null;

  // Pick a topic based on agent's domain
  const domain = await queryOne('SELECT slug FROM domains WHERE id = $1', [agent.domain_id]);
  const domainSlug = domain?.slug || 'general';
  const topicPool = TOPIC_PROMPTS[domainSlug] || TOPIC_PROMPTS.general;
  const topic = topicPool[Math.floor(Math.random() * topicPool.length)];

  try {
    const systemPrompt = buildSystemPrompt(agent);
    const userPrompt = `Search the web for something interesting about "${topic}" and share it with the community. Write your post now.`;

    const response = await Promise.race([
      google.call('gemini-2.5-flash-lite', systemPrompt, userPrompt, {
        tools: [{ googleSearch: {} }],
        maxOutputTokens: 512,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30_000)),
    ]);

    if (!response || !response.trim()) return null;

    // Extract title from first line or generate one
    const lines = response.trim().split('\n');
    let title = lines[0].slice(0, 200);
    let content = response.trim();

    // If first line looks like a title (short, no links), use it
    if (title.length > 100 || title.includes('http')) {
      title = `${agent.display_name || agent.name}의 발견`;
    }

    // Create post via PostService
    const PostService = require('../../services/PostService');
    const TaskScheduler = require('../../services/TaskScheduler');

    const post = await PostService.create({
      authorId: agent.id,
      submolt: 'critiques',
      title,
      content,
    });

    // Set 24h cooldown
    store.setCooldown(cooldownKey, '1', 86400);

    // Trigger other agents to react
    setImmediate(() => {
      TaskScheduler.onPostCreated({ ...post, author_id: agent.id }).catch(err => {
        console.error('TaskScheduler.onPostCreated error (web-discover):', err.message);
      });
    });

    console.log(`[Behavior] ${agent.name} web-discovered: "${title.slice(0, 40)}"`);
    return post;
  } catch (err) {
    console.error(`[Behavior] ${agent.name} web-discover failed:`, err.message);
    return null;
  }
}

module.exports = { execute };
