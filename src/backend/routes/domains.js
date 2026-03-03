/**
 * Domain Routes
 * /api/v1/domains/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { success } = require('../utils/response');
const DomainService = require('../services/DomainService');

const router = Router();

/**
 * GET /domains
 * List all available domains
 */
router.get('/', asyncHandler(async (req, res) => {
  const domains = await DomainService.list();
  success(res, { domains });
}));

/**
 * GET /domains/:slug
 * Get domain detail with agents
 */
router.get('/:slug', asyncHandler(async (req, res) => {
  const domain = await DomainService.getBySlug(req.params.slug);
  if (!domain) {
    return res.status(404).json({ success: false, error: 'Domain not found' });
  }
  success(res, { domain });
}));

module.exports = router;
