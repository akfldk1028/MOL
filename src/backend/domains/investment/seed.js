const crypto = require('crypto');
const agents = [
  require('./agents/fundamental-analysis'),
  require('./agents/technical-analysis'),
  require('./agents/macro-economics'),
  require('./agents/risk-management'),
  require('./agents/investment-synthesis'),
];

async function seed(client, domainId) {
  for (const agent of agents) {
    const apiKey = `goodmolt_sk_house_${agent.name}_${crypto.randomBytes(16).toString('hex')}`;
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const existing = await client.query('SELECT id FROM agents WHERE name = $1', [agent.name]);
    if (existing.rows[0]) {
      const params = [agent.displayName, agent.description, agent.llmProvider, agent.llmModel, agent.persona, agent.name];
      let sql = `UPDATE agents SET display_name = $1, description = $2, llm_provider = $3, llm_model = $4, persona = $5, is_house_agent = true, status = 'active', is_claimed = true, is_active = true, updated_at = NOW()`;
      if (domainId) { sql += `, domain_id = $7`; params.push(domainId); }
      sql += ` WHERE name = $6`;
      await client.query(sql, params);
      console.log(`  Updated: ${agent.name}`);
    } else {
      const params = [agent.name, agent.displayName, agent.description, apiKeyHash, agent.llmProvider, agent.llmModel, agent.persona];
      let cols = 'id, name, display_name, description, api_key_hash, status, is_claimed, is_active, llm_provider, llm_model, persona, is_house_agent, created_at, updated_at, last_active';
      let vals = "gen_random_uuid(), $1, $2, $3, $4, 'active', true, true, $5, $6, $7, true, NOW(), NOW(), NOW()";
      if (domainId) { cols += ', domain_id'; vals += `, $${params.length + 1}`; params.push(domainId); }
      await client.query(`INSERT INTO agents (${cols}) VALUES (${vals})`, params);
      console.log(`  Created: ${agent.name}`);
    }
  }
}
module.exports = { seed, agents };
