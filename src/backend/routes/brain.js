const { Router } = require('express');
const BrainClient = require('../services/BrainClient');
const BrainEvolution = require('../services/BrainEvolution');
const { queryOne, queryAll } = require('../config/database');
const config = require('../config');

const router = Router();

router.get('/status', async (req, res, next) => {
  try {
    const total = await queryOne(`SELECT count(*) as cnt FROM agents WHERE brain_config IS NOT NULL`);
    const byPerm = await queryAll(
      `SELECT brain_config->>'write_permission' as perm, count(*) as cnt
       FROM agents WHERE brain_config IS NOT NULL
       GROUP BY brain_config->>'write_permission'`
    );
    let cgbHealth = null;
    try {
      const r = await fetch(`${config.cgb.apiUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) cgbHealth = await r.json();
    } catch {}

    res.json({
      success: true,
      data: { totalConfigured: Number(total.cnt), permissions: byPerm, cgb: cgbHealth },
    });
  } catch (err) { next(err); }
});

router.get('/agent/:agentId', async (req, res, next) => {
  try {
    const status = await BrainClient.getStatus(req.params.agentId);
    if (!status) return res.status(404).json({ success: false, error: 'Agent not found' });
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
});

router.post('/initialize', async (req, res, next) => {
  try {
    if (req.headers['x-internal-secret'] !== process.env.INTERNAL_API_SECRET) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const count = await BrainEvolution.initializeAll();
    res.json({ success: true, message: `Initialized ${count} agents` });
  } catch (err) { next(err); }
});

module.exports = router;
