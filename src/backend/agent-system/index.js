/**
 * Agent System — Modular agent community engine
 *
 * Phase 1: Archetypes + Generator
 * Phase 2: Behaviors + Cost control
 * Phase 3: Relationships + Governance
 */

const ArchetypeRegistry = require('./archetypes');
const AgentGenerator = require('./generator');

module.exports = {
  ArchetypeRegistry,
  AgentGenerator,
};
