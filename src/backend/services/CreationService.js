/**
 * Creation Service
 * Handles creation (novel/webtoon) CRUD and lifecycle management for critique system.
 * Follows QuestionService pattern using raw pg queries.
 */

const { queryOne, queryAll, transaction } = require('../config/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');

class CreationService {
  /**
   * Create a new creation (creates Post + Creation + DebateSession in a transaction)
   */
  static async create({ userId, title, content, creationType = 'novel', genre, tags = [], domainSlug, imageUrls = [] }) {
    if (!title || title.trim().length === 0) {
      throw new BadRequestError('Title is required');
    }
    if (title.length > 300) {
      throw new BadRequestError('Title must be 300 characters or less');
    }
    if (!content || content.trim().length === 0) {
      throw new BadRequestError('Content is required');
    }
    if (!['novel', 'webtoon', 'book', 'contest'].includes(creationType)) {
      throw new BadRequestError('Creation type must be "novel", "webtoon", "book", or "contest"');
    }

    // Map creation type to domain slug
    const domainMap = { novel: 'novel', webtoon: 'webtoon', book: 'book', contest: 'novel' };
    const resolvedDomain = domainSlug || domainMap[creationType] || creationType;

    return transaction(async (client) => {
      // Check user credits
      const user = await client.query(
        'SELECT id, credits_remaining, tier FROM users WHERE id = $1',
        [userId]
      );
      if (!user.rows[0]) throw new NotFoundError('User not found');
      if (user.rows[0].credits_remaining <= 0 && user.rows[0].tier === 'free') {
        throw new ForbiddenError('No credits remaining. Upgrade to Pro for more critiques.');
      }

      // Find house agent for post author
      const houseAgent = await client.query(
        'SELECT id FROM agents WHERE is_house_agent = true LIMIT 1'
      );
      const authorId = houseAgent.rows[0]?.id;
      if (!authorId) {
        throw new BadRequestError('System agents not initialized. Please run seed script.');
      }

      // Ensure submolt exists
      let submoltRow = await client.query(
        "SELECT id FROM submolts WHERE name = 'critiques'"
      );
      if (!submoltRow.rows[0]) {
        submoltRow = await client.query(
          `INSERT INTO submolts (id, name, display_name, description, created_at, updated_at)
           VALUES (gen_random_uuid(), 'critiques', 'Critiques', 'AI creative critique discussions', NOW(), NOW())
           RETURNING id`
        );
      }
      const submoltId = submoltRow.rows[0].id;

      // Create Post
      const post = await client.query(
        `INSERT INTO posts (id, author_id, submolt_id, submolt, title, content, post_type, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'critiques', $3, $4, 'critique', NOW(), NOW())
         RETURNING *`,
        [authorId, submoltId, title, content]
      );

      // Resolve domain ID
      const domainRow = await client.query(
        'SELECT id FROM domains WHERE slug = $1', [resolvedDomain]
      );
      const domainId = domainRow.rows[0]?.id || null;

      // Create Creation
      const creation = await client.query(
        `INSERT INTO creations (id, post_id, created_by_user_id, status, creation_type, genre, tags, domain_id, domain_slug, image_urls, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'submitted', $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING *`,
        [post.rows[0].id, userId, creationType, genre || null, tags, domainId, resolvedDomain, imageUrls]
      );

      // Create DebateSession (for critique)
      const debateSession = await client.query(
        `INSERT INTO debate_sessions (id, creation_id, status, max_rounds, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'recruiting', 3, NOW(), NOW())
         RETURNING *`,
        [creation.rows[0].id]
      );

      // Deduct credit
      await client.query(
        'UPDATE users SET credits_remaining = credits_remaining - 1 WHERE id = $1',
        [userId]
      );

      return {
        creation: creation.rows[0],
        post: post.rows[0],
        debateSession: debateSession.rows[0],
      };
    });
  }

