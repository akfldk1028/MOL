/**
 * Rate limiting middleware
 *
 * Uses Upstash Redis Ratelimit when configured.
 * Falls back to in-memory storage for local development.
 */

const { Ratelimit } = require('@upstash/ratelimit');
const { getRedis } = require('../config/redis');
const config = require('../config');
const { RateLimitError } = require('../utils/errors');

// ============================================
// In-memory fallback (when Redis is unavailable)
// ============================================

const memoryStorage = new Map();

setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [key, entries] of memoryStorage.entries()) {
    const filtered = entries.filter(e => e.timestamp >= cutoff);
    if (filtered.length === 0) {
      memoryStorage.delete(key);
    } else {
      memoryStorage.set(key, filtered);
    }
  }
}, 300000);

function checkMemoryLimit(key, limit) {
  const now = Date.now();
  const windowStart = now - (limit.window * 1000);
  let entries = memoryStorage.get(key) || [];
  entries = entries.filter(e => e.timestamp >= windowStart);

  const count = entries.length;
  const allowed = count < limit.max;
  const remaining = Math.max(0, limit.max - count - (allowed ? 1 : 0));

  let resetAt;
  let retryAfter = 0;

  if (entries.length > 0) {
    const oldest = Math.min(...entries.map(e => e.timestamp));
    resetAt = new Date(oldest + (limit.window * 1000));
    retryAfter = Math.ceil((resetAt.getTime() - now) / 1000);
  } else {
    resetAt = new Date(now + (limit.window * 1000));
  }

  if (allowed) {
    entries.push({ timestamp: now });
    memoryStorage.set(key, entries);
  }

  return { allowed, remaining, limit: limit.max, resetAt, retryAfter: allowed ? 0 : retryAfter };
}

// ============================================
// Upstash Ratelimit instances (lazy init)
// ============================================

let _limiters = null;

function getLimiters() {
  if (_limiters) return _limiters;

  const redis = getRedis();
  if (!redis) return null;

  _limiters = {
    requests: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '60 s'),
      prefix: 'rl:requests',
    }),
    posts: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, '1800 s'),
      prefix: 'rl:posts',
    }),
    comments: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(50, '3600 s'),
      prefix: 'rl:comments',
    }),
  };

  return _limiters;
}

// ============================================
// Middleware factory
// ============================================

function getKey(req, limitType) {
  const identifier = req.token || req.ip || 'anonymous';
  return `${limitType}:${identifier}`;
}

function rateLimit(limitType = 'requests', options = {}) {
  const memLimit = config.rateLimits[limitType];
  if (!memLimit) {
    throw new Error(`Unknown rate limit type: ${limitType}`);
  }

  const {
    skip = () => false,
    keyGenerator = (req) => getKey(req, limitType),
    message = 'Rate limit exceeded',
  } = options;

  return async (req, res, next) => {
    try {
      if (await Promise.resolve(skip(req))) {
        return next();
      }

      const key = await Promise.resolve(keyGenerator(req));
      const limiters = getLimiters();

      if (limiters && limiters[limitType]) {
        // Upstash path
        const { success, limit, remaining, reset } = await limiters[limitType].limit(key);

        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', Math.floor(reset / 1000));

        if (!success) {
          const retryAfter = Math.ceil((reset - Date.now()) / 1000);
          res.setHeader('Retry-After', retryAfter);
          throw new RateLimitError(message, retryAfter);
        }

        req.rateLimit = { allowed: true, remaining, limit, resetAt: new Date(reset) };
      } else {
        // In-memory fallback
        const result = checkMemoryLimit(key, memLimit);

        res.setHeader('X-RateLimit-Limit', result.limit);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000));

        if (!result.allowed) {
          res.setHeader('Retry-After', result.retryAfter);
          throw new RateLimitError(message, result.retryAfter);
        }

        req.rateLimit = result;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

const requestLimiter = rateLimit('requests');
const postLimiter = rateLimit('posts', { message: 'You can only post once every 30 minutes' });
const commentLimiter = rateLimit('comments', { message: 'Too many comments, slow down' });

module.exports = {
  rateLimit,
  requestLimiter,
  postLimiter,
  commentLimiter,
};
