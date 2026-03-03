/**
 * Node: credit-check
 * Verifies the user has remaining credits before starting a debate.
 */

const { queryOne } = require('../../config/database');
const { ForbiddenError } = require('../../utils/errors');

module.exports = {
  type: 'credit-check',
  name: 'Credit Check',
  description: 'Verify user has remaining credits',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @returns {Promise<{allowed: boolean, remaining: number}>}
   */
  async execute(ctx) {
    const user = await queryOne(
      'SELECT id, credits_remaining, tier FROM users WHERE id = $1',
      [ctx.userId]
    );

    if (!user) throw new ForbiddenError('User not found');

    const allowed = user.credits_remaining > 0 || user.tier !== 'free';
    if (!allowed) {
      throw new ForbiddenError('No credits remaining. Upgrade to Pro for more questions.');
    }

    return { allowed, remaining: user.credits_remaining };
  },
};
