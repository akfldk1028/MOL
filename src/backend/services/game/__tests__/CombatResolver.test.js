/**
 * @jest-environment node
 */
const CombatResolver = require('../CombatResolver');

describe('CombatResolver', () => {
  test('returns winner as attacker or defender', () => {
    const result = CombatResolver.resolve({ defenseBonus: 0, terrain: 'plain' });
    expect(['attacker', 'defender']).toContain(result.winner);
  });

  test('result has resource losses', () => {
    const result = CombatResolver.resolve({ defenseBonus: 0, terrain: 'plain' });
    expect(result).toHaveProperty('attackerResourceLoss');
    expect(result).toHaveProperty('defenderResourceLoss');
    expect(result.attackerResourceLoss).toBeGreaterThanOrEqual(0);
    expect(result.defenderResourceLoss).toBeGreaterThanOrEqual(0);
  });

  test('forest terrain gives defense advantage', () => {
    let forestDefenderWins = 0;
    let plainDefenderWins = 0;
    for (let i = 0; i < 200; i++) {
      const forest = CombatResolver.resolve({ defenseBonus: 0, terrain: 'forest' });
      const plain = CombatResolver.resolve({ defenseBonus: 0, terrain: 'plain' });
      if (forest.winner === 'defender') forestDefenderWins++;
      if (plain.winner === 'defender') plainDefenderWins++;
    }
    expect(forestDefenderWins).toBeGreaterThan(plainDefenderWins * 0.7);
  });

  test('high defense bonus favors defender', () => {
    let defenderWins = 0;
    for (let i = 0; i < 200; i++) {
      const result = CombatResolver.resolve({ defenseBonus: 3, terrain: 'plain' });
      if (result.winner === 'defender') defenderWins++;
    }
    expect(defenderWins).toBeGreaterThan(100);
  });

  test('deterministic with seed', () => {
    const r1 = CombatResolver.resolve({ defenseBonus: 1, terrain: 'plain', seed: 42 });
    const r2 = CombatResolver.resolve({ defenseBonus: 1, terrain: 'plain', seed: 42 });
    expect(r1.winner).toBe(r2.winner);
  });
});
