/**
 * @jest-environment node
 */
const GameEngine = require('../GameEngine');

describe('GameEngine', () => {
  const mockPlayers = [
    { agentId: 'a1', color: '#FF6B6B' },
    { agentId: 'a2', color: '#4ECDC4' },
    { agentId: 'a3', color: '#45B7D1' },
    { agentId: 'a4', color: '#96CEB4' },
  ];

  describe('createGame', () => {
    test('creates game with playing status', () => {
      const state = GameEngine.createGame('game-1', mockPlayers, 42);
      expect(state.status).toBe('playing');
      expect(state.currentTurn).toBe(0);
      expect(state.maxTurns).toBe(50);
      expect(state.players).toHaveLength(4);
    });

    test('players start with 100 resources and alive', () => {
      const state = GameEngine.createGame('game-1', mockPlayers, 42);
      for (const p of state.players) {
        expect(p.resources).toBe(100);
        expect(p.alive).toBe(true);
      }
    });

    test('start hexes are owned by players', () => {
      const state = GameEngine.createGame('game-1', mockPlayers, 42);
      for (let i = 0; i < 4; i++) {
        const pos = state.map.startPositions[i];
        const hex = state.map.hexes.get(`${pos.q},${pos.r}`);
        expect(hex.owner).toBe(mockPlayers[i].agentId);
      }
    });
  });

  describe('isGameOver', () => {
    test('returns false when game just started', () => {
      const state = GameEngine.createGame('game-1', mockPlayers, 42);
      const result = GameEngine.isGameOver(state);
      expect(result.over).toBe(false);
    });

    test('returns true when one player has 50%+ territory', () => {
      const state = GameEngine.createGame('game-1', mockPlayers, 42);
      const passableCount = [...state.map.hexes.values()].filter(h => h.terrain !== 'mountain' && h.terrain !== 'water').length;
      let count = 0;
      for (const hex of state.map.hexes.values()) {
        if (hex.terrain !== 'mountain' && hex.terrain !== 'water') {
          hex.owner = 'a1';
          count++;
          if (count > passableCount / 2) break;
        }
      }
      const result = GameEngine.isGameOver(state);
      expect(result.over).toBe(true);
      expect(result.winner).toBe('a1');
      expect(result.reason).toBe('territory');
    });

    test('returns true when only one player alive', () => {
      const state = GameEngine.createGame('game-1', mockPlayers, 42);
      state.players[1].alive = false;
      state.players[2].alive = false;
      state.players[3].alive = false;
      const result = GameEngine.isGameOver(state);
      expect(result.over).toBe(true);
      expect(result.winner).toBe('a1');
      expect(result.reason).toBe('last_standing');
    });

    test('returns true at maxTurns with most territory winning', () => {
      const state = GameEngine.createGame('game-1', mockPlayers, 42);
      state.currentTurn = 50;
      let count = 0;
      for (const hex of state.map.hexes.values()) {
        if (hex.terrain === 'plain' && !hex.owner) {
          hex.owner = 'a2';
          count++;
          if (count >= 10) break;
        }
      }
      const result = GameEngine.isGameOver(state);
      expect(result.over).toBe(true);
      expect(result.winner).toBe('a2');
      expect(result.reason).toBe('max_turns');
    });
  });

  describe('getPlayerStats', () => {
    test('returns stats for all players', () => {
      const state = GameEngine.createGame('game-1', mockPlayers, 42);
      const stats = GameEngine.getPlayerStats(state);
      expect(stats).toHaveLength(4);
      for (const s of stats) {
        expect(s).toHaveProperty('agentId');
        expect(s).toHaveProperty('territoryCount');
        expect(s).toHaveProperty('resources');
        expect(s).toHaveProperty('alive');
      }
    });
  });

  describe('checkElimination', () => {
    test('player with 0 territory is eliminated', () => {
      const state = GameEngine.createGame('game-1', mockPlayers, 42);
      for (const hex of state.map.hexes.values()) {
        if (hex.owner === 'a1') hex.owner = null;
      }
      const newState = GameEngine.checkElimination(state);
      expect(newState.players.find(p => p.agentId === 'a1').alive).toBe(false);
    });
  });
});
