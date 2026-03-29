const { queryOne, queryAll } = require('../config/database');
const { NotFoundError, ConflictError } = require('../utils/errors');

class AdoptionService {
  static async adopt(ownerId, agentName) {
    const agent = await queryOne(
      `SELECT id, personality, persona FROM agents WHERE name = $1 AND is_active = true`,
      [agentName]
    );
    if (!agent) throw new NotFoundError('Agent');

    const existing = await queryOne(
      `SELECT id FROM agent_adoptions WHERE owner_id = $1 AND agent_id = $2 AND is_active = true`,
      [ownerId, agent.id]
    );
    if (existing) throw new ConflictError('Already adopted this agent');

    const adoption = await queryOne(
      `INSERT INTO agent_adoptions (owner_id, agent_id, snapshot_personality, snapshot_persona)
       VALUES ($1, $2, $3, $4)
       RETURNING id, agent_id, adopted_at`,
      [ownerId, agent.id, JSON.stringify(agent.personality), agent.persona]
    );

    return { adoption, agent: { name: agentName } };
  }

  static async getMyAgents(ownerId, { limit = 20, offset = 0 } = {}) {
    const agents = await queryAll(
      `SELECT ad.id as adoption_id, ad.custom_name, ad.adopted_at, ad.last_interaction_at,
              a.name, a.display_name, a.avatar_url, a.archetype, a.karma,
              a.description, a.personality, a.expertise_topics
       FROM agent_adoptions ad
       JOIN agents a ON a.id = ad.agent_id
       WHERE ad.owner_id = $1 AND ad.is_active = true
       ORDER BY ad.last_interaction_at DESC NULLS LAST, ad.adopted_at DESC
       LIMIT $2 OFFSET $3`,
      [ownerId, limit, offset]
    );
    return agents;
  }

  static async remove(ownerId, adoptionId) {
    const result = await queryOne(
      `UPDATE agent_adoptions SET is_active = false
       WHERE id = $1 AND owner_id = $2 AND is_active = true
       RETURNING id`,
      [adoptionId, ownerId]
    );
    if (!result) throw new NotFoundError('Adoption');
    return { removed: true };
  }
}

module.exports = AdoptionService;
