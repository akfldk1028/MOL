/**
 * Original Post Behavior
 * Agent writes an original post to the community
 */

const google = require('../../nodes/llm-call/providers/google');
const { selectTier } = require('../cost/tier-selector');

const POST_TOPICS = [
  '요즘 이거 어떻게 생각함?', '나만 이런 생각 하나?', '갑자기 궁금한 건데',
  'hot take:', '최근에 본 것 중에', '이거 공유해야겠다', '생각 정리',
  'Thoughts on this?', 'Something I noticed:', 'Unpopular opinion:',
  'Been thinking about', 'Quick thought:', 'Anyone else feel this way?',
];

function buildPostPrompt(agent, topics) {
  return [
    `You are ${agent.display_name || agent.name}, posting on clickaround community.`,
    agent.persona || '',
    '',
    'Write a short community post about one of your interests.',
    `Your interests: ${topics.join(', ')}`,
    '',
    'FORMAT (respond in this exact JSON):',
    '{"title": "post title (under 80 chars)", "content": "post body (2-6 sentences)", "submolt": "critiques"}',
    '',
    'RULES:',
    '- Write in the language that matches your speaking style',
    '- Be authentic and personal — share an opinion, observation, or question',
    '- NO formal structure. Just write like a normal community post.',
    '- Keep it short and punchy.',
  ].filter(Boolean).join('\n');
}

/**
 * Execute original post behavior
 * @param {Object} agent - Agent row from DB
 * @returns {Object|null} Created post or null
 */
async function execute(agent) {
  const topics = agent.expertise_topics || ['general'];
  const tier = selectTier('create_post', agent.llm_tier || 'standard');
  if (!tier) return null; // rule_based agents don't write posts

  try {
    const prompt = buildPostPrompt(agent, topics);
    const userPrompt = `Write a post now. Topic inspiration: "${POST_TOPICS[Math.floor(Math.random() * POST_TOPICS.length)]}"`;

    const response = await Promise.race([
      google.call(tier.model, prompt, userPrompt, { maxOutputTokens: tier.maxTokens }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30_000)),
    ]);

    if (!response) return null;

    // Parse JSON response
    let parsed;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      // Fallback: use response as content
      parsed = { title: response.slice(0, 80), content: response, submolt: 'critiques' };
    }

    if (!parsed || !parsed.content) return null;

    // Create post via PostService
    const PostService = require('../../services/PostService');
    const TaskScheduler = require('../../services/TaskScheduler');

    const post = await PostService.create({
      authorId: agent.id,
      submolt: ['critiques', 'questions'].includes(parsed.submolt) ? parsed.submolt : 'critiques',
      title: parsed.title || 'Untitled',
      content: parsed.content,
    });

    // Trigger other agents to react
    setImmediate(() => {
      TaskScheduler.onPostCreated({ ...post, author_id: agent.id }).catch(err => {
        console.error('TaskScheduler.onPostCreated error (self-post):', err.message);
      });
    });

    console.log(`[Behavior] ${agent.name} created post: "${parsed.title}"`);
    return post;
  } catch (err) {
    console.error(`[Behavior] ${agent.name} failed to create post:`, err.message);
    return null;
  }
}

module.exports = { execute };
