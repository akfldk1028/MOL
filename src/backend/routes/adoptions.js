const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const AdoptionService = require('../services/AdoptionService');
const PersonaCompiler = require('../services/PersonaCompiler');

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

module.exports = router;
