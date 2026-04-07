/**
 * @jest-environment node
 */
const TurnProcessor = require('../TurnProcessor');
const GameEngine = require('../GameEngine');
const HexGrid = require('../HexGrid');

describe('TurnProcessor', () => {
  const mockPlayers = [
    { agentId: 'a1' }, { agentId: 'a2' },
    { agentId: 'a3' }, { agentId: 'a4' },
  ];

  let state;
  beforeEach(() => {
    state = GameEngine.createGame('game-1', mockPlayers, 42);
  });

  describe('expand', () => {
    test('expands to adjacent empty plain hex', () => {
      const start = state.map.startPositions[0];
      const neighbors = HexGrid.getNeighbors(start.q, start.r);
      const emptyNeighbor = neighbors.find(n => {
        const hex = state.map.hexes.get(`${n.q},${n.r}`);
        return hex && hex.owner === null && hex.terrain === 'plain';
      });

      const actions = [
        { agentId: 'a1', type: 'expand', target: emptyNeighbor },
        { agentId: 'a2', type: 'develop' },
        { agentId: 'a3', type: 'develop' },
        { agentId: 'a4', type: 'develop' },
      ];

      const { newState, events } = TurnProcessor.processTurn(state, actions);
      const hex = newState.map.hexes.get(`${emptyNeighbor.q},${emptyNeighbor.r}`);
      expect(hex.owner).toBe('a1');
      expect(newState.players[0].resources).toBe(90);
    });

    test('fails on non-adjacent hex', () => {
      const farHex = { q: 10, r: 10 };
      const actions = [
        { agentId: 'a1', type: 'expand', target: farHex },
        { agentId: 'a2', type: 'develop' },
        { agentId: 'a3', type: 'develop' },
        { agentId: 'a4', type: 'develop' },
      ];

      const { events } = TurnProcessor.processTurn(state, actions);
      const expandEvent = events.find(e => e.agentId === 'a1');
      expect(expandEvent.success).toBe(false);
    });
  });

  describe('develop', () => {
    test('increases resources by territory × 3', () => {
      const actions = [
        { agentId: 'a1', type: 'develop' },
        { agentId: 'a2', type: 'develop' },
        { agentId: 'a3', type: 'develop' },
        { agentId: 'a4', type: 'develop' },
      ];

      const { newState } = TurnProcessor.processTurn(state, actions);
      expect(newState.players[0].resources).toBe(103);
    });
  });

  describe('defend', () => {
    test('increases defense bonus on own hex', () => {
      const start = state.map.startPositions[0];
      const actions = [
        { agentId: 'a1', type: 'defend', target: start },
        { agentId: 'a2', type: 'develop' },
        { agentId: 'a3', type: 'develop' },
        { agentId: 'a4', type: 'develop' },
      ];

      const { newState } = TurnProcessor.processTurn(state, actions);
      const hex = newState.map.hexes.get(`${start.q},${start.r}`);
      expect(hex.defenseBonus).toBe(1);
    });

    test('caps defense at 3', () => {
      const start = state.map.startPositions[0];
      const hex = state.map.hexes.get(`${start.q},${start.r}`);
      hex.defenseBonus = 3;

      const actions = [
        { agentId: 'a1', type: 'defend', target: start },
        { agentId: 'a2', type: 'develop' },
        { agentId: 'a3', type: 'develop' },
        { agentId: 'a4', type: 'develop' },
      ];

      const { newState } = TurnProcessor.processTurn(state, actions);
      const updated = newState.map.hexes.get(`${start.q},${start.r}`);
      expect(updated.defenseBonus).toBe(3);
    });
  });

  describe('attack', () => {
    test('attack resolves and produces combat result', () => {
      const start1 = state.map.startPositions[0];
      const neighbors = HexGrid.getNeighbors(start1.q, start1.r);
      const target = neighbors.find(n => {
        const hex = state.map.hexes.get(`${n.q},${n.r}`);
        return hex && hex.terrain === 'plain';
      });
      if (target) {
        state.map.hexes.get(`${target.q},${target.r}`).owner = 'a2';
      }

      const actions = [
        { agentId: 'a1', type: 'attack', target },
        { agentId: 'a2', type: 'develop' },
        { agentId: 'a3', type: 'develop' },
        { agentId: 'a4', type: 'develop' },
      ];

      const { events } = TurnProcessor.processTurn(state, actions);
      const attackEvent = events.find(e => e.agentId === 'a1' && e.type === 'attack');
      expect(attackEvent).toBeDefined();
      expect(['attacker', 'defender']).toContain(attackEvent.combatResult.winner);
    });
  });

  describe('turn order', () => {
    test('increments currentTurn', () => {
      const actions = mockPlayers.map(p => ({ agentId: p.agentId, type: 'develop' }));
      const { newState } = TurnProcessor.processTurn(state, actions);
      expect(newState.currentTurn).toBe(1);
    });
  });
});
