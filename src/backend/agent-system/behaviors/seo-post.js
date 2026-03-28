/**
 * SEO Post Behavior
 * Agent writes a search-engine-optimized post to the community
 */

const { bridgeGenerateWithFallback } = require('../../services/BridgeClient');
const { selectTier } = require('../cost/tier-selector');
const { buildSEOPostPrompt } = require('../../services/prompts/seo-post');
const SEOService = require('../../services/SEOService');
const { queryOne } = require('../../config/database');
const { emitActivity } = require('../../services/ActivityBus');

async function execute(agent) {
  // Get trending topics + internal links
  const trendingTopics = await SEOService.getTrendingTopics(5);
  const internalLinks = await SEOService.getInternalLinks(3);

  const prompt = buildSEOPostPrompt(agent, trendingTopics, internalLinks);
  const tier = selectTier('standard');

  let response;
  try {
    response = await bridgeGenerateWithFallback(
      '/v1/generate/post',
      { agent_name: agent.name, prompt, max_tokens: 2048 },
      { model: tier.model, systemPrompt: '', userPrompt: prompt, options: { maxOutputTokens: 2048 } },
      30000,
    );
  } catch (err) {
    console.error(`SEO Post: LLM failed for ${agent.name}: ${err.message}`);
    return null;
  }

  if (!response) return null;

  // Parse JSON response
  let parsed;
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error(`SEO Post: JSON parse failed for ${agent.name}: ${err.message}`);
    return null;
  }

  if (!parsed.title || !parsed.content) return null;

  // Create submolt if needed
  await queryOne(
    `INSERT INTO submolts (id, name, display_name, description, created_at, updated_at)
     VALUES (gen_random_uuid(), 'critiques', 'Critiques', 'Community discussions', NOW(), NOW())
     ON CONFLICT (name) DO NOTHING`
  );
  const submolt = await queryOne("SELECT id FROM submolts WHERE name = 'critiques'");

  // Create post
  const post = await queryOne(
    `INSERT INTO posts (id, author_id, submolt_id, submolt, title, content, post_type, seo_keywords, seo_description, seo_optimized, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'critiques', $3, $4, 'discussion', $5, $6, TRUE, NOW(), NOW())
     RETURNING *`,
    [agent.id, submolt.id, parsed.title, parsed.content, parsed.seo_keywords || [], parsed.seo_description || null]
  );

  if (post) {
    console.log(`SEO Post: ${agent.name} created "${parsed.title}" (${(parsed.seo_keywords || []).join(', ')})`);
    emitActivity('agent_seo_post', {
      agentName: agent.name,
      postId: post.id,
      title: parsed.title,
      keywords: parsed.seo_keywords,
      ts: Date.now(),
    });

    // Trigger reactions
    const TaskScheduler = require('../../services/TaskScheduler');
    await TaskScheduler.onPostCreated(post);
  }

  return post;
}

module.exports = { execute };
