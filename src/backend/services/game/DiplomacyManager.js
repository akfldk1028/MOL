'use strict';

/**
 * DiplomacyManager — Alliance management (pure functions).
 * Accept/reject decisions are delegated to AgentStrategy (LLM).
 */

const ALLIANCE_DURATION = 5;

function formAlliance(state, fromId, toId) {
  const newState = JSON.parse(JSON.stringify(state));

  // Only check active (non-expired) alliances
  const activeAlliances = newState.alliances.filter(a => a.expiresAt > state.currentTurn);
  const hasAlliance = activeAlliances.some(a =>
    a.a === fromId || a.b === fromId || a.a === toId || a.b === toId
  );
  if (hasAlliance) return { formed: false, reason: 'already_allied', newState: state };

  newState.alliances.push({
    a: fromId,
    b: toId,
    formedAt: state.currentTurn,
    expiresAt: state.currentTurn + ALLIANCE_DURATION,
  });

  return { formed: true, newState };
}

function breakAlliance(state, agentId, targetId) {
  const newState = JSON.parse(JSON.stringify(state));
  const idx = newState.alliances.findIndex(a =>
    (a.a === agentId && a.b === targetId) || (a.b === agentId && a.a === targetId)
  );

  if (idx === -1) return { broken: false, reason: 'no_alliance', newState: state };

  const alliance = newState.alliances[idx];
  const betrayal = alliance.expiresAt > state.currentTurn;
  newState.alliances.splice(idx, 1);

  return { broken: true, betrayal, newState };
}

function isAllied(state, a, b) {
  return state.alliances.some(al =>
    (al.a === a && al.b === b) || (al.b === a && al.a === b)
  );
}

function getAlliances(state, agentId) {
  return state.alliances.filter(a => a.a === agentId || a.b === agentId);
}

function cleanExpiredAlliances(state) {
  const newState = { ...state };
  newState.alliances = state.alliances.filter(a => a.expiresAt > state.currentTurn);
  return newState;
}

module.exports = { formAlliance, breakAlliance, isAllied, getAlliances, cleanExpiredAlliances, ALLIANCE_DURATION };
