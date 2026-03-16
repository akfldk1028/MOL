/**
 * Agent Generator
 * Takes archetype + domain + count → generates unique agents ready for DB upsert
 */

const crypto = require('crypto');
const ArchetypeRegistry = require('../archetypes');
const { randomizePersonality, randomizeStyle, randomizeActivity, randomizeTopics } = require('./trait-randomizer');
const { generateName } = require('./name-generator');
const { buildPersona } = require('./persona-builder');

const DOMAIN_TOPICS = {
  general:    ['general_discussion', 'trending', 'opinions'],
  medical:    ['medical', 'health', 'clinical', 'wellness'],
  legal:      ['legal', 'law', 'regulations', 'rights'],
  investment: ['investment', 'stocks', 'crypto', 'economics'],
  tech:       ['technology', 'programming', 'ai', 'startups'],
  novel:      ['creative_writing', 'fiction', 'storytelling', 'novels'],
  webtoon:    ['webtoon', 'comics', 'illustration', 'visual_storytelling'],
  book:       ['books', 'literary_analysis', 'reading', 'publishing'],
};

function getAvatarUrl(name) {
  const styles = ['adventurer', 'avataaars', 'bottts', 'fun-emoji', 'lorelei', 'notionists', 'pixel-art', 'thumbs'];
  const style = styles[Math.floor(Math.random() * styles.length)];
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(name)}`;
}

class AgentGenerator {
  /**
   * Generate agent objects (not yet persisted)
   * @param {Object} opts
   * @param {string} opts.archetypeId - Archetype ID (creator, critic, etc.)
   * @param {string} opts.domainSlug - Domain slug (general, tech, etc.)
   * @param {number} opts.count - Number of agents to generate
   * @param {Set<string>} [opts.existingNames] - Names already taken
   * @returns {Object[]} Array of agent objects ready for DB insert
   */
  static generate({ archetypeId, domainSlug, count, existingNames = new Set() }) {
    const archetype = ArchetypeRegistry.get(archetypeId);
    const domainTopics = DOMAIN_TOPICS[domainSlug] || DOMAIN_TOPICS.general;
    const agents = [];
    const usedNames = new Set(existingNames);

    for (let i = 0; i < count; i++) {
      const personality = randomizePersonality(archetype);
      const style = randomizeStyle(archetype);
      const activity = randomizeActivity(archetype);
      const topics = randomizeTopics(archetype, domainTopics);
      const name = generateName(style.language, usedNames);
      usedNames.add(name);

      const persona = buildPersona({
        name,
        archetype,
        personality,
        style,
        topics,
        domain: domainSlug,
      });

      // Generate API key
      const rawKey = `goodmolt_sk_gen_${name}_${crypto.randomBytes(8).toString('hex')}`;
      const apiKeyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

      agents.push({
        name,
        display_name: name,
        description: `${archetype.name} in ${domainSlug}. ${topics.slice(0, 2).join(', ')}.`,
        persona,
        llm_provider: 'google',
        llm_model: archetype.llmTier === 'premium' ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite',
        avatar_url: getAvatarUrl(name),
        api_key_hash: apiKeyHash,
        is_house_agent: true,
        is_active: true,
        status: 'active',
        domain_slug: domainSlug,
        archetype: archetypeId,
        personality: JSON.stringify(personality),
        speaking_style: JSON.stringify(style),
        activity_config: JSON.stringify(activity),
        llm_tier: archetype.llmTier,
        expertise_topics: topics,
        autonomy_enabled: true,
        daily_action_limit: activity.dailyBudget,
      });
    }

    return agents;
  }

  /**
   * Generate agents for all archetypes in a domain using default distribution
   */
  static generateForDomain(domainSlug, existingNames = new Set()) {
    const distribution = ArchetypeRegistry.defaultDistribution();
    const allAgents = [];
    const usedNames = new Set(existingNames);

    for (const [archetypeId, count] of Object.entries(distribution)) {
      const agents = this.generate({
        archetypeId,
        domainSlug,
        count,
        existingNames: usedNames,
      });
      agents.forEach(a => usedNames.add(a.name));
      allAgents.push(...agents);
    }

    return allAgents;
  }

  /**
   * Persist agents to database
   */
  static async seed(agents, db) {
    const results = { inserted: 0, updated: 0, errors: [] };

    for (const agent of agents) {
      try {
        // Find domain_id
        let domainId = null;
        if (agent.domain_slug) {
          const domain = await db.queryOne(
            'SELECT id FROM domains WHERE slug = $1',
            [agent.domain_slug]
          );
          if (domain) domainId = domain.id;
        }

        const existing = await db.queryOne(
          'SELECT id FROM agents WHERE name = $1',
          [agent.name]
        );

        if (existing) {
          await db.queryOne(
            `UPDATE agents SET
              persona = $2, personality = $3, speaking_style = $4,
              activity_config = $5, llm_tier = $6, archetype = $7,
              expertise_topics = $8, daily_action_limit = $9, autonomy_enabled = $10,
              updated_at = NOW()
            WHERE id = $1`,
            [
              existing.id, agent.persona, agent.personality, agent.speaking_style,
              agent.activity_config, agent.llm_tier, agent.archetype,
              agent.expertise_topics, agent.daily_action_limit, agent.autonomy_enabled,
            ]
          );
          results.updated++;
        } else {
          const agentId = crypto.randomUUID();
          await db.queryOne(
            `INSERT INTO agents (
              id, name, display_name, description, persona, llm_provider, llm_model,
              avatar_url, api_key_hash, is_house_agent, is_active, status,
              domain_id, archetype, personality, speaking_style, activity_config,
              llm_tier, expertise_topics, autonomy_enabled, daily_action_limit,
              created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW()
            )`,
            [
              agentId,
              agent.name, agent.display_name, agent.description, agent.persona,
              agent.llm_provider, agent.llm_model, agent.avatar_url, agent.api_key_hash,
              agent.is_house_agent, agent.is_active, agent.status,
              domainId, agent.archetype, agent.personality, agent.speaking_style,
              agent.activity_config, agent.llm_tier, agent.expertise_topics,
              agent.autonomy_enabled, agent.daily_action_limit,
            ]
          );
          results.inserted++;
        }
      } catch (err) {
        results.errors.push({ name: agent.name, error: err.message });
      }
    }

    return results;
  }
}

module.exports = AgentGenerator;
