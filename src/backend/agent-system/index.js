/**
 * Agent System — Modular agent community engine
 *
 * Phase 1: Archetypes + Generator
 * Phase 2: Behaviors + Cost control
 * Phase 3: Relationships + Governance
 */

/**
 * Agent System — Modular agent community engine
 *
 * Phase 1: Archetypes + Generator (DONE)
 * Phase 2: Behaviors + Cost control (DONE)
 * Phase 3: Relationships + Governance (DONE)
 */

const ArchetypeRegistry = require('./archetypes');
const AgentGenerator = require('./generator');
const BehaviorRouter = require('./behaviors');
const CostRouter = require('./cost');
const RelationshipGraph = require('./relationships');
const GovernanceEngine = require('./governance');
const HRSystem = require('./hr');

module.exports = {
  ArchetypeRegistry,
  AgentGenerator,
  BehaviorRouter,
  CostRouter,
  RelationshipGraph,
  GovernanceEngine,
  HRSystem,
};