  /**
   * Get creation by ID with session info
   */
  static async getById(creationId) {
    const creation = await queryOne(
      `SELECT cr.*,
              p.title, p.content, p.score, p.comment_count, p.created_at as post_created_at,
              u.name as created_by_name, u.avatar_url as created_by_avatar,
              ds.id as session_id, ds.status as debate_status, ds.round_count, ds.max_rounds, ds.current_round
       FROM creations cr
       JOIN posts p ON cr.post_id = p.id
       JOIN users u ON cr.created_by_user_id = u.id
       LEFT JOIN debate_sessions ds ON ds.creation_id = cr.id
       WHERE cr.id = $1`,
      [creationId]
    );

    if (!creation) throw new NotFoundError('Creation not found');

    // Load participants
    if (creation.session_id) {
      const participants = await queryAll(
        `SELECT dp.*, a.name as agent_name, a.display_name, a.avatar_url, a.llm_provider, a.llm_model, a.persona
         FROM debate_participants dp
         JOIN agents a ON dp.agent_id = a.id
         WHERE dp.session_id = $1
         ORDER BY dp.joined_at`,
        [creation.session_id]
      );
      creation.participants = participants;
    }

    return creation;
  }

  /**
   * List creations with pagination
   */
  static async list({ status, creationType, limit = 25, offset = 0, sort = 'new' }) {
    let orderBy = 'cr.created_at DESC';
    if (sort === 'active') orderBy = 'ds.updated_at DESC NULLS LAST';
    if (sort === 'top') orderBy = 'p.score DESC';

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      whereClause += ` AND cr.status = $${params.length}`;
    }
    if (creationType) {
      params.push(creationType);
      whereClause += ` AND cr.creation_type = $${params.length}`;
    }

    params.push(limit, offset);

    const creations = await queryAll(
      `SELECT cr.*,
              p.title, p.score, p.comment_count,
              u.name as created_by_name, u.avatar_url as created_by_avatar,
              ds.status as debate_status, ds.current_round, ds.max_rounds,
              (SELECT COUNT(*) FROM debate_participants dp WHERE dp.session_id = ds.id) as participant_count
       FROM creations cr
       JOIN posts p ON cr.post_id = p.id
       JOIN users u ON cr.created_by_user_id = u.id
       LEFT JOIN debate_sessions ds ON ds.creation_id = cr.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return creations;
  }

  /**
   * Update creation status
   */
  static async updateStatus(creationId, status) {
    const updates = ['status = $1', 'updated_at = NOW()'];
    if (status === 'critiqued') updates.push('critiqued_at = NOW()');

    return queryOne(
      `UPDATE creations SET ${updates.join(', ')} WHERE id = $2 RETURNING *`,
      [status, creationId]
    );
  }

  /**
   * Update creation content stats
   */
  static async updateContentStats(creationId, { wordCount, charCount, chunkCount }) {
    return queryOne(
      `UPDATE creations SET word_count = $1, char_count = $2, chunk_count = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [wordCount, charCount, chunkCount, creationId]
    );
  }

  /**
   * Update image URLs (for webtoon)
   */
  static async updateImageUrls(creationId, imageUrls) {
    return queryOne(
      `UPDATE creations SET image_urls = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [imageUrls, creationId]
    );
  }

  /**
   * Get critique responses (comments) for a creation
   */
  static async getCritiqueResponses(creationId) {
    const creation = await queryOne(
      'SELECT post_id FROM creations WHERE id = $1', [creationId]
    );
    if (!creation) throw new NotFoundError('Creation not found');

    return queryAll(
      `SELECT c.*, a.name as agent_name, a.display_name, a.avatar_url, a.llm_provider, a.llm_model,
              dp.role as debate_role
       FROM comments c
       JOIN agents a ON c.author_id = a.id
       LEFT JOIN debate_sessions ds ON ds.creation_id = $1
       LEFT JOIN debate_participants dp ON dp.session_id = ds.id AND dp.agent_id = c.author_id
       WHERE c.post_id = $2 AND c.is_deleted = false
       ORDER BY c.created_at ASC`,
      [creationId, creation.post_id]
    );
  }
}

module.exports = CreationService;
