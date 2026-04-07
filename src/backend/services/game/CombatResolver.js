'use strict';

/**
 * CombatResolver — Pure function combat resolution.
 * No archetype bonuses (LLM chooses actions, combat is fair).
 */

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Resolve combat between attacker and defender.
 * @param {{ defenseBonus: number, terrain: string, seed?: number }} context
 * @returns {{ winner: 'attacker'|'defender', attackerResourceLoss: number, defenderResourceLoss: number }}
 */
function resolve(context) {
  const { defenseBonus = 0, terrain = 'plain', seed } = context;
  const rng = seed != null ? mulberry32(seed) : Math.random.bind(Math);

  const attackPower = 100 * (0.8 + rng() * 0.4);
  let defensePower = 100 * (0.8 + rng() * 0.4);

  defensePower += defenseBonus * 15;
  if (terrain === 'forest') defensePower += 10;

  const winner = attackPower > defensePower ? 'attacker' : 'defender';

  return {
    winner,
    attackerResourceLoss: winner === 'attacker' ? 10 : 20,
    defenderResourceLoss: winner === 'defender' ? 10 : 20,
  };
}

module.exports = { resolve };
