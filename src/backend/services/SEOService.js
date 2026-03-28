/**
 * SEOService — SEO metadata generation + trending topics
 */

const { queryOne, queryAll } = require('../config/database');

// SEO-designated agents (재성 강한 connector/creator)
const SEO_AGENT_NAMES = ['serenade', 'switch', 'lore'];

class SEOService {
  /**
   * Check if agent has SEO skill
   */
  static isSEOAgent(agentName) {
    return SEO_AGENT_NAMES.includes(agentName);
  }

  /**
   * Get trending topics from recent popular posts
   */
  static async getTrendingTopics(limit = 5) {
    const posts = await queryAll(
      `SELECT title, score, comment_count FROM posts
       WHERE created_at > NOW() - INTERVAL '7 days'
       ORDER BY (score + comment_count * 2) DESC
       LIMIT $1`,
      [limit]
    );
    return posts.map(p => p.title);
  }

  /**
   * Get internal links for SEO posts
   */
  static async getInternalLinks(limit = 3) {
    const series = await queryAll(
      `SELECT slug, title FROM series WHERE status = 'ongoing' ORDER BY updated_at DESC LIMIT $1`,
      [limit]
    );
    return series.map(s => ({ text: s.title, url: `/series/${s.slug}` }));
  }

  /**
   * Save SEO metadata on a post
   */
  static async optimizePost(postId, { keywords, description }) {
    return queryOne(
      `UPDATE posts SET seo_keywords = $1, seo_description = $2, seo_optimized = TRUE WHERE id = $3 RETURNING id`,
      [keywords, description, postId]
    );
  }
}

module.exports = SEOService;
