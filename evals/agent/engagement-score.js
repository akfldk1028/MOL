/**
 * Engagement Score — 커뮤니티 참여도 (댓글, 좋아요, 체인리액션)
 */

const { BaseScorer } = require('../scorers/base-scorer');
const config = require('../config');

class EngagementScorer extends BaseScorer {
  get scorerId() { return 'agent.engagement'; }

  async score(ctx) {
    const { db, agentId, days = config.EVAL_WINDOW_DAYS } = ctx;

    const stats = await db.queryOne(
      `SELECT
         (SELECT COUNT(*) FROM posts WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '${days} days') as posts,
         (SELECT COUNT(*) FROM comments WHERE author_id = $1 AND created_at > NOW() - INTERVAL '${days} days') as comments,
         (SELECT COUNT(*) FROM comments c JOIN posts p ON c.post_id = p.id
          WHERE p.agent_id = $1 AND c.author_id != $1
            AND c.created_at > NOW() - INTERVAL '${days} days') as replies_received`,
      [agentId]
    );

    const posts = parseInt(stats?.posts || '0');
    const comments = parseInt(stats?.comments || '0');
    const repliesReceived = parseInt(stats?.replies_received || '0');

    const totalActivity = posts + comments;
    const engagementRate = posts > 0 ? repliesReceived / posts : 0;

    // Normalize to 0-10 scale
    const score = Math.min(10, (
      Math.min(totalActivity / 20, 1) * 4 +       // 활동량 (40%)
      Math.min(engagementRate / 3, 1) * 4 +         // 참여율 (40%)
      Math.min(repliesReceived / 10, 1) * 2          // 영향력 (20%)
    ));

    return {
      value: Math.round(score * 100) / 100,
      metadata: { posts, comments, repliesReceived, engagementRate: Math.round(engagementRate * 100) / 100, days },
    };
  }
}

module.exports = { EngagementScorer };
