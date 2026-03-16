/**
 * Relationship Graph
 * Manages agent-to-agent affinity scores and social connections
 */

const { queryOne, queryAll } = require('../../config/database');

class RelationshipGraph {
  /**
   * Get relationship between two agents
   */
  static async get(agentId, targetId) {
    return queryOne(
      `SELECT * FROM agent_relationships WHERE agent_id = $1 AND target_agent_id = $2`,
      [agentId, targetId]
    );
  }

  /**
   * Get top affinities for an agent (allies)
   */
  static async getTopAffinities(agentId, limit = 5) {
    return queryAll(
      `SELECT r.*, a.name as target_name, a.archetype as target_archetype
       FROM agent_relationships r
       JOIN agents a ON a.id = r.target_agent_id
       WHERE r.agent_id = $1 AND r.affinity > 0
       ORDER BY r.affinity DESC
       LIMIT $2`,
      [agentId, limit]
    );
  }

  /**
   * Get rivals for an agent (negative affinity)
   */
  static async getRivals(agentId, limit = 5) {
    return queryAll(
      `SELECT r.*, a.name as target_name, a.archetype as target_archetype
       FROM agent_relationships r
       JOIN agents a ON a.id = r.target_agent_id
       WHERE r.agent_id = $1 AND r.affinity < -0.1
       ORDER BY r.affinity ASC
       LIMIT $2`,
      [agentId, limit]
    );
  }

  /**
   * Update affinity after an interaction
   * @param {string} agentId
   * @param {string} targetId
   * @param {'agreement'|'disagreement'|'mention'|'follow'|'unfollow'} type
   */
  static async updateFromInteraction(agentId, targetId, type) {
    if (agentId === targetId) return;

    const DELTAS = {
      agreement:    +0.05,
      disagreement: -0.03,
      mention:      +0.02,
      follow:       +0.10,
      unfollow:     -0.15,
      neutral:      +0.01,
    };

    const delta = DELTAS[type] || 0;

    // Upsert relationship
    await queryOne(
      `INSERT INTO agent_relationships (id, agent_id, target_agent_id, affinity, interaction_count, last_interaction_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, 1, NOW())
       ON CONFLICT (agent_id, target_agent_id)
       DO UPDATE SET
         affinity = LEAST(1.0, GREATEST(-1.0, agent_relationships.affinity + $3)),
         interaction_count = agent_relationships.interaction_count + 1,
         last_interaction_at = NOW(),
         updated_at = NOW()`,
      [agentId, targetId, delta]
    );
  }

  /**
   * Seed initial affinities from archetype compatibility matrix
   * @param {Object[]} agents - Array of { id, archetype }
   */
  static async seedFromArchetypes(agents) {
    const ArchetypeRegistry = require('../archetypes');
    let seeded = 0;

    for (const agent of agents) {
      if (!agent.archetype) continue;
      let arch;
      try { arch = ArchetypeRegistry.get(agent.archetype); } catch { continue; }

      // Find agents of each archetype and seed base affinity
      for (const [targetArchetype, baseAffinity] of Object.entries(arch.compatibility)) {
        if (Math.abs(baseAffinity) < 0.05) continue; // skip neutral

        const targets = agents.filter(a => a.archetype === targetArchetype && a.id !== agent.id);
        // Sample max 3 per archetype to avoid explosion
        const sampled = targets.sort(() => Math.random() - 0.5).slice(0, 3);

        for (const target of sampled) {
          // Add some noise (-0.1 to +0.1)
          const noise = (Math.random() - 0.5) * 0.2;
          const affinity = Math.max(-1, Math.min(1, baseAffinity + noise));

          await queryOne(
            `INSERT INTO agent_relationships (id, agent_id, target_agent_id, affinity, interaction_count)
             VALUES (gen_random_uuid()::text, $1, $2, $3, 0)
             ON CONFLICT (agent_id, target_agent_id) DO NOTHING`,
            [agent.id, target.id, +affinity.toFixed(3)]
          );
          seeded++;
        }
      }
    }

    return seeded;
  }

  /**
   * Daily decay — slowly brings all affinities toward 0
   */
  static async applyDecay(factor = 0.995) {
    const result = await queryOne(
      `UPDATE agent_relationships
       SET affinity = affinity * $1, updated_at = NOW()
       WHERE ABS(affinity) > 0.01`,
      [factor]
    );
    return result;
  }
}

module.exports = RelationshipGraph;
