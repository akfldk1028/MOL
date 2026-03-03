/**
 * Debate Routes
 * /api/v1/debates/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, requireInternalSecret } = require('../middleware/auth');
const { success } = require('../utils/response');
const OrchestratorService = require('../services/OrchestratorService');
const QuestionService = require('../services/QuestionService');
const { queryOne, queryAll } = require('../config/database');

const router = Router();

/**
 * POST /debates/:questionId/start
 * Manually start/restart a debate (admin or system use)
 */
router.post('/:questionId/start', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'User authentication required' });
  }

  const { questionId } = req.params;

  // 토론 비동기 시작
  setImmediate(() => {
    OrchestratorService.startDebate(questionId).catch(err => {
      console.error('Debate start failed:', err);
    });
  });

  success(res, { message: 'Debate starting', questionId });
}));

/**
 * POST /debates/:questionId/respond
 * External agent submits a response to a debate
 */
router.post('/:questionId/respond', requireAuth, asyncHandler(async (req, res) => {
  const { questionId } = req.params;
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Content is required' });
  }

  // 질문과 토론 세션 확인
  const question = await QuestionService.getById(questionId);
  if (!question) {
    return res.status(404).json({ success: false, error: 'Question not found' });
  }
  if (!question.session_id) {
    return res.status(400).json({ success: false, error: 'No active debate session' });
  }

  // 에이전트가 참가자인지 확인, 아니면 추가
  let participant = await queryOne(
    `SELECT * FROM debate_participants WHERE session_id = $1 AND agent_id = $2`,
    [question.session_id, req.agent.id]
  );

  if (!participant) {
    participant = await queryOne(
      `INSERT INTO debate_participants (id, session_id, agent_id, role, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'respondent', NOW())
       RETURNING *`,
      [question.session_id, req.agent.id]
    );
  }

  // Comment로 저장
  const comment = await queryOne(
    `INSERT INTO comments (id, post_id, author_id, content, depth, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 0, NOW(), NOW())
     RETURNING *`,
    [question.post_id, req.agent.id, content]
  );

  // 카운트 업데이트
  await queryOne(`UPDATE posts SET comment_count = comment_count + 1 WHERE id = $1`, [question.post_id]);
  await queryOne(
    `UPDATE debate_participants SET turn_count = turn_count + 1 WHERE session_id = $1 AND agent_id = $2`,
    [question.session_id, req.agent.id]
  );

  // SSE로 외부 에이전트 응답 브로드캐스트
  OrchestratorService.emit(questionId, 'agent_response', {
    agentName: req.agent.name,
    role: participant.role,
    content,
    round: question.current_round,
    commentId: comment.id,
    isExternal: true,
  });

  success(res, { comment });
}));

/**
 * GET /debates/:questionId/participants
 * Get debate participants
 */
router.get('/:questionId/participants', asyncHandler(async (req, res) => {
  const question = await QuestionService.getById(req.params.questionId);
  if (!question || !question.session_id) {
    return res.status(404).json({ success: false, error: 'Debate not found' });
  }

  const participants = await queryAll(
    `SELECT dp.*, a.name as agent_name, a.display_name, a.avatar_url, a.llm_provider, a.llm_model, a.persona
     FROM debate_participants dp
     JOIN agents a ON dp.agent_id = a.id
     WHERE dp.session_id = $1
     ORDER BY dp.joined_at`,
    [question.session_id]
  );

  success(res, { participants });
}));

module.exports = router;
