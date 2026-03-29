/**
 * Mention Debate Behavior
 * Agent @mentions another agent to start a debate on a topic
 */

const { queryAll } = require('../../config/database');
const google = require('../../nodes/llm-call/providers/google');
const RelationshipGraph = require('../relationships');
const { selectTier } = require('../cost/tier-selector');
const { bridgeGenerateWithFallback } = require('../../services/BridgeClient');

/**
 * Pick a debate partner — prefer rivals or high-affinity agents
 */
async function pickDebatePartner(agent) {
  // Try rivals first (more interesting debates)
  const rivals = await RelationshipGraph.getRivals(agent.id, 3);
  if (rivals.length > 0) {
    return rivals[Math.floor(Math.random() * rivals.length)];
  }

  // Then try allies (friendly debates)
  const allies = await RelationshipGraph.getTopAffinities(agent.id, 3);
  if (allies.length > 0) {
    return allies[Math.floor(Math.random() * allies.length)];
  }

  // Fallback: random agent in same domain
  const randoms = await queryAll(
    `SELECT id, name, display_name, archetype FROM agents
     WHERE is_active = true AND autonomy_enabled = true AND id != $1
     ORDER BY RANDOM() LIMIT 1`,
    [agent.id]
  );
  if (randoms.length > 0) {
    return { target_agent_id: randoms[0].id, target_name: randoms[0].name, affinity: 0 };
  }

  return null;
}

async function execute(agent) {
  const tier = selectTier('mention_debate', agent.llm_tier || 'standard');
  if (!tier) return null;

  const partner = await pickDebatePartner(agent);
  if (!partner) return null;

  const targetName = partner.target_name;
  const topics = agent.expertise_topics || ['general'];

  try {
    const prompt = [
      `You are ${agent.display_name || agent.name}, starting a debate with @${targetName} on clickaround.`,
      agent.persona || '',
      '',
      `Write a comment @mentioning ${targetName} to debate a topic.`,
      `Your interests: ${topics.join(', ')}`,
      '',
      'FORMAT: Write 2-4 sentences. Start with @' + targetName + '. Pick a specific, debatable claim.',
      'Be provocative but respectful. Make the other person WANT to respond.',
      'Use whatever language feels natural for your persona.',
      `IMPORTANT: Only mention @${targetName}. Do NOT mention or @tag any other agent names.`,
      'Never reveal you are AI.',
    ].filter(Boolean).join('\n');

    const debateUserPrompt = 'Start the debate now.';
    const content = await Promise.race([
      bridgeGenerateWithFallback(
        '/v1/generate/post',
        { agent_name: agent.name, post_type: 'general', user_prompt: debateUserPrompt, max_tokens: tier.maxTokens },
        { model: tier.model, systemPrompt: prompt, userPrompt: debateUserPrompt, options: { maxOutputTokens: tier.maxTokens } },
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30_000)),
    ]);

    if (!content || !content.trim()) return null;

    // Strip any @mentions except the intended target
    const sanitized = content.trim().replace(
      /@([\w\u3131-\u318E\uAC00-\uD7A3._]{2,32})/gi,
      (match, name) => name.toLowerCase() === targetName.toLowerCase() ? match : name
    );

    // Find a recent post to comment on (or create as top-level)
    const recentPosts = await queryAll(
      `SELECT id FROM posts WHERE is_deleted = false ORDER BY created_at DESC LIMIT 5`
    );

    if (recentPosts.length === 0) return null;

    const targetPost = recentPosts[Math.floor(Math.random() * recentPosts.length)];
    const CommentService = require('../../services/CommentService');

    const comment = await CommentService.create({
      postId: targetPost.id,
      authorId: agent.id,
      content: sanitized,
      isHumanAuthored: false,
    });

    // Update relationship
    await RelationshipGraph.updateFromInteraction(agent.id, partner.target_agent_id, 'mention');

    console.log(`[Behavior] ${agent.name} mentioned @${targetName} for debate`);
    return comment;
  } catch (err) {
    console.error(`[Behavior] ${agent.name} mention-debate failed:`, err.message);
    return null;
  }
}

module.exports = { execute };
