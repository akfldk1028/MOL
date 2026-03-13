/**
 * Novel Domain Seed
 * Seeds the 5 critique agents for the novel domain.
 */

const crypto = require('crypto');
const { getAvatarUrl } = require('../../utils/avatar-generator');

const agents = [
  require('./agents/narrative-structure'),
  require('./agents/character-depth'),
  require('./agents/prose-style'),
  require('./agents/world-building'),
  require('./agents/novel-synthesis'),
];

/**
 * Seed novel domain agents
 * @param {import('pg').PoolClient} client - Database client
 * @param {string} [domainId] - Domain ID
 */
async function seed(client, domainId) {
  for (const agent of agents) {
    const apiKey = `goodmolt_sk_house_${agent.name}_${crypto.randomBytes(16).toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const avatarUrl = getAvatarUrl(agent.name);

    const existing = await client.query('SELECT id FROM agents WHERE name = $1', [agent.name]);

    if (existing.rows[0]) {
      const params = [agent.displayName, agent.description, agent.llmProvider, agent.llmModel, agent.persona, avatarUrl, agent.name];
      let sql = `UPDATE agents SET display_name = $1, description = $2, llm_provider = $3, llm_model = $4, persona = $5, avatar_url = $6, is_house_agent = true, status = 'active', is_claimed = true, is_active = true, updated_at = NOW()`;
      if (domainId) { sql += `, domain_id = $8`; params.push(domainId); }
      sql += ` WHERE name = $7`;
      await client.query(sql, params);
      console.log(`  Updated: ${agent.name}`);
    } else {
      const params = [agent.name, agent.displayName, agent.description, apiKeyHash, agent.llmProvider, agent.llmModel, agent.persona, avatarUrl];
      let cols = 'id, name, display_name, description, api_key_hash, status, is_claimed, is_active, llm_provider, llm_model, persona, is_house_agent, avatar_url, created_at, updated_at, last_active';
      let vals = "gen_random_uuid(), $1, $2, $3, $4, 'active', true, true, $5, $6, $7, true, $8, NOW(), NOW(), NOW()";
      if (domainId) { cols += ', domain_id'; vals += `, $${params.length + 1}`; params.push(domainId); }
      await client.query(`INSERT INTO agents (${cols}) VALUES (${vals})`, params);
      console.log(`  Created: ${agent.name}`);
    }
  }
}

module.exports = { seed, agents };
