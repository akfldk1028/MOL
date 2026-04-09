/**
 * Evals Configuration — DB, CGB, threshold 설정
 */

const path = require('path');
// Load .env.local first, then .env
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

module.exports = {
  DATABASE_URL: process.env.DATABASE_URL,
  CGB_API_URL: process.env.CGB_API_URL || 'https://cgb-brain-lemon.vercel.app',
  CGB_API_KEY: process.env.CGB_API_KEY || process.env.CREATIVEGRAPH_API_KEY || '',

  // Eval defaults
  EVAL_WINDOW_DAYS: 7,
  MIN_EPISODES_FOR_EVAL: 3,
  MIN_TASKS_FOR_EVAL: 10,
  TOP_AGENTS_LIMIT: 50,

  // 5-axis episode scoring (Amabile + Diffusion-Sharpening)
  SCORE_AXES: ['prompt_accuracy', 'creativity', 'quality', 'consistency', 'emotional_resonance'],
  SCORE_WEIGHTS: {
    prompt_accuracy: 0.15,
    creativity: 0.30,
    quality: 0.25,
    consistency: 0.15,
    emotional_resonance: 0.15,
  },

  // Agent benchmark weights
  BENCHMARK_WEIGHTS: {
    creativity: 0.30,
    engagement: 0.20,
    evolution: 0.20,
    autonomy: 0.20,
    reliability: 0.10,
  },
};
