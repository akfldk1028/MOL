/**
 * Agent Select Strategy: Domain-based
 * Selects agents from a specific domain's agent pool.
 * Falls back to complexity strategy if domain agents not found in DB.
 */

const { queryOne, queryAll } = require('../../../config/database');
const DomainRegistry = require('../../../domains');

module.exports = {
  /**
   * @param {import('../../../engine/WorkflowContext')} ctx
   * @returns {Promise<Object[]>} Selected agents with roles
   */
  async select(ctx) {
    const domainSlug = ctx.domainSlug || ctx.question.domain_slug || 'general';
    const domain = DomainRegistry.get(domainSlug);

    if (!domain) {
      throw new Error(`Domain "${domainSlug}" not found`);
    }

    const complexity = ctx.question.complexity || 'medium';

    // Get agent names from domain definition
    const agentNames = domain.agents.map(a => a.name);

    // Agent count by complexity (same logic as complexity strategy)
    let agentCount;
    if (complexity === 'simple') agentCount = 3; // min 2 + synthesizer
    else if (complexity === 'complex') agentCount = agentNames.length;
    else agentCount = Math.min(4, agentNames.length);

    // Build role map from domain definition
    const roleMap = {};
    for (const agentDef of domain.agents) {
      roleMap[agentDef.name] = agentDef.role || 'respondent';
    }

    // Find the synthesizer agent
    const synthesizerDef = domain.agents.find(a => a.role === 'synthesizer');
    const synthesizerName = synthesizerDef?.name;

    // Select agents: always include synthesizer if exists, then fill by priority
    let selectedNames = [];
    if (synthesizerName) selectedNames.push(synthesizerName);

    // Add other agents up to count
    for (const name of agentNames) {
      if (selectedNames.length >= agentCount) break;
      if (!selectedNames.includes(name)) selectedNames.push(name);
    }

    // Fetch from DB
    const placeholders = selectedNames.map((_, i) => `$${i + 1}`).join(',');
    const agents = await queryAll(
      `SELECT * FROM agents WHERE name IN (${placeholders}) AND is_house_agent = true`,
      selectedNames
    );

    // If domain agents not in DB yet, fall back to finding them by domain_id
    if (agents.length === 0) {
      const domainAgents = await queryAll(
        `SELECT * FROM agents WHERE is_house_agent = true ORDER BY created_at LIMIT $1`,
        [agentCount]
      );
      if (domainAgents.length > 0) {
        for (const agent of domainAgents) {
          agent.role = roleMap[agent.name] || 'respondent';
          await queryOne(
            `INSERT INTO debate_participants (id, session_id, agent_id, role, joined_at)
             VALUES (gen_random_uuid(), $1, $2, $3, NOW())
             ON CONFLICT (session_id, agent_id) DO NOTHING`,
            [ctx.sessionId, agent.id, agent.role]
          );
        }
        return domainAgents;
      }
    }

    // Create DebateParticipant records
    for (const agent of agents) {
      const role = roleMap[agent.name] || 'respondent';
      await queryOne(
        `INSERT INTO debate_participants (id, session_id, agent_id, role, joined_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW())
         ON CONFLICT (session_id, agent_id) DO NOTHING`,
        [ctx.sessionId, agent.id, role]
      );
      agent.role = role;
    }

    return agents;
  },
};
