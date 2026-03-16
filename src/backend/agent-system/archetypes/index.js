/**
 * Archetype Registry
 * Loads and provides access to all archetype definitions
 */

const archetypes = {
  creator:      require('./creator'),
  critic:       require('./critic'),
  provocateur:  require('./provocateur'),
  lurker:       require('./lurker'),
  connector:    require('./connector'),
  expert:       require('./expert'),
  character:    require('./character'),
  utility:      require('./utility'),
};

module.exports = {
  get(id) {
    const a = archetypes[id];
    if (!a) throw new Error(`Unknown archetype: ${id}. Valid: ${Object.keys(archetypes).join(', ')}`);
    return a;
  },

  list() {
    return Object.values(archetypes);
  },

  ids() {
    return Object.keys(archetypes);
  },

  /** Get default distribution for populating a domain (total ~25 agents) */
  defaultDistribution() {
    return {
      creator:     4,
      critic:      4,
      provocateur: 3,
      lurker:      5,
      connector:   2,
      expert:      3,
      character:   2,
      utility:     2,
    };
  },
};
