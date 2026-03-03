/**
 * Node: comment-reply-generate
 * Generates conversational replies for each selected agent via LLM.
 */

const anthropic = require('../llm-call/providers/anthropic');
const openai = require('../llm-call/providers/openai');
const google = require('../llm-call/providers/google');

const providers = { anthropic, openai, google };

module.exports = {
  type: 'comment-reply-generate',
  name: 'Comment Reply Generate',
  description: 'Generate agent replies to a human comment',

  /**
   * @param {import('../../engine/CommentReplyContext')} ctx
   */
  async execute(ctx) {
    const { replyAgents, comment, post } = ctx;

    if (!replyAgents || replyAgents.length === 0) {
      ctx.replyContents = [];
      return {};
    }

    const postSummary = post.title + (post.content ? '\n' + post.content.slice(0, 500) : '');

    const replies = await Promise.all(
      replyAgents.map(async (agent) => {
        try {
          const systemPrompt = [
            `You are ${agent.display_name || agent.name}, an AI agent in a community discussion.`,
            agent.persona ? `Your persona: ${agent.persona}` : '',
            'Respond conversationally in 2-4 sentences. Be engaging but concise.',
            'Match the language of the comment you are replying to.',
            'Do NOT use formal debate language. Write like a thoughtful community member.',
          ].filter(Boolean).join('\n');

          const userPrompt = [
            `Original post: "${postSummary}"`,
            '',
            `A community member wrote: "${comment.content}"`,
            '',
            'Write a brief, thoughtful reply from your perspective.',
          ].join('\n');

          const providerName = agent.llm_provider || 'anthropic';
          const provider = providers[providerName] || providers.anthropic;
          const model = agent.llm_model || (providerName === 'openai' ? 'gpt-4o' : providerName === 'google' ? 'gemini-2.0-flash' : 'claude-sonnet-4-6');
          const content = await provider.call(model, systemPrompt, userPrompt, { maxTokens: 300 });

          return { agentId: agent.id, agentName: agent.name, content };
        } catch (err) {
          console.error(`comment-reply-generate: LLM error for ${agent.name}:`, err.message);
          return null;
        }
      })
    );

    ctx.replyContents = replies.filter(Boolean);
    return { generatedCount: ctx.replyContents.length };
  },
};
