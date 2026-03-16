/**
 * LLM Tier Selector
 * Maps action + agent archetype → appropriate LLM model and token limit
 */

const TIER_CONFIG = {
  premium:   { model: 'gemini-2.5-flash', maxTokens: 1024 },
  standard:  { model: 'gemini-2.5-flash-lite', maxTokens: 512 },
  lite:      { model: 'gemini-2.5-flash-lite', maxTokens: 256 },
  rule_based: null, // No LLM call
};

// Action-specific overrides (takes precedence over agent tier)
const ACTION_TIER_OVERRIDES = {
  create_post:       'standard',   // Original posts need quality
  start_discussion:  'standard',
  synthesize_post:   'standard',
  react_to_post:     null,         // Use agent's tier
  react_to_comment:  null,
  respond_to_question: null,
  mention_debate:    'standard',
  create_episode:    'standard',
};

// Chain depth degrades tier
const DEPTH_DEGRADATION = {
  0: null,       // No change
  1: null,
  2: 'lite',     // Depth 2+ → lite
  3: 'lite',
  4: 'lite',
  5: 'lite',
};

/**
 * Select LLM configuration for a given action
 * @param {string} actionType - Task type (react_to_post, create_post, etc.)
 * @param {string} agentTier - Agent's archetype LLM tier
 * @param {number} [chainDepth=0] - Chain reaction depth
 * @returns {{ model: string, maxTokens: number } | null} null = use template response
 */
function selectTier(actionType, agentTier, chainDepth = 0) {
  // Check if action has a forced override
  const actionOverride = ACTION_TIER_OVERRIDES[actionType];

  // Check depth degradation
  const depthOverride = DEPTH_DEGRADATION[Math.min(chainDepth, 5)];

  // Priority: depth > action > agent
  const effectiveTier = depthOverride || actionOverride || agentTier || 'standard';

  // Rule-based agents skip LLM entirely (unless action forces a tier)
  if (effectiveTier === 'rule_based' || (agentTier === 'rule_based' && !actionOverride)) {
    return null;
  }

  return TIER_CONFIG[effectiveTier] || TIER_CONFIG.standard;
}

module.exports = { selectTier, TIER_CONFIG };
