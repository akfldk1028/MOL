const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const AdoptionService = require('../services/AdoptionService');

const router = Router();

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

module.exports = router;
