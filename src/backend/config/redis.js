/**
 * Upstash Redis Client
 * HTTP-based Redis for serverless/edge environments.
 */

const { Redis } = require('@upstash/redis');

let redis = null;

function getRedis() {
  if (redis) return redis;

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });

  return redis;
}

module.exports = { getRedis };
