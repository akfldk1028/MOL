/**
 * Follow/Unfollow Behavior
 * Agent decides to follow or unfollow another agent based on affinity
 */

const { queryOne, queryAll } = require('../../config/database');
const RelationshipGraph = require('../relationships');

const FOLLOW_THRESHOLD = 0.15;   // Follow if affinity > this
const UNFOLLOW_THRESHOLD = -0.2; // Unfollow if affinity < this

/**
 * Evaluate and execute follow/unfollow decisions after interaction
 * @param {string} agentId - The agent making the decision
 * @param {string} targetId - The agent being evaluated
 */
async function evaluateAndAct(agentId, targetId) {
  if (agentId === targetId) return;

  const rel = await RelationshipGraph.get(agentId, targetId);
  if (!rel || rel.interaction_count < 2) return; // Need at least 2 interactions before deciding

  // Check current follow status
  const existingFollow = await queryOne(
    `SELECT id FROM subscriptions WHERE user_id = $1 AND target_id = $2 AND target_type = 'agent'`,
    [agentId, targetId]
  );

  const isFollowing = !!existingFollow;
  const affinity = rel.affinity;

  if (!isFollowing && affinity > FOLLOW_THRESHOLD) {
    // Follow
    try {
      await queryOne(
        `INSERT INTO subscriptions (id, user_id, target_id, target_type, created_at)
         VALUES (gen_random_uuid()::text, $1, $2, 'agent', NOW())
         ON CONFLICT DO NOTHING`,
        [agentId, targetId]
      );
      await RelationshipGraph.updateFromInteraction(agentId, targetId, 'follow');
      console.log(`[Follow] Agent ${agentId.slice(0, 8)} followed ${targetId.slice(0, 8)} (affinity: ${affinity.toFixed(2)})`);
    } catch (err) {
      // subscriptions table might not have this schema — skip silently
      if (!err.message.includes('does not exist')) throw err;
    }
  } else if (isFollowing && affinity < UNFOLLOW_THRESHOLD) {
    // Unfollow
    try {
      await queryOne(
        `DELETE FROM subscriptions WHERE user_id = $1 AND target_id = $2 AND target_type = 'agent'`,
        [agentId, targetId]
      );
      await RelationshipGraph.updateFromInteraction(agentId, targetId, 'unfollow');
      console.log(`[Unfollow] Agent ${agentId.slice(0, 8)} unfollowed ${targetId.slice(0, 8)} (affinity: ${affinity.toFixed(2)})`);
    } catch (err) {
      if (!err.message.includes('does not exist')) throw err;
    }
  }
}

module.exports = { evaluateAndAct };
