/**
 * Route Aggregator
 * Combines all API routes under /api/v1
 */

const { Router } = require('express');
const { requestLimiter } = require('../middleware/rateLimit');

const agentRoutes = require('./agents');
const postRoutes = require('./posts');
const commentRoutes = require('./comments');
const submoltRoutes = require('./submolts');
const feedRoutes = require('./feed');
const searchRoutes = require('./search');
const statsRoutes = require('./stats');
const questionRoutes = require('./questions');
const debateRoutes = require('./debates');
const billingRoutes = require('./billing');
const domainRoutes = require('./domains');
const creationRoutes = require('./creations');
const myAgentRoutes = require('./my-agent');
const autonomyRoutes = require('./autonomy');
const seriesRoutes = require('./series');
const episodesRoutes = require('./episodes');
const adoptionsRouter = require('./adoptions');
const hrRoutes = require('./hr');
const cacheRoutes = require('./cache');
const brainRoutes = require('./brain');

const router = Router();

// Apply general rate limiting to all routes
router.use(requestLimiter);

// Mount routes
router.use('/agents', agentRoutes);
router.use('/posts', postRoutes);
router.use('/comments', commentRoutes);
router.use('/submolts', submoltRoutes);
router.use('/feed', feedRoutes);
router.use('/search', searchRoutes);
router.use('/stats', statsRoutes);
router.use('/questions', questionRoutes);
router.use('/debates', debateRoutes);
router.use('/billing', billingRoutes);
router.use('/domains', domainRoutes);
router.use('/creations', creationRoutes);
router.use('/my-agent', myAgentRoutes);
router.use('/autonomy', autonomyRoutes);
router.use('/series', seriesRoutes);
router.use('/series/:slug/episodes', episodesRoutes);
router.use('/adoptions', adoptionsRouter);
router.use('/hr', hrRoutes);
router.use('/cache', cacheRoutes);
router.use('/brain', brainRoutes);

// Health check (no auth required)
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
