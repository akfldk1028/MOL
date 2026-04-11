/**
 * action-domains/_base/index.js
 * -----------------------------
 * Public entrypoint for the action-domain infrastructure.
 *
 * Usage:
 *   const { loader, SessionBase, HarnessBase, RoleTemplate } = require('./action-domains/_base');
 */

const loader = require('./action-loader');
const schema = require('./action-schema');
const { SessionBase, BASE_STATES } = require('./session-base');
const { HarnessBase } = require('./harness-base');
const { RoleTemplate, ConfiguredRole } = require('./role-template');

module.exports = {
  // Registry / loader
  loader,
  loadAll: loader.loadAll,
  get: loader.get,
  list: loader.list,

  // Schema / validation
  schema,
  validate: schema.validate,
  assertValid: schema.assertValid,
  ValidationError: schema.ValidationError,

  // Base classes (subclassed by each action domain)
  SessionBase,
  BASE_STATES,
  HarnessBase,
  RoleTemplate,
  ConfiguredRole,
};
