/**
 * BrainEvolution — brain_config 초기 산출 + HR 평가 진화 + 활동 경험치
 */

const { queryOne, queryAll } = require('../config/database');

const ARCHETYPE_WEIGHTS = {
  creator:     { researcher: 0.10, divergent: 0.40, evaluator: 0.05, validator: 0.05, director: 0.10, iterator: 0.30 },
  character:   { researcher: 0.30, divergent: 0.30, evaluator: 0.05, validator: 0.05, director: 0.10, iterator: 0.20 },
  expert:      { researcher: 0.40, divergent: 0.10, evaluator: 0.15, validator: 0.20, director: 0.05, iterator: 0.10 },
  provocateur: { researcher: 0.10, divergent: 0.35, evaluator: 0.05, validator: 0.10, director: 0.10, iterator: 0.30 },
  connector:   { researcher: 0.20, divergent: 0.15, evaluator: 0.10, validator: 0.10, director: 0.35, iterator: 0.10 },
  lurker:      { researcher: 0.35, divergent: 0.05, evaluator: 0.30, validator: 0.20, director: 0.05, iterator: 0.05 },
  critic:      { researcher: 0.10, divergent: 0.05, evaluator: 0.40, validator: 0.30, director: 0.05, iterator: 0.10 },
  utility:     { researcher: 0.15, divergent: 0.10, evaluator: 0.15, validator: 0.15, director: 0.30, iterator: 0.15 },
};

const BIG_FIVE_MODIFIERS = {
  openness:          { divergent: 0.15, researcher: 0.05 },
  conscientiousness: { evaluator: 0.10, iterator: 0.05 },
  extraversion:      { director: 0.10, divergent: 0.05 },
  agreeableness:     { validator: 0.10, director: 0.05 },
  neuroticism:       { iterator: 0.10, evaluator: 0.05 },
};

const LEVEL_PERMISSIONS = { 1: 'full', 2: 'trusted', 3: 'auto', 4: 'validated' };

const LEVEL_TOOLS = {
  1: ['brainstorm', 'scamper', 'triz', 'evaluate_idea', 'measure_novelty', 'graph_add_node', 'graph_add_edge', 'graph_search', 'graph_query', 'web_search', 'extract_keywords'],
  2: ['brainstorm', 'scamper', 'triz', 'evaluate_idea', 'measure_novelty', 'graph_add_node', 'graph_add_edge', 'graph_search', 'web_search', 'extract_keywords'],
  3: ['brainstorm', 'scamper', 'evaluate_idea', 'graph_add_node', 'graph_search', 'web_search', 'extract_keywords'],
  4: ['brainstorm', 'evaluate_idea', 'graph_search', 'web_search', 'extract_keywords'],
};

function normalize(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum === 0) return weights;
  const result = {};
  for (const [k, v] of Object.entries(weights)) {
    result[k] = Math.round((v / sum) * 1000) / 1000;
  }
  return result;
}

function calculateInitial(agent) {
  const archetype = agent.archetype || 'utility';
  const personality = agent.personality || {};
  const level = agent.level || 4;
  const domain = agent.department || 'general';

  const weights = { ...(ARCHETYPE_WEIGHTS[archetype] || ARCHETYPE_WEIGHTS.utility) };

  for (const [trait, mods] of Object.entries(BIG_FIVE_MODIFIERS)) {
    const value = personality[trait];
    if (typeof value !== 'number') continue;
    for (const [role, mod] of Object.entries(mods)) {
      weights[role] = (weights[role] || 0) + mod * value;
    }
  }

  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const tempMap = { divergent: 0.9, researcher: 0.7, evaluator: 0.3, validator: 0.4, director: 0.5, iterator: 0.8 };
  const maxStepsBase = { 1: 15, 2: 12, 3: 10, 4: 8 };

  return {
    weights: normalize(weights),
    temperature: Math.round((tempMap[dominant] || 0.7) * 100) / 100,
    max_steps: maxStepsBase[level] || 8,
    tool_access: LEVEL_TOOLS[level] || LEVEL_TOOLS[4],
    graph_scope: domain.replace(/_/g, '-'),
    write_permission: LEVEL_PERMISSIONS[level] || 'validated',
  };
}

function applyHREvaluation(currentConfig, grade) {
  if (!currentConfig) return currentConfig;
  const config = JSON.parse(JSON.stringify(currentConfig));
  const weights = config.weights;

  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const strongest = sorted[0][0];
  const weakest = sorted[sorted.length - 1][0];

  switch (grade) {
    case 'S':
      weights[strongest] = (weights[strongest] || 0) + 0.05;
      config.max_steps = Math.min(20, (config.max_steps || 8) + 2);
      break;
    case 'A':
      weights[strongest] = (weights[strongest] || 0) + 0.03;
      config.max_steps = Math.min(20, (config.max_steps || 8) + 1);
      break;
    case 'C':
      weights[weakest] = Math.max(0, (weights[weakest] || 0) - 0.02);
      config.max_steps = Math.max(4, (config.max_steps || 8) - 1);
      break;
    case 'D':
      weights[weakest] = Math.max(0, (weights[weakest] || 0) - 0.03);
      config.max_steps = Math.max(4, (config.max_steps || 8) - 2);
      break;
  }

  config.weights = normalize(weights);
  return config;
}

function applyExperience(currentConfig, activityCounts) {
  if (!currentConfig) return currentConfig;
  const config = JSON.parse(JSON.stringify(currentConfig));
  const weights = config.weights;

  const thresholds = {
    brainstorm: { count: 100, role: 'divergent', boost: 0.02 },
    evaluate: { count: 50, role: 'evaluator', boost: 0.02 },
    graph_add: { count: 50, role: 'researcher', boost: 0.02 },
    scamper: { count: 30, role: 'iterator', boost: 0.02 },
    cross_domain: { count: 10, role: 'director', boost: 0.02 },
  };

  for (const [activity, { count, role, boost }] of Object.entries(thresholds)) {
    const current = activityCounts[activity] || 0;
    const times = Math.floor(current / count);
    if (times > 0) {
      weights[role] = (weights[role] || 0) + boost * times;
    }
  }

  config.weights = normalize(weights);
  return config;
}

async function initializeAll() {
  const agents = await queryAll(
    `SELECT id, archetype, personality, level, department
     FROM agents WHERE is_active = true AND brain_config IS NULL`
  );

  let count = 0;
  for (const agent of agents) {
    const config = calculateInitial(agent);
    await queryOne(
      `UPDATE agents SET brain_config = $1 WHERE id = $2`,
      [JSON.stringify(config), agent.id]
    );
    count++;
  }
  return count;
}

module.exports = {
  calculateInitial, applyHREvaluation, applyExperience, initializeAll,
  normalize, ARCHETYPE_WEIGHTS, LEVEL_PERMISSIONS, LEVEL_TOOLS,
};
