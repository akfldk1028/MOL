/**
 * Creation Routes
 * /api/v1/creations/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireInternalSecret } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const CreationService = require('../services/CreationService');
const TaskScheduler = require('../services/TaskScheduler');
const config = require('../config');
const { uploadImages, uploadPdf } = require('../middleware/upload');
const { uploadFile } = require('../utils/storage');
const { extractTextFromPdf } = require('../utils/pdf-extract');

const router = Router();

/**
 * POST /creations
 * Create a new creation for critique (requires user auth via header)
 */
router.post('/', requireInternalSecret, asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'User authentication required' });
  }

  const { title, content, creationType, genre, tags, domain, imageUrls } = req.body;

  const result = await CreationService.create({
    userId,
    title,
    content,
    creationType: creationType || 'novel',
    genre,
    tags: tags || [],
    domainSlug: domain,
    imageUrls: imageUrls || [],
  });

  // Agents discover and react via autonomous system
  setImmediate(() => {
    TaskScheduler.onPostCreated(result.post).catch(err => {
      console.error('Creation task scheduling failed:', err);
    });
  });

  created(res, {
    creation: result.creation,
    post: result.post,
  });
}));

/**
 * GET /creations
 * List creations
 */
router.get('/', asyncHandler(async (req, res) => {
  const { status, type, limit = 25, offset = 0, sort = 'new' } = req.query;

  const creations = await CreationService.list({
    status,
    creationType: type,
    limit: Math.min(parseInt(limit, 10), config.pagination.maxLimit),
    offset: parseInt(offset, 10) || 0,
    sort,
  });

  success(res, {
    creations,
    has_more: creations.length >= parseInt(limit, 10),
  });
}));

/**
 * GET /creations/:id
 * Get creation detail with critique session
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const creation = await CreationService.getById(req.params.id);
  const responses = await CreationService.getCritiqueResponses(req.params.id);

  success(res, { creation, responses });
}));

/**
 * POST /creations/upload
 * Upload images for a webtoon creation
 */
router.post('/upload', requireInternalSecret, uploadImages, asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'User authentication required' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: 'No files uploaded' });
  }

  const imageUrls = await Promise.all(req.files.map(f => uploadFile(f)));

  // If creationId provided, update the creation record
  const { creationId } = req.body;
  if (creationId) {
    await CreationService.updateImageUrls(creationId, imageUrls);
  }

  success(res, { imageUrls });
}));

/**
 * POST /creations/upload-pdf
 * Upload a PDF and extract text for book/contest analysis
 */
router.post('/upload-pdf', requireInternalSecret, uploadPdf, asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ success: false, error: 'User authentication required' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
  }

  const { text, pageCount, info } = await extractTextFromPdf(req.file.buffer);

  // Upload PDF to storage (non-fatal if it fails)
  let pdfUrl = null;
  try {
    pdfUrl = await uploadFile(req.file);
  } catch (err) {
    console.warn('PDF storage upload failed (non-fatal):', err.message);
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const charCount = text.length;

  success(res, { text, pageCount, info, pdfUrl, charCount, wordCount });
}));

/**
 * GET /creations/:id/stream
 * SSE stream for real-time critique updates
 */
router.get('/:id/stream', asyncHandler(async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ creationId: req.params.id })}\n\n`);

  // Send current status
  try {
    const creation = await CreationService.getById(req.params.id);
    res.write(`event: status\ndata: ${JSON.stringify({
      status: creation.debate_status || 'submitted',
      commentCount: creation.comment_count || 0,
    })}\n\n`);
  } catch (e) {
    // Creation may not exist yet, keep stream open
  }

  // Subscribe using creationId as channel key
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
