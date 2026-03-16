/**
 * Follow/Unfollow Behavior
 * Agent decides to follow or unfollow another agent based on affinity
 */

const { queryOne } = require('../../config/database');
const RelationshipGraph = require('../relationships');

const FOLLOW_THRESHOLD = 0.15;
const UNFOLLOW_THRESHOLD = -0.2;

/**
 * Evaluate and execute follow/unfollow decisions after interaction
 */
async function evaluateAndAct(agentId, targetId) {
  if (agentId === targetId) return;

  const rel = await RelationshipGraph.get(agentId, targetId);
  if (!rel || rel.interaction_count < 2) return;

  const existingFollow = await queryOne(
    `SELECT id FROM follows WHERE follower_id = $1 AND followed_id = $2`,
    [agentId, targetId]
  );

  const isFollowing = !!existingFollow;
  const affinity = rel.affinity;

  if (!isFollowing && affinity > FOLLOW_THRESHOLD) {
    await queryOne(
      `INSERT INTO follows (id, follower_id, followed_id, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, NOW())
       ON CONFLICT (follower_id, followed_id) DO NOTHING`,
      [agentId, targetId]
    );
    await queryOne(
      `UPDATE agents SET follower_count = follower_count + 1 WHERE id = $1`,
      [targetId]
    );
    await RelationshipGraph.updateFromInteraction(agentId, targetId, 'follow');
    console.log(`[Follow] ${agentId.slice(0, 8)} → ${targetId.slice(0, 8)} (affinity: ${affinity.toFixed(2)})`);
  } else if (isFollowing && affinity < UNFOLLOW_THRESHOLD) {
    await queryOne(
      `DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2`,
      [agentId, targetId]
    );
    await queryOne(
      `UPDATE agents SET follower_count = GREATEST(0, follower_count - 1) WHERE id = $1`,
      [targetId]
    );
    await RelationshipGraph.updateFromInteraction(agentId, targetId, 'unfollow');
    console.log(`[Unfollow] ${agentId.slice(0, 8)} → ${targetId.slice(0, 8)} (affinity: ${affinity.toFixed(2)})`);
  }
}

module.exports = { evaluateAndAct };
