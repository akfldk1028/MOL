'use strict';

const HexGrid = require('./HexGrid');

/**
 * GameEngine — State machine for Hex Wars.
 * Pure functions, no DB dependency.
 */

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

function createGame(id, players, seed) {
  const map = HexGrid.generateMap(15, 15, seed);

  const gamePlayers = players.map((p, i) => ({
    agentId: p.agentId,
    color: p.color || COLORS[i],
    resources: 100,
    alive: true,
  }));

  for (let i = 0; i < 4; i++) {
    const pos = map.startPositions[i];
    const hex = map.hexes.get(`${pos.q},${pos.r}`);
    if (hex) hex.owner = gamePlayers[i].agentId;
  }

  return {
    id,
    status: 'playing',
    currentTurn: 0,
    maxTurns: 50,
    map,
    players: gamePlayers,
    alliances: [],
    turnHistory: [],
  };
}

function isGameOver(state) {
  const stats = getPlayerStats(state);
  const passableCount = [...state.map.hexes.values()]
    .filter(h => h.terrain !== 'mountain' && h.terrain !== 'water').length;

  for (const s of stats) {
    if (s.territoryCount > passableCount / 2) {
      return { over: true, winner: s.agentId, reason: 'territory' };
    }
  }

  const alive = stats.filter(s => s.alive);
  if (alive.length === 1) {
    return { over: true, winner: alive[0].agentId, reason: 'last_standing' };
  }
  if (alive.length === 0) {
    return { over: true, winner: null, reason: 'draw' };
  }

  if (state.currentTurn >= state.maxTurns) {
    const sorted = [...alive].sort((a, b) =>
      b.territoryCount - a.territoryCount || b.resources - a.resources
    );
    return { over: true, winner: sorted[0].agentId, reason: 'max_turns' };
  }

  return { over: false };
}

function getPlayerStats(state) {
  const territoryCounts = {};
  for (const p of state.players) territoryCounts[p.agentId] = 0;
  for (const hex of state.map.hexes.values()) {
    if (hex.owner && territoryCounts[hex.owner] !== undefined) {
      territoryCounts[hex.owner]++;
    }
  }

  return state.players.map(p => ({
    agentId: p.agentId,
    color: p.color,
    territoryCount: territoryCounts[p.agentId],
    resources: p.resources,
    alive: p.alive,
  }));
}

function checkElimination(state) {
  const stats = getPlayerStats(state);
  for (const s of stats) {
    if (s.territoryCount === 0) {
      const player = state.players.find(p => p.agentId === s.agentId);
      if (player) player.alive = false;
    }
  }
  return state;
}

module.exports = { createGame, isGameOver, getPlayerStats, checkElimination, COLORS };
