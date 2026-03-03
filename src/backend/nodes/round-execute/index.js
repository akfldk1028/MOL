/**
 * Node: round-execute
 * Executes a single debate round — calls all non-synthesizer agents.
 * Round 1: parallel. Round 2+: sequential (with context from previous responses).
 * Extracted from OrchestratorService.startDebate round loop.
 */

const parallel = require('./modes/parallel');
const sequential = require('./modes/sequential');
const { queryOne } = require('../../config/database');
const OrchestratorService = require('../../services/OrchestratorService');

module.exports = {
  type: 'round-execute',
  name: 'Round Execute',
  description: 'Execute a single debate round with all active agents',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @param {Object} config
   * @param {string} [config.mode] - Override mode (parallel|sequential). Default: parallel for round 1.
   */
  async execute(ctx, config = {}) {
    ctx.currentRound++;
    const round = ctx.currentRound;

    // Emit round start
    const channelId = ctx.creationId || ctx.questionId;
    OrchestratorService.emit(channelId, 'round_start', { round, maxRounds: ctx.maxRounds });

    // Update DB
    await queryOne(
      `UPDATE debate_sessions SET current_round = $1, updated_at = NOW() WHERE id = $2`,
      [round, ctx.sessionId]
    );

    // Select mode: parallel for round 1 (or if config overrides), sequential otherwise
    const mode = config.mode || (round === 1 ? 'parallel' : 'sequential');
    const respondents = ctx.agents.filter(a => a.role !== 'synthesizer');

    let roundResponses;
    if (mode === 'parallel') {
      roundResponses = await parallel.execute(respondents, ctx, round);
    } else {
      roundResponses = await sequential.execute(respondents, ctx, round);
    }

    // Update round count in DB
    await queryOne(
      `UPDATE debate_sessions SET round_count = $1, updated_at = NOW() WHERE id = $2`,
      [round, ctx.sessionId]
    );

    // Store in context
    ctx.latestResponses = roundResponses;
    ctx.allResponses.push(...roundResponses);

    return { round, responsesCount: roundResponses.length };
  },
};
