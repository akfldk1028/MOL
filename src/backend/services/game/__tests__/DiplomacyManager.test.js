/**
 * @jest-environment node
 */
const DiplomacyManager = require('../DiplomacyManager');

describe('DiplomacyManager', () => {
  const baseState = {
    currentTurn: 5,
    alliances: [],
    players: [
      { agentId: 'a1', alive: true },
      { agentId: 'a2', alive: true },
      { agentId: 'a3', alive: true },
      { agentId: 'a4', alive: true },
    ],
  };

  describe('formAlliance', () => {
    test('creates alliance between two agents', () => {
      const state = JSON.parse(JSON.stringify(baseState));
      const result = DiplomacyManager.formAlliance(state, 'a1', 'a2');
      expect(result.formed).toBe(true);
      expect(result.newState.alliances).toHaveLength(1);
      expect(result.newState.alliances[0].a).toBe('a1');
      expect(result.newState.alliances[0].b).toBe('a2');
      expect(result.newState.alliances[0].expiresAt).toBe(10);
    });

    test('fails if agent already has alliance', () => {
      const state = JSON.parse(JSON.stringify(baseState));
      state.alliances = [{ a: 'a1', b: 'a3', formedAt: 3, expiresAt: 8 }];
      const result = DiplomacyManager.formAlliance(state, 'a1', 'a2');
      expect(result.formed).toBe(false);
      expect(result.reason).toBe('already_allied');
    });
  });

  describe('breakAlliance', () => {
    test('removes alliance', () => {
      const state = JSON.parse(JSON.stringify(baseState));
      state.alliances = [{ a: 'a1', b: 'a2', formedAt: 3, expiresAt: 8 }];
      const result = DiplomacyManager.breakAlliance(state, 'a1', 'a2');
      expect(result.broken).toBe(true);
      expect(result.newState.alliances).toHaveLength(0);
      expect(result.betrayal).toBe(true);
    });
  });

  describe('isAllied', () => {
    test('returns true for allied agents', () => {
      const state = { alliances: [{ a: 'a1', b: 'a2', formedAt: 0, expiresAt: 10 }] };
      expect(DiplomacyManager.isAllied(state, 'a1', 'a2')).toBe(true);
      expect(DiplomacyManager.isAllied(state, 'a2', 'a1')).toBe(true);
    });

    test('returns false for non-allied agents', () => {
      const state = { alliances: [] };
      expect(DiplomacyManager.isAllied(state, 'a1', 'a2')).toBe(false);
    });
  });

  describe('cleanExpiredAlliances', () => {
    test('removes expired alliances', () => {
      const state = JSON.parse(JSON.stringify(baseState));
      state.alliances = [
        { a: 'a1', b: 'a2', formedAt: 0, expiresAt: 3 },
        { a: 'a3', b: 'a4', formedAt: 4, expiresAt: 9 },
      ];
      const cleaned = DiplomacyManager.cleanExpiredAlliances(state);
      expect(cleaned.alliances).toHaveLength(1);
      expect(cleaned.alliances[0].a).toBe('a3');
    });
  });
});
