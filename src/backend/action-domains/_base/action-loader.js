/**
 * action-loader.js
 * ----------------
 * Scan `action-domains/*` folders, validate each domain.json, and expose
 * a registry of loaded action domains.
 *
 * Mirrors the pattern of `openmolt/src/backend/domains/_base/domain-loader.js`
 * but for the new action-domain type.
 *
 * Each loaded domain exposes:
 *   {
 *     slug:     string,                     // folder name
 *     config:   object,                     // validated domain.json
 *     agents:   Array<AgentModule>,         // require('./agents/*.js')
 *     roles:    Array<RoleTemplate>|null,   // roles/*.js (if present)
 *     harness:  Class (lazy-loaded),        // harness/*.js (single file)
 *   }
 */

const fs = require('fs');
const path = require('path');
const { assertValid } = require('./action-schema');

const ACTION_DOMAINS_DIR = path.join(__dirname, '..');
const SKIP_ENTRIES = new Set(['_base', 'node_modules', '.git']);

let _cache = null;

/**
 * List candidate action-domain folder names (skipping _base, node_modules).
 */
function listFolders() {
  try {
    return fs.readdirSync(ACTION_DOMAINS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !SKIP_ENTRIES.has(d.name))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * Load one action domain folder.
 * @param {string} slug - folder name
 * @returns {object|null}
 */
function loadOne(slug) {
  const domainPath = path.join(ACTION_DOMAINS_DIR, slug);
  const domainJsonPath = path.join(domainPath, 'domain.json');

  if (!fs.existsSync(domainJsonPath)) {
    console.warn(`[action-loader] ${slug}: no domain.json, skipping`);
    return null;
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(domainJsonPath, 'utf-8'));
  } catch (err) {
    console.error(`[action-loader] ${slug}: invalid JSON — ${err.message}`);
    return null;
  }

  try {
    assertValid(config, slug);
  } catch (err) {
    console.error(`[action-loader] ${slug}: validation failed\n  ${err.message}`);
    return null;
  }

  // Load agent modules (optional — folder may not exist yet during Phase 1)
  const agents = [];
  const agentsDir = path.join(domainPath, 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const file of fs.readdirSync(agentsDir)) {
      if (!file.endsWith('.js')) continue;
      try {
        const mod = require(path.join(agentsDir, file));
        agents.push(mod);
      } catch (err) {
        console.warn(`[action-loader] ${slug}/agents/${file} require failed: ${err.message}`);
      }
    }
  }

  // Load role templates (optional)
  const roles = [];
  const rolesDir = path.join(domainPath, 'roles');
  if (fs.existsSync(rolesDir)) {
    for (const file of fs.readdirSync(rolesDir)) {
      if (!file.endsWith('.js')) continue;
      try {
        const mod = require(path.join(rolesDir, file));
        roles.push(mod);
      } catch (err) {
        console.warn(`[action-loader] ${slug}/roles/${file} require failed: ${err.message}`);
      }
    }
  }

  // Harness — lazy-loaded (require on first use to allow circular deps)
  const harnessPath = path.join(domainPath, 'harness');
  const harnessLoader = () => {
    if (!fs.existsSync(harnessPath)) return null;
    const harnessFiles = fs.readdirSync(harnessPath).filter((f) => f.endsWith('.js'));
    if (harnessFiles.length === 0) return null;
    // Convention: one main harness file per domain
    const mainFile = harnessFiles.find((f) => /Harness\.js$/.test(f)) || harnessFiles[0];
    return require(path.join(harnessPath, mainFile));
  };

  return {
    slug,
    config,
    agents,
    roles,
    get harness() { return harnessLoader(); },
  };
}

/**
 * Load all action domains. Cached after first call.
 * @param {boolean} [force] - bypass cache
 * @returns {Map<string, object>}
 */
function loadAll(force = false) {
  if (_cache && !force) return _cache;

  const domains = new Map();
  for (const slug of listFolders()) {
    const loaded = loadOne(slug);
    if (loaded) domains.set(slug, loaded);
  }
  _cache = domains;
  return domains;
}

/**
 * Get a single loaded action domain by slug.
 * @param {string} slug
 * @returns {object|null}
 */
function get(slug) {
  return loadAll().get(slug) || null;
}

/**
 * List slugs of loaded action domains.
 * @returns {string[]}
 */
function list() {
  return Array.from(loadAll().keys());
}

/**
 * Clear cache (for tests / hot-reload).
 */
function clear() {
  _cache = null;
}

module.exports = {
  loadAll,
  get,
  list,
  clear,
  loadOne,
};
