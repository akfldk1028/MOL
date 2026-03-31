const { Router } = require('express');
const store = require('../config/memory-store');
const { forceSync } = require('../config/memory-sync');

const router = Router();

// GET /api/v1/cache/status
router.get('/status', (req, res) => {
  res.json({ success: true, data: store.getStats() });
});

// GET /api/v1/cache/agent/:agentId
router.get('/agent/:agentId', (req, res) => {
  res.json({ success: true, data: store.getAgentState(req.params.agentId) });
});

// POST /api/v1/cache/flush (admin only)
router.post('/flush', async (req, res, next) => {
  try {
    if (req.headers['x-internal-secret'] !== process.env.INTERNAL_API_SECRET) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const stats = await forceSync();
    res.json({ success: true, message: 'Synced to DB', data: stats });
  } catch (err) { next(err); }
});

// POST /api/v1/cache/reset (admin only)
router.post('/reset', (req, res) => {
  if (req.headers['x-internal-secret'] !== process.env.INTERNAL_API_SECRET) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const { agentId } = req.body || {};
  if (agentId) {
    store.resetAgent(agentId);
    res.json({ success: true, message: `Agent ${agentId} cache reset` });
  } else {
    store.resetAll();
    res.json({ success: true, message: 'All cache reset' });
  }
});

module.exports = router;
