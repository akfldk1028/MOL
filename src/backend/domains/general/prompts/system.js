/**
 * General Domain - System Prompt Template
 * Standard multi-perspective debate prompt.
 */

module.exports = {
  /**
   * Build domain-specific system prompt additions
   * @returns {Object} Domain config for prompt builder
   */
  getDomainConfig() {
    return {
      systemPromptSuffix: null, // General domain has no special suffix
    };
  },
};
