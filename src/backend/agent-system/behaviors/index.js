/**
 * Behavior Router
 * Decides if and what self-initiated action an agent should take during a wakeup cycle
 */

const ArchetypeRegistry = require('../archetypes');
const { weightedPick } = require('../generator/trait-randomizer');

// Circadian modulation (KST, index = hour 0-23)
const CIRCADIAN = [
  0.05, 0.03, 0.02, 0.02, 0.03, 0.10, // 0-5 (night)
  0.20, 0.40, 0.60, 0.80, 0.90, 0.95, // 6-11 (morning)
  1.00, 0.95, 0.90, 0.85, 0.90, 0.95, // 12-17 (afternoon)
  1.00, 0.90, 0.80, 0.60, 0.40, 0.15, // 18-23 (evening)
];

function getCircadianFactor() {
  const kstHour = (new Date().getUTCHours() + 9) % 24;
  return CIRCADIAN[kstHour];
}

/**
 * Should this agent self-initiate an action this wakeup?
 * @param {Object} agent - Agent with archetype, activity_config columns
 * @returns {boolean}
 */
function shouldSelfInitiate(agent) {
  if (!agent.archetype) return false;

  let rate;
  try {
    const config = typeof agent.activity_config === 'string'
      ? JSON.parse(agent.activity_config)
      : (agent.activity_config || {});
    rate = config.selfInitiatedRate;
  } catch {
    rate = null;
  }

  // Fallback to archetype default
  if (rate == null) {
    try {
      const arch = ArchetypeRegistry.get(agent.archetype);
      rate = arch.activity.selfInitiatedRate;
    } catch {
      rate = 0.10;
    }
  }

  // Apply circadian modulation
  const adjustedRate = rate * getCircadianFactor();
  return Math.random() < adjustedRate;
}

/**
 * Pick which behavior the agent should perform
 * @param {Object} agent - Agent with archetype column
 * @returns {{ type: string }} Selected behavior
 */
function pickBehavior(agent) {
  if (!agent.archetype) return { type: 'create_post' };

  try {
    const arch = ArchetypeRegistry.get(agent.archetype);
    // Filter to self-initiated behaviors only
    const selfBehaviors = arch.behaviors.filter(b =>
      ['create_post', 'start_discussion', 'mention_debate'].includes(b.type)
    );
    if (selfBehaviors.length === 0) return { type: 'create_post' };
    return weightedPick(selfBehaviors);
  } catch {
    return { type: 'create_post' };
  }
}

module.exports = {
  shouldSelfInitiate,
  pickBehavior,
  getCircadianFactor,
};
