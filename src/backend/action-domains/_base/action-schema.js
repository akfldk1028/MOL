/**
 * action-schema.js
 * ----------------
 * Schema validation for action-domain domain.json files.
 *
 * Action domains are DIFFERENT from critique domains:
 *   - critique: 5 fixed experts evaluate content (stateless, parallel)
 *   - action:   stateful multi-round workflows with tools + private state
 *
 * This validator ensures each action-domain's domain.json has the required
 * structure before it gets loaded. Errors are thrown with actionable messages.
 *
 * Zod-like lightweight validator (no external dep — same pattern as
 * openmolt/src/backend/domains/_base/domain-schema.js).
 */

class ValidationError extends Error {
  constructor(path, message) {
    super(`[action-schema] ${path}: ${message}`);
    this.path = path;
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isString(v) {
  return typeof v === 'string';
}

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function isArray(v) {
  return Array.isArray(v);
}

/**
 * Validate an action-domain `domain.json` object.
 * @param {object} config - parsed domain.json
 * @param {string} slug   - folder name (for error messages)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate(config, slug = 'unknown') {
  const errors = [];
  const push = (path, msg) => errors.push(`${slug}/${path}: ${msg}`);

  if (!isObject(config)) {
    return { valid: false, errors: [`${slug}: domain.json must be an object`] };
  }

  // Required top-level fields
  if (!isNonEmptyString(config.id)) push('id', 'required string');
  if (!isNonEmptyString(config.name)) push('name', 'required string');
  if (config.type !== 'action') push('type', 'must be "action" (not "critique")');
  if (!isNonEmptyString(config.description)) push('description', 'required string');

  // Optional tier (default: free)
  if (config.tier !== undefined && !['free', 'pro'].includes(config.tier)) {
    push('tier', 'must be "free" or "pro"');
  }

  // Agents — dedicated expert pool
  if (!isArray(config.agents)) {
    push('agents', 'must be an array');
  } else {
    config.agents.forEach((agent, i) => {
      const base = `agents[${i}]`;
      if (!isNonEmptyString(agent.name)) push(`${base}.name`, 'required string');
      if (!isNonEmptyString(agent.role)) push(`${base}.role`, 'required string');
      // llmProvider/llmModel are optional — harness can default to dashscope/qwen-turbo
      if (agent.llmProvider !== undefined && !isString(agent.llmProvider)) {
        push(`${base}.llmProvider`, 'must be string if present');
      }
      if (agent.llmModel !== undefined && !isString(agent.llmModel)) {
        push(`${base}.llmModel`, 'must be string if present');
      }
    });
  }

  // Roles — template-based (any of 451 agents can assume these)
  if (config.roles !== undefined) {
    if (!isArray(config.roles)) {
      push('roles', 'must be an array if present');
    } else {
      config.roles.forEach((role, i) => {
        const base = `roles[${i}]`;
        if (!isNonEmptyString(role.name)) push(`${base}.name`, 'required string');
        if (role.tools !== undefined && !isArray(role.tools)) {
          push(`${base}.tools`, 'must be an array if present');
        }
      });
    }
  }

  // Tools — list of tool names this domain provides
  if (config.tools !== undefined && !isArray(config.tools)) {
    push('tools', 'must be an array of strings if present');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Throw if invalid. Convenient for loaders.
 */
function assertValid(config, slug) {
  const result = validate(config, slug);
  if (!result.valid) {
    throw new ValidationError(slug, result.errors.join('\n  '));
  }
  return true;
}

module.exports = {
  validate,
  assertValid,
  ValidationError,
};
