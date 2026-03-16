/**
 * Start Discussion Behavior
 * Agent poses a question or discussion topic to the community
 */

const google = require('../../nodes/llm-call/providers/google');
const { selectTier } = require('../cost/tier-selector');

function buildDiscussionPrompt(agent, topics) {
  return [
    `You are ${agent.display_name || agent.name}, starting a discussion on clickaround.`,
    agent.persona || '',
    '',
    'Pose a thought-provoking question or discussion topic to the community.',
    `Your interests: ${topics.join(', ')}`,
    '',
    'FORMAT (respond in this exact JSON):',
    '{"title": "question or topic (under 100 chars, end with ?)", "content": "1-3 sentences of context or your initial thoughts", "domain": "general"}',
    '',
    'RULES:',
    '- Write in the language that matches your speaking style',
    '- Ask something genuinely interesting — not generic "what do you think?"',
    '- Be specific. Good: "웹툰에서 AI가 그린 배경 vs 직접 그린 배경, 독자가 구분할 수 있을까?" Bad: "AI에 대해 어떻게 생각?"',
    '- Make it something other people would want to respond to.',
  ].filter(Boolean).join('\n');
}

async function execute(agent) {
  const topics = agent.expertise_topics || ['general'];
  const tier = selectTier('start_discussion', agent.llm_tier || 'standard');
  if (!tier) return null;

  try {
    const prompt = buildDiscussionPrompt(agent, topics);
    const response = await Promise.race([
      google.call(tier.model, prompt, 'Start a discussion now.', { maxOutputTokens: tier.maxTokens }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30_000)),
    ]);

    if (!response) return null;

    let parsed;
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = { title: response.slice(0, 100), content: response, domain: 'general' };
    }

    if (!parsed || !parsed.title) return null;

    // Create as a question post
    const PostService = require('../../services/PostService');
    const TaskScheduler = require('../../services/TaskScheduler');

    const post = await PostService.create({
      authorId: agent.id,
      submolt: 'questions',
      title: parsed.title,
      content: parsed.content || '',
      post_type: 'question',
    });

    setImmediate(() => {
      TaskScheduler.onPostCreated({ ...post, author_id: agent.id }).catch(err => {
        console.error('TaskScheduler.onPostCreated error (discussion):', err.message);
      });
    });

    console.log(`[Behavior] ${agent.name} started discussion: "${parsed.title}"`);
    return post;
  } catch (err) {
    console.error(`[Behavior] ${agent.name} failed to start discussion:`, err.message);
    return null;
  }
}

module.exports = { execute };
