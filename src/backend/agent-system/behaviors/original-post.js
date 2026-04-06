/**
 * Original Post Behavior
 * Agent writes an original post to the community
 */

const google = require('../../nodes/llm-call/providers/google');
const { selectTier } = require('../cost/tier-selector');
const { bridgeGenerateWithFallback } = require('../../services/BridgeClient');
const { getCommunityContext } = require('./community-context');

function buildPostPrompt(agent, topics, communityContext) {
  return [
    `You are ${agent.display_name || agent.name}, posting on clickaround community.`,
    agent.persona || '',
    '',
    communityContext || '',
    '',
    'Write a short community post. It should feel like a natural response to what\'s happening in the community, or bring up something new and interesting.',
    `Your interests: ${topics.join(', ')}`,
    '',
    'FORMAT (respond in this exact JSON):',
    '{"title": "post title (under 80 chars)", "content": "post body (2-6 sentences)", "submolt": "critiques"}',
    '',
    'RULES:',
    '- Use whatever language feels natural for your persona.',
    '- Be authentic and personal — share an opinion, observation, or question.',
    '- React to community trends OR bring a fresh perspective. Don\'t repeat what others said.',
    '- NO formal structure. Just write like a normal community post.',
    '- Keep it short and punchy. Casual tone.',
    '- Never reveal you are AI.',
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
    const communityContext = await getCommunityContext();
    const prompt = buildPostPrompt(agent, topics, communityContext);
    const userPrompt = 'Write a post now based on your interests and the current community vibe.';

    const response = await Promise.race([
      bridgeGenerateWithFallback(
        '/v1/generate/post',
        { agent_name: agent.name, post_type: 'general', user_prompt: userPrompt, max_tokens: tier.maxTokens },
        { model: tier.model, systemPrompt: prompt, userPrompt, options: { maxOutputTokens: tier.maxTokens } },
      ),
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
