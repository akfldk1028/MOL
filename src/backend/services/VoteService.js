/**
 * Vote Service
 * Handles upvotes, downvotes, and karma calculations
 */

const { queryOne, queryAll, transaction } = require('../config/database');
const { BadRequestError, NotFoundError } = require('../utils/errors');

const VOTE_UP = 1;
const VOTE_DOWN = -1;

class VoteService {
  /**
   * Upvote a post
   * 
   * @param {string} postId - Post ID
   * @param {string} agentId - Voting agent ID
   * @returns {Promise<Object>} Vote result
   */
  static async upvotePost(postId, agentId) {
    return this.vote({
      targetId: postId,
      targetType: 'post',
      agentId,
      value: VOTE_UP
    });
  }
  
  /**
   * Downvote a post
   * 
   * @param {string} postId - Post ID
   * @param {string} agentId - Voting agent ID
   * @returns {Promise<Object>} Vote result
   */
  static async downvotePost(postId, agentId) {
    return this.vote({
      targetId: postId,
      targetType: 'post',
      agentId,
      value: VOTE_DOWN
    });
  }
  
  /**
   * Upvote a comment
   * 
   * @param {string} commentId - Comment ID
   * @param {string} agentId - Voting agent ID
   * @returns {Promise<Object>} Vote result
   */
  static async upvoteComment(commentId, agentId) {
    return this.vote({
      targetId: commentId,
      targetType: 'comment',
      agentId,
      value: VOTE_UP
    });
  }
  
  /**
   * Downvote a comment
   * 
   * @param {string} commentId - Comment ID
   * @param {string} agentId - Voting agent ID
   * @returns {Promise<Object>} Vote result
   */
  static async downvoteComment(commentId, agentId) {
    return this.vote({
      targetId: commentId,
      targetType: 'comment',
      agentId,
      value: VOTE_DOWN
    });
  }
  
  /**
   * Internal vote logic
   * 
   * @param {Object} params - Vote parameters
   * @returns {Promise<Object>} Vote result
   */
  static async vote({ targetId, targetType, agentId, value }) {
    // Get target info (outside transaction for early validation)
    const target = await this.getTarget(targetId, targetType);

    // Prevent self-voting
    if (target.author_id === agentId) {
      throw new BadRequestError('Cannot vote on your own content');
    }

    const scoreCol = targetType === 'post' ? 'score' : 'score';
    const targetTable = targetType === 'post' ? 'posts' : 'comments';

    // Entire vote operation in a single transaction to prevent race conditions
    const result = await transaction(async (client) => {
      // Lock the existing vote row (if any) with FOR UPDATE
      const existingRes = await client.query(
        'SELECT id, value FROM votes WHERE agent_id = $1 AND target_id = $2 AND target_type = $3 FOR UPDATE',
        [agentId, targetId, targetType]
      );
      const existingVote = existingRes.rows[0] || null;

      let action;
      let scoreDelta;

      if (existingVote) {
        if (existingVote.value === value) {
          action = 'removed';
          scoreDelta = -value;
          await client.query('DELETE FROM votes WHERE id = $1', [existingVote.id]);
        } else {
          action = 'changed';
          scoreDelta = value * 2;
          await client.query('UPDATE votes SET value = $2 WHERE id = $1', [existingVote.id, value]);
        }
      } else {
        action = value === VOTE_UP ? 'upvoted' : 'downvoted';
        scoreDelta = value;
        await client.query(
          'INSERT INTO votes (id, agent_id, target_id, target_type, value) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
          [agentId, targetId, targetType, value]
        );
      }

      // Update target score atomically
      await client.query(
        `UPDATE ${targetTable} SET ${scoreCol} = ${scoreCol} + $2 WHERE id = $1`,
        [targetId, scoreDelta]
      );

      // Update author karma atomically
      await client.query(
        'UPDATE agents SET karma = GREATEST(karma + $2, 0) WHERE id = $1',
        [target.author_id, scoreDelta]
      );

      return { action };
    });

    return {
      success: true,
      message: result.action === 'upvoted' ? 'Upvoted!' :
               result.action === 'downvoted' ? 'Downvoted!' :
               result.action === 'removed' ? 'Vote removed!' : 'Vote changed!',
      action: result.action,
    };
  }
  
  /**
   * Get target (post or comment) info
   * 
   * @param {string} targetId - Target ID
   * @param {string} targetType - Target type
   * @returns {Promise<Object>} Target with author_id
   */
  static async getTarget(targetId, targetType) {
    let target;
    
    if (targetType === 'post') {
      target = await queryOne(
        'SELECT id, author_id FROM posts WHERE id = $1',
        [targetId]
      );
    } else if (targetType === 'comment') {
      target = await queryOne(
        'SELECT id, author_id FROM comments WHERE id = $1',
        [targetId]
      );
    } else {
      throw new BadRequestError('Invalid target type');
    }
    
    if (!target) {
      throw new NotFoundError(targetType === 'post' ? 'Post' : 'Comment');
    }
    
    return target;
  }
  
  /**
   * Get agent's vote on a target
   * 
   * @param {string} agentId - Agent ID
   * @param {string} targetId - Target ID
   * @param {string} targetType - Target type
   * @returns {Promise<number|null>} Vote value or null
   */
  static async getVote(agentId, targetId, targetType) {
    const vote = await queryOne(
      'SELECT value FROM votes WHERE agent_id = $1 AND target_id = $2 AND target_type = $3',
      [agentId, targetId, targetType]
    );
    
    return vote?.value || null;
  }
  
  /**
   * Get multiple votes (batch)
   * 
   * @param {string} agentId - Agent ID
   * @param {Array} targets - Array of { targetId, targetType }
   * @returns {Promise<Map>} Map of targetId -> vote value
   */
  static async getVotes(agentId, targets) {
    if (targets.length === 0) return new Map();
    
    const postIds = targets.filter(t => t.targetType === 'post').map(t => t.targetId);
    const commentIds = targets.filter(t => t.targetType === 'comment').map(t => t.targetId);
    
    const results = new Map();
    
    if (postIds.length > 0) {
      const votes = await queryAll(
        `SELECT target_id, value FROM votes 
         WHERE agent_id = $1 AND target_type = 'post' AND target_id = ANY($2)`,
        [agentId, postIds]
      );
      votes.forEach(v => results.set(v.target_id, v.value));
    }
    
    if (commentIds.length > 0) {
      const votes = await queryAll(
        `SELECT target_id, value FROM votes 
         WHERE agent_id = $1 AND target_type = 'comment' AND target_id = ANY($2)`,
        [agentId, commentIds]
      );
      votes.forEach(v => results.set(v.target_id, v.value));
    }
    
    return results;
  }
}

module.exports = VoteService;
