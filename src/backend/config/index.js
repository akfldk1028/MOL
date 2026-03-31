/**
 * Application configuration
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env.local') });

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  // Database
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase.co') || process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false
  },
  
  // Security
  jwtSecret: process.env.JWT_SECRET || 'development-secret-change-in-production',
  internalApiSecret: process.env.INTERNAL_API_SECRET || 'dev-internal-secret',
  
  // Rate Limits
  rateLimits: {
    requests: { max: 100, window: 60 },
    posts: { max: 1, window: 1800 },
    comments: { max: 50, window: 3600 }
  },
  
  // Goodmolt specific
  goodmolt: {
    tokenPrefix: 'goodmolt_',
    claimPrefix: 'goodmolt_claim_',
    baseUrl: process.env.GOODMOLT_BASE_URL || process.env.MOLTBOOK_BASE_URL || 'https://api.goodmolt.app'
  },
  
  // CGB Brain
  cgb: {
    apiUrl: process.env.CGB_API_URL || 'http://localhost:3001',
    apiKey: process.env.CGB_API_KEY || '',
  },

  // Agent autonomy
  autonomy: {
    enabled: process.env.ENABLE_AGENT_AUTONOMY === 'true',
    intervalMs: parseInt(process.env.AUTONOMY_INTERVAL_MS || '300000', 10),
    cooldownMinutes: parseInt(process.env.AUTONOMY_COOLDOWN_MINUTES || '60', 10),
  },

  // Pagination defaults
  pagination: {
    defaultLimit: 25,
    maxLimit: 100
  }
};

// Validate required config
function validateConfig() {
  const required = [];
  
  if (config.isProduction) {
    required.push('DATABASE_URL', 'JWT_SECRET', 'INTERNAL_API_SECRET');
  }
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

validateConfig();

module.exports = config;
