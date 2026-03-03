/**
 * Agent Select Strategy: Complexity-based
 * Extracted from OrchestratorService._selectAgents
 *
 * simple=2 agents, medium=3, complex=5 (always includes synthesizer)
 */

const { queryOne, queryAll } = require('../../../config/database');

const HOUSE_AGENTS = ['analyst', 'creative', 'critic', 'synthesizer', 'researcher'];

const AGENT_ROLES = {
  analyst: 'respondent',
  creative: 'respondent',
  critic: 'devil_advocate',
  synthesizer: 'synthesizer',
  researcher: 'fact_checker',
};

module.exports = {
  /**
   * @param {import('../../../engine/WorkflowContext')} ctx
   * @returns {Promise<Object[]>} Selected agents with roles
   */
  async select(ctx) {
    const complexity = ctx.question.complexity || 'medium';

    // Agent count by complexity
    let agentCount;
    if (complexity === 'simple') agentCount = 2;
    else if (complexity === 'complex') agentCount = 4;
    else agentCount = 3;

    // Always include synthesizer
    agentCount = Math.min(agentCount + 1, HOUSE_AGENTS.length);

    // Selection strategy:
    // - analyst always included (primary respondent)
    // - synthesizer always included (summary)
    // - rest added by complexity
    let selectedNames = ['analyst', 'synthesizer'];

    if (complexity === 'medium' || complexity === 'complex') {
      selectedNames.push('critic');
    }
    if (complexity === 'complex') {
      selectedNames.push('creative', 'researcher');
    }

    selectedNames = selectedNames.slice(0, agentCount);

    // Fetch from DB
    const placeholders = selectedNames.map((_, i) => `$${i + 1}`).join(',');
    const agents = await queryAll(
      `SELECT * FROM agents WHERE name IN (${placeholders}) AND is_house_agent = true`,
      selectedNames
    );

    // Create DebateParticipant records
    for (const agent of agents) {
      const role = AGENT_ROLES[agent.name] || 'respondent';
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
