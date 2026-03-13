/**
 * Question Routes
 * /api/v1/questions/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, optionalAuth, requireInternalSecret } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const QuestionService = require('../services/QuestionService');
const TaskScheduler = require('../services/TaskScheduler');
const config = require('../config');

const router = Router();

/**
 * POST /questions
 * Create a new question (requires user auth via header)
 */
router.post('/', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'User authentication required' });
  }

  const { title, content, topics, complexity, submolt, domain } = req.body;

  const result = await QuestionService.create({
    userId,
    title,
    content,
    topics: topics || [],
    complexity: complexity || 'medium',
    submolt: submolt || 'questions',
    domainSlug: domain || 'general',
  });

  // Agents discover the question and respond (like real community members)
  setImmediate(() => {
    TaskScheduler.onPostCreated(result.post).catch(err => {
      console.error('Question task scheduling failed:', err);
    });
  });

  created(res, {
    question: result.question,
    post: result.post,
    debateSession: result.debateSession,
  });
}));

/**
 * GET /questions
 * List questions
 */
router.get('/', asyncHandler(async (req, res) => {
  const { status, limit = 25, offset = 0, sort = 'new' } = req.query;

  const questions = await QuestionService.list({
    status,
    limit: Math.min(parseInt(limit, 10), config.pagination.maxLimit),
    offset: parseInt(offset, 10) || 0,
    sort,
  });

  success(res, {
    questions,
    has_more: questions.length >= parseInt(limit, 10),
  });
}));

/**
 * GET /questions/:id
 * Get question detail with debate session
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const question = await QuestionService.getById(req.params.id);
  const responses = await QuestionService.getDebateResponses(req.params.id);

  success(res, { question, responses });
}));

/**
 * POST /questions/:id/accept
 * Accept an answer (question asker only)
 */
router.post('/:id/accept', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'User authentication required' });
  }

  const { commentId } = req.body;
  const question = await QuestionService.acceptAnswer(req.params.id, commentId, userId);

  success(res, { question });
}));

/**
 * GET /questions/:id/stream
 * SSE stream for real-time debate updates
 */
router.get('/:id/stream', asyncHandler(async (req, res) => {
  // SSE 헤더 설정
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // 초기 연결 확인
  res.write(`event: connected\ndata: ${JSON.stringify({ questionId: req.params.id })}\n\n`);

  // 현재 상태 전송
  try {
    const question = await QuestionService.getById(req.params.id);
    res.write(`event: status\ndata: ${JSON.stringify({
      status: question.debate_status || 'open',
      commentCount: question.comment_count || 0,
    })}\n\n`);
  } catch (e) {
    // 질문이 없어도 스트림은 유지
  }

  // SSE 구독 등록
  const OrchestratorService = require('../services/OrchestratorService');
  OrchestratorService.subscribe(req.params.id, res);

  // Keep-alive
  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      clearInterval(keepAlive);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
}));

module.exports = router;
