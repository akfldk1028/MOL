/**
 * Question Service
 * Handles question creation, retrieval, and lifecycle management
 */

const { queryOne, queryAll, transaction } = require('../config/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');

class QuestionService {
  /**
   * Create a new question (creates Post + Question + DebateSession in a transaction)
   */
  static async create({ userId, title, content, topics = [], complexity = 'medium', submolt = 'questions', domainSlug = 'general' }) {
    if (!title || title.trim().length === 0) {
      throw new BadRequestError('Title is required');
    }
    if (title.length > 300) {
      throw new BadRequestError('Title must be 300 characters or less');
    }

    return transaction(async (client) => {
      // 사용자 크레딧 확인
      const user = await client.query(
        'SELECT id, credits_remaining, tier FROM users WHERE id = $1',
        [userId]
      );
      if (!user.rows[0]) throw new NotFoundError('User not found');
      if (user.rows[0].credits_remaining <= 0 && user.rows[0].tier === 'free') {
        throw new ForbiddenError('No credits remaining. Upgrade to Pro for more questions.');
      }

      // 하우스 에이전트(질문 작성용) 찾기 또는 기본 에이전트 사용
      const houseAgent = await client.query(
        `SELECT id FROM agents WHERE is_house_agent = true LIMIT 1`
      );
      const authorId = houseAgent.rows[0]?.id;
      if (!authorId) {
        throw new BadRequestError('System agents not initialized. Please run seed script.');
      }

      // Submolt 확인 또는 생성
      let submoltRow = await client.query(
        'SELECT id FROM submolts WHERE name = $1', [submolt]
      );
      if (!submoltRow.rows[0]) {
        // 'questions' submolt 자동 생성
        submoltRow = await client.query(
          `INSERT INTO submolts (id, name, display_name, description, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, 'Q&A', 'AI agent Q&A discussions', NOW(), NOW())
           RETURNING id`,
          [submolt]
        );
      }
      const submoltId = submoltRow.rows[0].id;

      // Post 생성
      const post = await client.query(
        `INSERT INTO posts (id, author_id, submolt_id, submolt, title, content, post_type, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'question', NOW(), NOW())
         RETURNING *`,
        [authorId, submoltId, submolt, title, content || '']
      );

      // Question 생성 (with domain)
      const question = await client.query(
        `INSERT INTO questions (id, post_id, asked_by_user_id, status, question_type, topics, complexity, domain_slug, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'open', 'general', $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [post.rows[0].id, userId, topics, complexity, domainSlug]
      );

      // DebateSession 생성
      const maxRounds = complexity === 'simple' ? 3 : complexity === 'complex' ? 7 : 5;
      const debateSession = await client.query(
        `INSERT INTO debate_sessions (id, question_id, status, max_rounds, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'recruiting', $2, NOW(), NOW())
         RETURNING *`,
        [question.rows[0].id, maxRounds]
      );

      // 크레딧 차감
      await client.query(
        'UPDATE users SET credits_remaining = credits_remaining - 1, question_count = question_count + 1 WHERE id = $1',
        [userId]
      );

      return {
        question: question.rows[0],
        post: post.rows[0],
        debateSession: debateSession.rows[0],
      };
    });
  }

  /**
   * Get question by ID with debate session info
   */
  static async getById(questionId) {
    const question = await queryOne(
      `SELECT q.*,
              p.title, p.content, p.score, p.comment_count, p.created_at as post_created_at,
              u.name as asked_by_name, u.avatar_url as asked_by_avatar,
              ds.id as session_id, ds.status as debate_status, ds.round_count, ds.max_rounds, ds.current_round
       FROM questions q
       JOIN posts p ON q.post_id = p.id
       JOIN users u ON q.asked_by_user_id = u.id
       LEFT JOIN debate_sessions ds ON ds.question_id = q.id
       WHERE q.id = $1`,
      [questionId]
    );

    if (!question) throw new NotFoundError('Question not found');

    // 토론 참가자 정보
    if (question.session_id) {
      const participants = await queryAll(
        `SELECT dp.*, a.name as agent_name, a.display_name, a.avatar_url, a.llm_provider, a.llm_model, a.persona
         FROM debate_participants dp
         JOIN agents a ON dp.agent_id = a.id
         WHERE dp.session_id = $1
         ORDER BY dp.joined_at`,
        [question.session_id]
      );
      question.participants = participants;
    }

    return question;
  }

  /**
   * Get question by post ID
   */
  static async getByPostId(postId) {
    return queryOne(
      `SELECT q.*, ds.id as session_id, ds.status as debate_status, ds.current_round, ds.max_rounds
       FROM questions q
       LEFT JOIN debate_sessions ds ON ds.question_id = q.id
       WHERE q.post_id = $1`,
      [postId]
    );
  }

  /**
   * List questions with pagination
   */
  static async list({ status, limit = 25, offset = 0, sort = 'new' }) {
    let orderBy = 'q.created_at DESC';
    if (sort === 'active') orderBy = 'ds.updated_at DESC NULLS LAST';
    if (sort === 'top') orderBy = 'p.score DESC';

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      whereClause += ` AND q.status = $${params.length}`;
    }

    params.push(limit, offset);

    const questions = await queryAll(
      `SELECT q.*,
              p.title, p.score, p.comment_count,
              u.name as asked_by_name, u.avatar_url as asked_by_avatar,
              ds.status as debate_status, ds.current_round, ds.max_rounds,
              (SELECT COUNT(*) FROM debate_participants dp WHERE dp.session_id = ds.id) as participant_count
       FROM questions q
       JOIN posts p ON q.post_id = p.id
       JOIN users u ON q.asked_by_user_id = u.id
       LEFT JOIN debate_sessions ds ON ds.question_id = q.id
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return questions;
  }

  /**
   * Accept an answer (by question asker)
   */
  static async acceptAnswer(questionId, commentId, userId) {
    const question = await queryOne(
      'SELECT * FROM questions WHERE id = $1', [questionId]
    );
    if (!question) throw new NotFoundError('Question not found');
    if (question.asked_by_user_id !== userId) {
      throw new ForbiddenError('Only the question asker can accept an answer');
    }

    return queryOne(
      `UPDATE questions SET accepted_answer_id = $1, status = 'answered', answered_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [commentId, questionId]
    );
  }

  /**
   * Update question status
   */
  static async updateStatus(questionId, status) {
    return queryOne(
      `UPDATE questions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, questionId]
    );
  }

  /**
   * Get debate responses (comments) for a question
   */
  static async getDebateResponses(questionId) {
    const question = await queryOne(
      'SELECT post_id FROM questions WHERE id = $1', [questionId]
    );
    if (!question) throw new NotFoundError('Question not found');

    return queryAll(
      `SELECT c.*, a.name as agent_name, a.display_name, a.avatar_url, a.llm_provider, a.llm_model,
              dp.role as debate_role
       FROM comments c
       JOIN agents a ON c.author_id = a.id
       LEFT JOIN debate_sessions ds ON ds.question_id = $1
       LEFT JOIN debate_participants dp ON dp.session_id = ds.id AND dp.agent_id = c.author_id
       WHERE c.post_id = $2 AND c.is_deleted = false
       ORDER BY c.created_at ASC`,
      [questionId, question.post_id]
    );
  }
}

module.exports = QuestionService;
