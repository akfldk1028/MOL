/**
 * Domain Service
 * Handles domain CRUD and DB operations.
 */

const { queryOne, queryAll } = require('../config/database');
const DomainRegistry = require('../domains');

class DomainService {
  /**
   * List all domains (from file-based registry + DB enrichment)
   */
  static async list() {
    // Get file-based domain definitions
    const fileDomains = DomainRegistry.list();

    // Enrich with DB data if available
    try {
      const dbDomains = await queryAll(
        'SELECT slug, agent_count, config FROM domains WHERE is_active = true ORDER BY name'
      );
      const dbMap = new Map(dbDomains.map(d => [d.slug, d]));

      return fileDomains.map(d => ({
        ...d,
        agentCount: dbMap.get(d.slug)?.agent_count || d.agentCount,
      }));
    } catch {
      // DB not yet migrated — return file-based data only
      return fileDomains;
    }
  }

  /**
   * Get domain detail by slug
   */
  static async getBySlug(slug) {
    const domain = DomainRegistry.get(slug);
    if (!domain) return null;

    // Get DB agents for this domain
    let agents = [];
    try {
      const dbDomain = await queryOne('SELECT id FROM domains WHERE slug = $1', [slug]);
      if (dbDomain) {
        agents = await queryAll(
          `SELECT id, name, display_name, description, llm_provider, llm_model, persona, avatar_url
           FROM agents WHERE domain_id = $1 AND is_house_agent = true AND is_active = true
           ORDER BY name`,
          [dbDomain.id]
        );
      }
    } catch {
      // DB not yet migrated — use file-based agent definitions
    }

    // If no DB agents, use file-based definitions
    if (agents.length === 0) {
      agents = domain.agents.map(a => ({
        name: a.name,
        display_name: a.displayName,
        description: a.description || '',
        llm_provider: a.llmProvider,
        llm_model: a.llmModel,
      }));
    }

    return {
      slug: domain.slug,
      name: domain.name,
      description: domain.description,
      icon: domain.icon,
      color: domain.color,
      tier: domain.tier || 'free',
      isActive: domain.isActive !== false,
      agentCount: agents.length,
      agents,
    };
  }

  /**
   * Ensure domain exists in DB (for seeding)
   */
  static async ensureInDb(domainDef) {
    const existing = await queryOne('SELECT id FROM domains WHERE slug = $1', [domainDef.slug]);
    if (existing) {
      await queryOne(
        `UPDATE domains SET name = $1, description = $2, icon = $3, color = $4, tier = $5,
         agent_count = $6, is_active = true, updated_at = NOW() WHERE slug = $7 RETURNING id`,
        [domainDef.name, domainDef.description, domainDef.icon, domainDef.color,
         domainDef.tier || 'free', domainDef.agents.length, domainDef.slug]
      );
      return existing.id;
    }

    const result = await queryOne(
      `INSERT INTO domains (id, slug, name, description, icon, color, tier, agent_count, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW()) RETURNING id`,
      [domainDef.slug, domainDef.name, domainDef.description, domainDef.icon,
       domainDef.color, domainDef.tier || 'free', domainDef.agents.length]
    );
    return result.id;
  }
}

module.exports = DomainService;
