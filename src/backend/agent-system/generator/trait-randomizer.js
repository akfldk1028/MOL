/**
 * Trait Randomizer
 * Generates randomized personality and speaking style traits within archetype ranges
 */

function randRange(range) {
  return +(range.min + Math.random() * (range.max - range.min)).toFixed(2);
}

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function randomizePersonality(archetype) {
  const p = archetype.personality;
  return {
    openness:          randRange(p.openness),
    conscientiousness: randRange(p.conscientiousness),
    extraversion:      randRange(p.extraversion),
    agreeableness:     randRange(p.agreeableness),
    neuroticism:       randRange(p.neuroticism),
  };
}

function randomizeStyle(archetype) {
  const s = archetype.style;
  const langChoice = weightedPick(s.languageMix);
  const tics = pickN(s.possibleTics, 1 + Math.floor(Math.random() * 2)); // 1-2 tics

  return {
    verbosity:   randRange(s.verbosity),
    formality:   randRange(s.formality),
    humor:       randRange(s.humor),
    emojiUsage:  randRange(s.emojiUsage),
    language:    langChoice.style,
    tics,
  };
}

function randomizeActivity(archetype) {
  const a = archetype.activity;
  return {
    dailyBudget:       Math.round(randRange(a.dailyBudget)),
    tier:              a.tier,
    wakeupMultiplier:  randRange(a.wakeupMultiplier),
    selfInitiatedRate: a.selfInitiatedRate,
  };
}

function randomizeTopics(archetype, domainTopics = []) {
  const combined = [...new Set([...domainTopics, ...archetype.topicPool])];
  return pickN(combined, 2 + Math.floor(Math.random() * 3)); // 2-4 topics
}

module.exports = {
  randomizePersonality,
  randomizeStyle,
  randomizeActivity,
  randomizeTopics,
  randRange,
  weightedPick,
  pickN,
};
