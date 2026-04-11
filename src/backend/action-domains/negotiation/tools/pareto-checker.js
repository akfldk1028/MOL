/**
 * pareto-checker.js
 * -----------------
 * Pareto efficiency analysis for negotiation outcomes.
 *
 * A proposal is Pareto-efficient if no alternative exists that makes one
 * party strictly better off without making another party worse off.
 *
 * Used by:
 *   - Mediator (fulcrum) — propose Pareto-improvements to break deadlock
 *   - Value Architect (prism) — find integrative deals that "grow the pie"
 *
 * Paper foundation: Walton & McKersie (1965) integrative bargaining,
 *                   ANAC Pareto frontier benchmarks.
 */

/**
 * Check if a proposal is Pareto-dominated by another.
 * @param {object} candidate - Proposal we're checking
 * @param {object} other     - Proposal to compare against
 * @param {Array<UtilityFunction>} utilities - one per party
 * @returns {boolean} true if `other` Pareto-dominates `candidate`
 */
function isDominated(candidate, other, utilities) {
  let strictlyBetter = false;
  for (const u of utilities) {
    const cScore = u.score(candidate);
    const oScore = u.score(other);
    if (oScore < cScore) return false;        // other is worse for this party
    if (oScore > cScore) strictlyBetter = true; // other is better for at least one
  }
  return strictlyBetter;
}

/**
 * Is `candidate` Pareto-efficient within a set of alternatives?
 * @param {object} candidate
 * @param {object[]} alternatives
 * @param {Array<UtilityFunction>} utilities
 * @returns {boolean}
 */
function isParetoEfficient(candidate, alternatives, utilities) {
  for (const alt of alternatives) {
    if (alt === candidate) continue;
    if (isDominated(candidate, alt, utilities)) return false;
  }
  return true;
}

/**
 * Find the Pareto frontier from a set of proposals.
 * @param {object[]} proposals
 * @param {Array<UtilityFunction>} utilities
 * @returns {object[]} the subset that is Pareto-efficient
 */
function paretoFrontier(proposals, utilities) {
  return proposals.filter((p) => isParetoEfficient(p, proposals, utilities));
}

/**
 * Score a proposal from all parties' perspectives — useful for mediator summaries.
 * @returns {Array<{ agent_id, score }>}
 */
function multiPartyScore(proposal, parties) {
  return parties
    .filter((p) => p.utility)
    .map((p) => ({
      agent_id: p.agent_id,
      score: p.utility.score(proposal),
    }));
}

/**
 * Suggest a compromise: pick a proposal from the session history that
 * maximizes the minimum of all parties' scores (Nash bargaining solution
 * approximation).
 */
function suggestCompromise(session, utilities) {
  if (session.proposals.length === 0) return null;
  let best = null;
  let bestMin = -Infinity;
  for (const p of session.proposals) {
    const scores = utilities.map((u) => u.score(p));
    const min = Math.min(...scores);
    if (min > bestMin) {
      bestMin = min;
      best = p;
    }
  }
  return best;
}

module.exports = {
  isDominated,
  isParetoEfficient,
  paretoFrontier,
  multiPartyScore,
  suggestCompromise,
};
