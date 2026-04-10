const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const { BadRequestError, NotFoundError } = require('../utils/errors');
const { queryOne } = require('../config/database');
const AdoptionService = require('../services/AdoptionService');
const PersonaCompiler = require('../services/PersonaCompiler');
const openaiCompat = require('../nodes/llm-call/providers/openai-compat');

const router = Router();

const VALID_PERSONA_FORMATS = new Set(['text', 'markdown', 'json']);

router.post('/:name', requireAuth, asyncHandler(async (req, res) => {
  const result = await AdoptionService.adopt(req.agent.id, req.params.name);
  created(res, result);
}));

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0 } = req.query;
  const agents = await AdoptionService.getMyAgents(req.agent.id, {
    limit: parseInt(limit, 10) || 20,
    offset: parseInt(offset, 10) || 0,
  });
  success(res, { agents });
}));

router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const result = await AdoptionService.remove(req.agent.id, req.params.id);
  success(res, result);
}));

/**
 * GET /adoptions/:id/persona
 * Export agent persona as system prompt
 * Query: format=text|markdown|json (default: text)
 */
router.get('/:id/persona', requireAuth, asyncHandler(async (req, res) => {
  const { format = 'text' } = req.query;

  if (!VALID_PERSONA_FORMATS.has(format)) {
    return res.status(400).json({ success: false, error: `Invalid format "${format}". Use: text, markdown, json` });
  }

  const result = await PersonaCompiler.export(req.params.id, req.agent.id, { format });

  if (format === 'json') {
    return res.json({ success: true, ...result });
  }

  if (format === 'markdown') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="persona.md"');
    return res.send(result);
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(result);
}));

/**
 * POST /adoptions/:id/chat
 * Chat with an adopted agent — runs the agent's persona through DashScope
 * and returns the agent's response.
 *
 * Body: { message: string, maxTokens?: number }
 * Response: { reply: string, model: string }
 *
 * Used by: MCP server (chat_with_agent tool), Claude Desktop, web UI
 */
router.post('/:id/chat', requireAuth, asyncHandler(async (req, res) => {
  const { message, maxTokens } = req.body || {};
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new BadRequestError('message is required');
  }
  if (message.length > 4000) {
    throw new BadRequestError('message too long (max 4000 chars)');
  }

  // Verify ownership and load persona
  const adoption = await queryOne(
    `SELECT id FROM agent_adoptions
     WHERE id = $1 AND owner_id = $2 AND is_active = true`,
    [req.params.id, req.agent.id]
  );
  if (!adoption) throw new NotFoundError('Adoption');

  const persona = await PersonaCompiler.export(req.params.id, req.agent.id, { format: 'text' });

  // Run through DashScope with persona as system prompt
  const model = process.env.DASHSCOPE_MODEL || 'qwen-turbo';
  const reply = await openaiCompat.call(model, persona, message, {
    provider: 'dashscope',
    maxOutputTokens: Math.min(parseInt(maxTokens, 10) || 1024, 2048),
  });

  if (!reply) {
    return res.status(502).json({ success: false, error: 'LLM returned empty response' });
  }

  success(res, { reply, model });
}));

module.exports = router;
