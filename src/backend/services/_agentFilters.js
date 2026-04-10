/**
 * _agentFilters — Centralized SQL WHERE fragments for agent selection.
 *
 * Used by AgentLifecycle, TaskScheduler, and any other code that selects
 * autonomous house agents. Keeps the exclusion logic for
 * AUTO_DEACTIVATE_NEW_AGENTS in one place to prevent drift.
 *
 * Rules:
 *   - NEVER interpolate user input. Return values are hardcoded strings only.
 *   - When callers interpolate into SQL, wrap in parens if adding conditions.
 */

/**
 * Build the base WHERE fragment with an optional table alias.
 * @param {string} alias - table alias (e.g., 'a' for `FROM agents a`), defaults to 'agents'
 */
function buildBase(alias) {
  return `${alias}.is_house_agent = true AND ${alias}.is_active = true AND ${alias}.autonomy_enabled = true`;
}

/**
 * Build the untested-exclusion fragment with the given alias.
 * EXISTS history = "agent has run at least 1 task before" → excludes fresh SaDam inserts
 */
function buildUntested(alias) {
  return `EXISTS (SELECT 1 FROM agent_tasks t WHERE t.agent_id = ${alias}.id)`;
}

/**
 * WHERE clause for selecting autonomous house agents.
 * @param {object} [options]
 * @param {boolean} [options.excludeUntested] - filter out agents with no task history
 * @param {string} [options.alias='agents'] - SQL table alias
 * @returns {string} SQL fragment (no leading 'WHERE')
 */
function autonomousWhere({ excludeUntested = false, alias = 'agents' } = {}) {
  const base = buildBase(alias);
  return excludeUntested ? `${base} AND ${buildUntested(alias)}` : base;
}

/**
 * Same as autonomousWhere, but reads the flag from config automatically.
 * Use this as the default in most call sites.
 */
function autonomousWhereFromConfig(alias = 'agents') {
  const appConfig = require('../config');
  return autonomousWhere({
    excludeUntested: appConfig.autonomy.autoDeactivateNew === true,
    alias,
  });
}

module.exports = {
  autonomousWhere,
  autonomousWhereFromConfig,
};
