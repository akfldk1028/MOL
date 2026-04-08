/**
 * Story API Routes — StoryWriter pipeline + text ingestion
 *
 * POST /api/v1/story/generate       — Generate episode via 4-agent pipeline
 * POST /api/v1/story/ingest         — Ingest reference text into CGB
 * GET  /api/v1/story/archive/search — Search archive.org for reference texts
 */

const { Router } = require('express');
const { StoryOrchestrator, TextIngestionService } = require('../services/story');
const { bridgeGenerateWithFallback } = require('../services/BridgeClient');
const BrainClient = require('../services/BrainClient');

const router = Router();

// I1: Auth middleware — require internal secret for expensive pipeline calls
function requireInternalAuth(req, res, next) {
  const secret = req.headers['x-internal-secret'];
  if (secret && secret === process.env.INTERNAL_API_SECRET) return next();
  // Also allow authenticated users (Supabase JWT)
  if (req.user?.id) return next();
  return res.status(401).json({ error: 'Authentication required' });
}

// I2: Input size limit for text ingestion
const MAX_TEXT_LENGTH = 500_000; // 500KB

/**
 * POST /api/v1/story/generate
 * Body: { seriesId, agentId, genre, targetWordCount, maxEvalRetries }
 */
router.post('/generate', requireInternalAuth, async (req, res) => {
  try {
    const { seriesId, agentId, genre, targetWordCount, maxEvalRetries } = req.body;

    if (!seriesId) return res.status(400).json({ error: 'seriesId required' });

    const { queryOne, queryAll } = require('../config/database');
    const series = await queryOne(`SELECT * FROM series WHERE id = $1`, [seriesId]);
    if (!series) return res.status(404).json({ error: 'Series not found' });

    const EpisodeService = require('../services/EpisodeService');
    const episodeNumber = await EpisodeService.getNextNumber(seriesId);
    const previousEpisodes = await EpisodeService.getRecentWithFeedback(seriesId, 3);

    // LLM call function using existing BridgeClient
    const llmCall = async (system, user, opts = {}) => {
      const response = await bridgeGenerateWithFallback(
        '/v1/generate/episode',
        { agent_name: 'story-pipeline', prompt: user, max_tokens: opts.maxOutputTokens || 4096 },
        { model: opts.model || 'qwen3.5-flash', systemPrompt: system, userPrompt: user, options: { maxOutputTokens: opts.maxOutputTokens || 4096 } },
        opts.timeout || 90000,
      );
      return response || '';
    };

    // CGB brain context
    const getBrainContext = agentId
      ? async (topic) => {
          const result = await BrainClient.research(agentId, topic);
          return result?.graphContext || [];
        }
      : null;

    const story = new StoryOrchestrator({
      genre: genre || series.genre || 'romance',
      language: 'ko',
      targetWordCount: targetWordCount || series.target_word_count || 3000,
      maxEvalRetries: maxEvalRetries || 2,
      llmCall,
      getBrainContext,
    });

    const result = await story.generateEpisode({
      series,
      agentId,
      episodeNumber,
      previousEpisodes: previousEpisodes.reverse(),
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error, trajectory: result.trajectory });
    }

    // Save episode to DB
    const episode = await EpisodeService.create({
      seriesId: series.id,
      agentId: agentId || series.created_by_agent_id,
      title: result.episode.title,
      scriptContent: result.episode.content,
      pageImageUrls: [],
      wordCount: result.episode.wordCount,
    });

    res.json({
      success: true,
      episode: { id: episode.id, title: episode.title, wordCount: result.episode.wordCount, episodeNumber },
      evaluation: result.evaluation,
      writeAttempts: result.writeAttempts,
      durationMs: result.durationMs,
    });
  } catch (err) {
    console.error('[Story API] generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/v1/story/ingest
 * Body: { text, title, author, genre, agentId }
 */
router.post('/ingest', requireInternalAuth, async (req, res) => {
  try {
    const { text, title, author, genre, category, agentId } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });
    if (text.length > MAX_TEXT_LENGTH) return res.status(400).json({ error: `Text too large (max ${MAX_TEXT_LENGTH} chars)` });

    const llmCall = async (system, user, opts = {}) => {
      const response = await bridgeGenerateWithFallback(
        '/v1/generate/comment',
        { agent_name: 'ingestion', prompt: user, max_tokens: 1024 },
        { model: 'qwen-turbo', systemPrompt: system, userPrompt: user, options: { maxOutputTokens: 1024 } },
        30000,
      );
      return response || '';
    };

    const service = new TextIngestionService({ llmCall, agentId });
    const result = await service.ingest(text, { title, author, genre, category, source: 'upload' });

    res.json(result);
  } catch (err) {
    console.error('[Story API] ingest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/story/archive/search?q=korean+novel&limit=5
 */
router.get('/archive/search', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q) return res.status(400).json({ error: 'q (query) required' });
    const results = await TextIngestionService.searchArchive(q, parseInt(limit) || 5);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
