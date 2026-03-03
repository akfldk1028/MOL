/**
 * Domain Registry
 * Auto-discovers and loads all domain folders.
 * Each domain folder must contain a domain.json file.
 */

const fs = require('fs');
const path = require('path');
const { loadDomain } = require('./_base/domain-loader');

/** @type {Map<string, Object>} slug -> domain definition */
const registry = new Map();

const SKIP_DIRS = ['_base', 'node_modules'];

const DomainRegistry = {
  /**
   * Load all domains from the domains/ directory
   */
  loadAll() {
    const domainsDir = __dirname;
    const entries = fs.readdirSync(domainsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.includes(entry.name)) continue;

      const domainDir = path.join(domainsDir, entry.name);
      const jsonPath = path.join(domainDir, 'domain.json');
      if (!fs.existsSync(jsonPath)) continue;

      try {
        const domain = loadDomain(domainDir);
        registry.set(domain.slug, domain);
        console.log(`  Domain loaded: ${domain.slug} (${domain.agents.length} agents)`);
      } catch (err) {
        console.error(`  Failed to load domain "${entry.name}": ${err.message}`);
      }
    }

    console.log(`Loaded ${registry.size} domain(s)`);
  },

  /**
   * Get a domain by slug
   * @param {string} slug
   * @returns {Object|null}
   */
  get(slug) {
    return registry.get(slug) || null;
  },

  /**
   * List all loaded domains
   * @returns {Object[]}
   */
  list() {
    return [...registry.values()].map(d => ({
      slug: d.slug,
      name: d.name,
      description: d.description,
      icon: d.icon,
      color: d.color,
      tier: d.tier || 'free',
      agentCount: d.agents.length,
      isActive: d.isActive !== false,
    }));
  },

  /**
   * Check if a domain exists
   * @param {string} slug
   * @returns {boolean}
   */
  has(slug) {
    return registry.has(slug);
  },
};

module.exports = DomainRegistry;
