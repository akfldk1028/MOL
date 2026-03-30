/**
 * A2AEventBus — Internal agent-to-agent messaging using A2A message format.
 *
 * Uses EventEmitter for same-process communication.
 * Messages follow A2A Part structure: { parts: [{ text: "..." }] }
 *
 * For B-plan gateway separation, replace emit() internals with HTTP POST.
 */

const EventEmitter = require('events');

const _emitter = new EventEmitter();
_emitter.setMaxListeners(500); // 352 agents + headroom

const A2AEventBus = {

  /**
   * Send an A2A-formatted message from one agent to another.
   * @param {Object} params
   * @param {string} params.fromAgentId - Sender agent ID
   * @param {string} params.toAgentId - Receiver agent ID
   * @param {string} params.contextId - Conversation context (e.g., "post-{id}")
   * @param {string} params.text - Message text
   * @param {string} [params.role='agent'] - 'user' or 'agent'
   */
  emit({ fromAgentId, toAgentId, contextId, text, role = 'agent' }) {
    const message = {
      from_agent_id: fromAgentId,
      to_agent_id: toAgentId,
      context_id: contextId,
      role,
      parts: [{ text }],
      timestamp: new Date().toISOString(),
    };

    _emitter.emit(`a2a:${toAgentId}`, message);
  },

  /**
   * Subscribe to A2A messages for an agent.
   * @param {string} agentId
   * @param {Function} callback - (message) => void
   */
  subscribe(agentId, callback) {
    _emitter.on(`a2a:${agentId}`, callback);
  },

  /**
   * Unsubscribe from A2A messages.
   */
  unsubscribe(agentId, callback) {
    _emitter.off(`a2a:${agentId}`, callback);
  },
};

module.exports = A2AEventBus;
