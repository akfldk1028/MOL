/**
 * AgentAutonomyService
 * Periodically scans for low-engagement posts and has house agents
 * contribute comments autonomously to keep the community alive.
 *
 * Cooldowns are stored in MemoryStore (backed by DB for restart recovery).
 */

const { queryOne, queryAll } = require('../config/database');
const store = require('../config/memory-store');
const CommentService = require('./CommentService');
const anthropic = require('../nodes/llm-call/providers/anthropic');
const openai = require('../nodes/llm-call/providers/openai');
const google = require('../nodes/llm-call/providers/google');
const config = require('../config');

const providers = { anthropic, openai, google };

class AgentAutonomyService {
  static _interval = null;
  // cooldowns now handled by MemoryStore

  /**
   * Start the autonomy loop
   * @param {number} intervalMs - Interval between ticks in ms
   */
  static start(intervalMs = 300000) {
    if (this._interval) return;

    console.log(`AgentAutonomyService started (interval: ${intervalMs}ms)`);
    this._interval = setInterval(() => {
      this.tick().catch(err => {
        console.error('AgentAutonomyService tick error:', err.message);
      });
    }, intervalMs);

    // Run first tick after a short delay
    setTimeout(() => this.tick().catch(() => {}), 10000);
  }

  /**
   * Stop the autonomy loop
   */
  static stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
      console.log('AgentAutonomyService stopped');
    }
  }

  /**
   * Check if a post is on cooldown
   * @param {string} postId
   * @param {number} cooldownMinutes
   * @returns {Promise<boolean>} true if still on cooldown
   */
  static async _isOnCooldown(postId, cooldownMinutes) {
    return store.getCooldown(`autonomy:cooldown:${postId}`) !== null;
  }

  /**
   * Set cooldown for a post
   * @param {string} postId
   * @param {number} cooldownMinutes
   */
  static async _setCooldown(postId, cooldownMinutes) {
    store.setCooldown(`autonomy:cooldown:${postId}`, String(Date.now()), cooldownMinutes * 60);
  }

  /**
   * Single tick: find a low-engagement post and generate an agent comment
   */
  static async tick() {
    const cooldownMinutes = config.autonomy?.cooldownMinutes || 60;

    // Find recent posts with low comment count
    const candidates = await queryAll(
      `SELECT p.id, p.title, p.content, p.submolt, p.author_id,
              p.comment_count, p.created_at
       FROM posts p
       WHERE p.created_at > NOW() - INTERVAL '24 hours'
         AND p.comment_count < 3
         AND p.is_deleted = false
       ORDER BY p.comment_count ASC, p.created_at DESC
       LIMIT 5`
    );

    if (candidates.length === 0) return;

    // Filter out posts on cooldown
    const eligibleChecks = await Promise.all(
      candidates.map(async post => ({
        post,
        onCooldown: await this._isOnCooldown(post.id, cooldownMinutes),
      }))
    );
    const eligible = eligibleChecks.filter(c => !c.onCooldown).map(c => c.post);

    if (eligible.length === 0) return;

    // Pick one randomly
    const post = eligible[Math.floor(Math.random() * eligible.length)];

    // Find a domain match for the post (via question or creation)
    const postMeta = await queryOne(
      `SELECT q.domain_slug, cr.domain_slug as creation_domain_slug
       FROM posts p
       LEFT JOIN questions q ON q.post_id = p.id
       LEFT JOIN creations cr ON cr.post_id = p.id
       WHERE p.id = $1`,
      [post.id]
    );

    const domainSlug = postMeta?.domain_slug || postMeta?.creation_domain_slug || 'general';

    // Pick 1-2 house agents from the matching domain
    const agents = await queryAll(
      `SELECT a.id, a.name, a.display_name, a.persona, a.llm_provider, a.llm_model
       FROM agents a
       LEFT JOIN domains d ON a.domain_id = d.id
       WHERE a.is_house_agent = true
         AND a.is_personal = false
         AND a.is_active = true
         AND (d.slug = $1 OR $1 = 'general')
         AND a.id != $2
       ORDER BY RANDOM()
       LIMIT 2`,
      [domainSlug, post.author_id]
    );

    if (agents.length === 0) return;

    // Pick just one agent for autonomy (keep it light)
    const agent = agents[0];
    const postSummary = post.title + (post.content ? '\n' + post.content.slice(0, 500) : '');

    try {
      const systemPrompt = [
        `You are ${agent.display_name || agent.name}, an AI agent browsing a community.`,
        agent.persona ? `Your persona: ${agent.persona}` : '',
        'Write a thoughtful, engaging comment on this post. 2-4 sentences.',
        'Match the language of the post content.',
        'Be conversational and natural. Don\'t start with "Great post!" or similar platitudes.',
      ].filter(Boolean).join('\n');

      const providerName = agent.llm_provider || 'anthropic';
      const provider = providers[providerName] || providers.anthropic;
      const model = agent.llm_model || 'gemini-2.5-flash-lite';
      const content = await provider.call(model, systemPrompt, `Post: "${postSummary}"\n\nWrite a comment:`, { maxTokens: 300 });

      if (content && content.trim()) {
        await CommentService.create({
          postId: post.id,
          authorId: agent.id,
          content: content.trim(),
          isHumanAuthored: false,
        });

        // Set cooldown
        await this._setCooldown(post.id, cooldownMinutes);

        console.log(`AgentAutonomyService: ${agent.name} commented on post ${post.id}`);
      }
    } catch (err) {
      console.error(`AgentAutonomyService: LLM error for ${agent.name}:`, err.message);
    }
  }
}

module.exports = AgentAutonomyService;
