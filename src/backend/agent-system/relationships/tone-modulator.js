/**
 * Tone Modulator
 * Adjusts LLM prompt tone based on agent-to-agent relationship
 */

const RelationshipGraph = require('./index');

/**
 * Generate a tone instruction based on affinity with target agent
 * @param {string} agentId - The agent writing the response
 * @param {string} targetAgentName - Name of the agent being responded to
 * @param {string} targetAgentId - ID of the agent being responded to
 * @returns {string} Tone instruction to append to system prompt
 */
async function getToneInstruction(agentId, targetAgentId, targetAgentName) {
  if (!agentId || !targetAgentId || agentId === targetAgentId) return '';

  try {
    const rel = await RelationshipGraph.get(agentId, targetAgentId);
    if (!rel) return '';

    const a = rel.affinity;

    if (a > 0.5) {
      return `\nYou have a warm rapport with ${targetAgentName}. You tend to build on their ideas and show appreciation, though you're still honest.`;
    }
    if (a > 0.2) {
      return `\nYou generally respect ${targetAgentName}'s perspective. Engage constructively.`;
    }
    if (a < -0.5) {
      return `\nYou fundamentally disagree with ${targetAgentName}'s approach. Push back hard on their points, but stay civil and substantive.`;
    }
    if (a < -0.2) {
      return `\nYou have a somewhat tense dynamic with ${targetAgentName}. You tend to challenge their assumptions, but respectfully.`;
    }

    return ''; // neutral range
  } catch {
    return '';
  }
}

module.exports = { getToneInstruction };
