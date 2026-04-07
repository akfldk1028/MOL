'use strict';

const HexGrid = require('./HexGrid');
const CombatResolver = require('./CombatResolver');

/**
 * TurnProcessor — Validates and executes turn actions.
 * Pure function: state in, new state + events out.
 */

function processTurn(state, actions) {
  // Deep clone state
  const clonedHexes = new Map();
  for (const [k, v] of state.map.hexes) {
    clonedHexes.set(k, { ...v });
  }
  const newState = {
    ...state,
    map: { ...state.map, hexes: clonedHexes },
    players: state.players.map(p => ({ ...p })),
    alliances: state.alliances.map(a => ({ ...a })),
  };

  const events = [];

  const priority = { develop: 0, defend: 1, expand: 2, diplomacy: 3, attack: 4 };
  const sorted = [...actions].sort((a, b) => (priority[a.type] || 0) - (priority[b.type] || 0));

  for (const action of sorted) {
    const player = newState.players.find(p => p.agentId === action.agentId);
    if (!player || !player.alive) {
      events.push({ agentId: action.agentId, type: action.type, success: false, reason: 'dead' });
      continue;
    }

    switch (action.type) {
      case 'expand':
        events.push(executeExpand(newState, player, action.target));
        break;
      case 'attack':
        events.push(executeAttack(newState, player, action.target));
        break;
      case 'defend':
        events.push(executeDefend(newState, player, action.target));
        break;
      case 'develop':
        events.push(executeDevelop(newState, player));
        break;
      case 'diplomacy':
        events.push({ agentId: action.agentId, type: 'diplomacy', success: true, detail: action });
        break;
      default:
        events.push({ agentId: action.agentId, type: action.type, success: false, reason: 'unknown_action' });
    }
  }

  newState.currentTurn++;
  return { newState, events };
}

function executeExpand(state, player, target) {
  if (!target) return { agentId: player.agentId, type: 'expand', success: false, reason: 'no_target' };

  const key = `${target.q},${target.r}`;
  const hex = state.map.hexes.get(key);
  if (!hex) return { agentId: player.agentId, type: 'expand', success: false, reason: 'invalid_hex' };
  if (hex.owner !== null) return { agentId: player.agentId, type: 'expand', success: false, reason: 'occupied' };
  if (hex.terrain === 'mountain' || hex.terrain === 'water') {
    return { agentId: player.agentId, type: 'expand', success: false, reason: 'impassable' };
  }
  if (player.resources < 10) {
    return { agentId: player.agentId, type: 'expand', success: false, reason: 'insufficient_resources' };
  }

  const neighbors = HexGrid.getNeighbors(target.q, target.r);
  const adjacent = neighbors.some(n => {
    const nHex = state.map.hexes.get(`${n.q},${n.r}`);
    return nHex && nHex.owner === player.agentId;
  });
  if (!adjacent) return { agentId: player.agentId, type: 'expand', success: false, reason: 'not_adjacent' };

  hex.owner = player.agentId;
  player.resources -= 10;
  return { agentId: player.agentId, type: 'expand', success: true, hex: { q: target.q, r: target.r } };
}

function executeAttack(state, player, target) {
  if (!target) return { agentId: player.agentId, type: 'attack', success: false, reason: 'no_target' };

  const key = `${target.q},${target.r}`;
  const hex = state.map.hexes.get(key);
  if (!hex || !hex.owner || hex.owner === player.agentId) {
    return { agentId: player.agentId, type: 'attack', success: false, reason: 'invalid_target' };
  }

  const neighbors = HexGrid.getNeighbors(target.q, target.r);
  const adjacent = neighbors.some(n => {
    const nHex = state.map.hexes.get(`${n.q},${n.r}`);
    return nHex && nHex.owner === player.agentId;
  });
  if (!adjacent) return { agentId: player.agentId, type: 'attack', success: false, reason: 'not_adjacent' };

  const defenderId = hex.owner;
  const allied = state.alliances.some(a =>
    (a.a === player.agentId && a.b === defenderId) ||
    (a.b === player.agentId && a.a === defenderId)
  );
  if (allied) return { agentId: player.agentId, type: 'attack', success: false, reason: 'allied' };

  const combatResult = CombatResolver.resolve({
    defenseBonus: hex.defenseBonus,
    terrain: hex.terrain,
  });

  const defender = state.players.find(p => p.agentId === defenderId);

  if (combatResult.winner === 'attacker') {
    hex.owner = player.agentId;
    hex.defenseBonus = 0;
  }
  player.resources = Math.max(0, player.resources - combatResult.attackerResourceLoss);
  if (defender) defender.resources = Math.max(0, defender.resources - combatResult.defenderResourceLoss);

  return {
    agentId: player.agentId, type: 'attack', success: true,
    hex: { q: target.q, r: target.r },
    combatResult,
    defenderId,
  };
}

function executeDefend(state, player, target) {
  if (!target) return { agentId: player.agentId, type: 'defend', success: false, reason: 'no_target' };

  const key = `${target.q},${target.r}`;
  const hex = state.map.hexes.get(key);
  if (!hex || hex.owner !== player.agentId) {
    return { agentId: player.agentId, type: 'defend', success: false, reason: 'not_owned' };
  }

  if (hex.defenseBonus < 3) {
    hex.defenseBonus++;
  }

  return { agentId: player.agentId, type: 'defend', success: true, hex: { q: target.q, r: target.r }, defenseBonus: hex.defenseBonus };
}

function executeDevelop(state, player) {
  const territoryCount = [...state.map.hexes.values()].filter(h => h.owner === player.agentId).length;
  const income = territoryCount * 3;
  player.resources += income;
  return { agentId: player.agentId, type: 'develop', success: true, income };
}

module.exports = { processTurn };
