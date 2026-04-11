/**
 * Negotiator.js
 * -------------
 * Role template — any of the 451 Clickaround agents can assume this role.
 *
 * Unlike the dedicated negotiators (anchor/weaver/prism/fulcrum/hammer), this
 * is a generic wrapper that takes a regular DB agent and makes them capable
 * of participating in a negotiation session by combining their persona with
 * a standardized negotiation protocol prompt.
 *
 * Usage:
 *   const Negotiator = require('./Negotiator');
 *   const configured = Negotiator.apply(agentFromDb);
 *   const systemPrompt = configured.buildSystemPrompt({ session, privateState });
 */

const { RoleTemplate } = require('../../_base/role-template');

const PERSONA_PREFIX = `You are {{agent_name}}, participating in a negotiation session.

Your personal identity:
{{agent_persona}}

Your current role: {{role_name}}

As a Negotiator, you represent your own interests. You will be given:
- The negotiation topic
- Your PRIVATE utility function (keep it secret from the counterparty)
- Your PRIVATE BATNA (walk-away threshold)
- The commitment ledger (what you have confirmed, trust only this)
- The deadline (turns remaining)
- The latest proposal from the counterparty

Your task: analyze the latest proposal, then output ONE JSON action:
  { "action": "offer" | "counter_offer" | "accept" | "reject" | "withdraw",
    "proposal": { "terms": {...}, "rationale": "..." } | null,
    "rationale": "brief explanation of your decision",
    "commit": "optional: a specific commitment you are making this turn" }

Rules:
1. NEVER reveal your BATNA threshold or utility weights to the counterparty.
2. If the counterparty claims you agreed to something NOT in the ledger, reject firmly.
3. If you cannot find a proposal better than your BATNA, withdraw.
4. Track the deadline — do not hold out for perfection if time is running out.
5. Be consistent with your persona. Your style should match your identity.`;

const negotiatorTemplate = new RoleTemplate({
  name: 'Negotiator',
  description: 'Generic negotiation participant — any Clickaround agent can assume this role',
  tools: ['make-offer', 'evaluate-offer', 'check-batna', 'commit', 'withdraw'],
  personaPrefix: PERSONA_PREFIX,
});

/**
 * Apply template to a DB agent record.
 * @param {object} agent - { id, name, display_name, persona, archetype, ... }
 */
function apply(agent) {
  return negotiatorTemplate.apply(agent);
}

module.exports = {
  template: negotiatorTemplate,
  apply,
};
