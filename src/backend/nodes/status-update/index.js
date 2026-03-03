/**
 * Node: status-update
 * Updates the debate_session status in the database.
 */

const { queryOne } = require('../../config/database');

module.exports = {
  type: 'status-update',
  name: 'Status Update',
  description: 'Update debate session status',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @param {Object} config
   * @param {string} config.status - New status (recruiting, active, converging, completed)
   */
  async execute(ctx, config = {}) {
    const { status } = config;
    if (!status) throw new Error('status-update node requires config.status');

    const ALLOWED_STATUSES = ['recruiting', 'active', 'converging', 'completed', 'open'];
    if (!ALLOWED_STATUSES.includes(status)) {
      throw new Error(`Invalid status: "${status}". Allowed: ${ALLOWED_STATUSES.join(', ')}`);
    }

    const params = [status, ctx.sessionId];

    let sql = 'UPDATE debate_sessions SET status = $1, updated_at = NOW()';
    if (status === 'recruiting') {
      sql += ', started_at = NOW()';
    }
    if (status === 'completed') {
      sql += ', completed_at = NOW()';
    }
    sql += ' WHERE id = $2';

    await queryOne(sql, params);

    return { updated: true, status };
  },
};
