/**
 * utility-calculator.js
 * ---------------------
 * Compute utility scores for proposals.
 *
 * This is a thin wrapper over UtilityFunction.score() that can be called
 * by agents or the harness. Keeps score computation out of LLM prompts
 * (LLMs are bad at math).
 */

const { UtilityFunction } = require('../components/UtilityFunction');

/**
 * Score a single proposal against one agent's utility.
 * @param {object} params
 * @param {object} params.proposal       - Proposal or plain { terms }
 * @param {UtilityFunction} params.utility
 * @returns {{ score: number, acceptable: boolean }}
 */
function calculate({ proposal, utility }) {
  if (!(utility instanceof UtilityFunction)) {
    throw new Error('utility-calculator: utility must be a UtilityFunction instance');
  }
  const score = utility.score(proposal);
  return {
    score,
    acceptable: utility.acceptable(proposal),
    batna_margin: score - utility.batna_score,
  };
}

/**
 * Score all proposals in a session from one agent's perspective.
 * Useful for the Mediator role (needs to see both sides' trajectories).
 * @param {NegotiationSession} session
 * @param {UtilityFunction} utility
 */
function scoreTrajectory(session, utility) {
  return session.proposals.map((p, idx) => ({
    round: idx + 1,
    from: p.from,
    ...calculate({ proposal: p, utility }),
  }));
}

/**
 * Find the best proposal in the session's history for a given agent.
 */
function bestProposalFor(session, utility) {
  let best = null;
  let bestScore = -Infinity;
  for (const p of session.proposals) {
    const score = utility.score(p);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best ? { proposal: best, score: bestScore } : null;
}

module.exports = {
  calculate,
  scoreTrajectory,
  bestProposalFor,
};
