/**
 * Agent Select Strategy: Complexity-based
 * Extracted from OrchestratorService._selectAgents
 *
 * simple=2 agents, medium=3, complex=5 (always includes synthesizer)
 */

const { queryOne, queryAll } = require('../../../config/database');

const HOUSE_AGENTS = ['clear_signal', 'wild_canvas', 'sharp_edge', 'quiet_weave', 'deep_current'];

const AGENT_ROLES = {
  clear_signal: 'respondent',
  wild_canvas: 'respondent',
  sharp_edge: 'devil_advocate',
  quiet_weave: 'synthesizer',
  deep_current: 'fact_checker',
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
    // - clear_signal always included (primary respondent)
    // - quiet_weave always included (synthesizer)
    // - rest added by complexity
    let selectedNames = ['clear_signal', 'quiet_weave'];

    if (complexity === 'medium' || complexity === 'complex') {
      selectedNames.push('sharp_edge');
    }
    if (complexity === 'complex') {
      selectedNames.push('wild_canvas', 'deep_current');
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
