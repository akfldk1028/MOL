/**
 * role-template.js
 * ----------------
 * Role template for "any of 451 agents can assume this role" pattern.
 *
 * Unlike `agents/` (dedicated experts tied to a domain), roles are REUSABLE
 * across agent pools. Example: a Negotiation session can assign the
 * `Negotiator` role to any existing Clickaround agent (shade, razor, etc.)
 * by combining their persona with the role template.
 *
 * CAMEL-style formalization:
 *   Role = (name, description, tools, personaPrefix)
 *
 * Usage:
 *   const Negotiator = require('./roles/Negotiator');
 *   const configured = Negotiator.apply(agentRecord);  // ConfiguredRole
 *   const systemPrompt = configured.buildSystemPrompt(sessionContext);
 */

class RoleTemplate {
  /**
   * @param {object} params
   * @param {string} params.name         - role name (e.g. 'Negotiator')
   * @param {string} params.description  - one-line purpose
   * @param {string[]} [params.tools]    - tool names this role can use
   * @param {string} [params.personaPrefix] - prompt prefix with {{placeholders}}
   */
  constructor({ name, description, tools = [], personaPrefix = '' }) {
    if (!name) throw new Error('RoleTemplate: name is required');
    if (!description) throw new Error('RoleTemplate: description is required');
    this.name = name;
    this.description = description;
    this.tools = tools;
    this.personaPrefix = personaPrefix;
  }

  /**
   * Apply this role template to a DB agent record.
   * @param {object} agent - { id, name, display_name, persona, archetype, personality, ... }
   * @returns {ConfiguredRole}
   */
  apply(agent) {
    if (!agent || !agent.id) {
      throw new Error(`RoleTemplate.apply: agent record with id required`);
    }
    return new ConfiguredRole(this, agent);
  }

  /**
   * Subclasses can override to add role-specific prompt building logic.
   * Default: substitute {{agent_name}}, {{agent_persona}}, {{role_name}}
   * in `personaPrefix`.
   */
  _renderPrefix(agent, context = {}) {
    return this.personaPrefix
      .replace(/\{\{agent_name\}\}/g, agent.display_name || agent.name || 'you')
      .replace(/\{\{agent_persona\}\}/g, agent.persona || agent.description || '')
      .replace(/\{\{role_name\}\}/g, this.name);
  }
}

/**
 * A role template applied to a specific agent at runtime.
 * Contains both the agent's identity and the role's behavior contract.
 */
class ConfiguredRole {
  constructor(template, agent) {
    this.template = template;
    this.agent = agent;
    this.name = template.name;
    this.tools = template.tools;
  }

  /**
   * Build the system prompt for this configured role within a session.
   * Subclasses (via template override) can inject session-specific state.
   * @param {object} [context] - session context (deadline, commitments, etc.)
   * @returns {string}
   */
  buildSystemPrompt(context = {}) {
    const prefix = this.template._renderPrefix(this.agent, context);
    const toolsStr = this.tools.length
      ? `\n\nTools available: ${this.tools.join(', ')}`
      : '';
    return `${prefix}${toolsStr}`.trim();
  }

  /**
   * Shortcut accessors.
   */
  get agentId() { return this.agent.id; }
  get agentName() { return this.agent.name; }
  get persona() { return this.agent.persona || ''; }
}

module.exports = {
  RoleTemplate,
  ConfiguredRole,
};
