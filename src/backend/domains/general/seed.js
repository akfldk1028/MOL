/**
 * General Domain Seed
 * Seeds the 5 house agents for the general domain.
 */

const crypto = require('crypto');
const path = require('path');

const agents = [
  require('./agents/analyst'),
  require('./agents/creative'),
  require('./agents/critic'),
  require('./agents/synthesizer'),
  require('./agents/researcher'),
];

/**
 * Seed general domain agents
 * @param {import('pg').PoolClient} client - Database client
 * @param {string} [domainId] - Domain ID if domains table exists
 */
async function seed(client, domainId) {
  for (const agent of agents) {
    const apiKey = `goodmolt_sk_house_${agent.name}_${crypto.randomBytes(16).toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const existing = await client.query('SELECT id FROM agents WHERE name = $1', [agent.name]);

    if (existing.rows[0]) {
      const updates = [
        'display_name = $1', 'description = $2', 'llm_provider = $3', 'llm_model = $4',
        'persona = $5', 'is_house_agent = true', "status = 'active'", 'is_claimed = true',
        'is_active = true', 'updated_at = NOW()',
      ];
      const params = [agent.displayName, agent.description, agent.llmProvider, agent.llmModel, agent.persona, agent.name];

      if (domainId) {
        updates.push(`domain_id = $${params.length + 1}`);
        params.push(domainId);
      }

      await client.query(
        `UPDATE agents SET ${updates.join(', ')} WHERE name = $6`,
        params
      );
      console.log(`  Updated: ${agent.name} (${agent.llmProvider}/${agent.llmModel})`);
    } else {
      const columns = [
        'id', 'name', 'display_name', 'description', 'api_key_hash', 'status',
        'is_claimed', 'is_active', 'llm_provider', 'llm_model', 'persona',
        'is_house_agent', 'created_at', 'updated_at', 'last_active',
      ];
      const values = [
        'gen_random_uuid()', '$1', '$2', '$3', '$4', "'active'",
        'true', 'true', '$5', '$6', '$7',
        'true', 'NOW()', 'NOW()', 'NOW()',
      ];
      const params = [agent.name, agent.displayName, agent.description, apiKeyHash, agent.llmProvider, agent.llmModel, agent.persona];

      if (domainId) {
        columns.push('domain_id');
        values.push(`$${params.length + 1}`);
        params.push(domainId);
      }

      await client.query(
        `INSERT INTO agents (${columns.join(', ')}) VALUES (${values.join(', ')})`,
        params
      );
      console.log(`  Created: ${agent.name} (${agent.llmProvider}/${agent.llmModel})`);
    }
  }
}

module.exports = { seed, agents };
