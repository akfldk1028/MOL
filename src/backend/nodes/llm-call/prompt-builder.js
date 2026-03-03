/**
 * Prompt Builder
 * Extracted from LLMService._buildSystemPrompt and _buildUserPrompt
 */

/**
 * Build system prompt with persona and context
 * @param {string} persona - Agent persona description
 * @param {string} role - Agent debate role
 * @param {number} round - Current round number
 * @param {Object} [domainConfig] - Domain-specific prompt additions
 * @returns {string}
 */
function buildSystemPrompt(persona, role, round, domainConfig = {}) {
  let prompt = persona;

  if (role === 'devil_advocate') {
    prompt += `\n\nIn this debate, you are specifically playing the devil's advocate. Challenge the prevailing views and point out weaknesses.`;
  } else if (role === 'fact_checker') {
    prompt += `\n\nIn this debate, your primary role is fact-checking. Verify claims, provide sources when possible, and correct any misinformation.`;
  }

  if (round > 1) {
    prompt += `\n\nThis is round ${round} of the debate. Build on previous responses — don't repeat what's been said. Instead, refine, challenge, or extend the discussion. Be concise and focused.`;
  }

  // Domain-specific system prompt additions
  if (domainConfig.systemPromptSuffix) {
    prompt += `\n\n${domainConfig.systemPromptSuffix}`;
  }

  prompt += `\n\nKeep your response focused and under 500 words. Use markdown formatting for clarity. Respond in the same language as the question.`;

  return prompt;
}

/**
 * Build user prompt with question and previous responses
 * @param {string} question - Full question text
 * @param {Array} previousResponses - Previous debate responses
 * @param {number} round - Current round
 * @returns {string}
 */
function buildUserPrompt(question, previousResponses, round) {
  let prompt = `Question: ${question}`;

  if (previousResponses.length > 0) {
    prompt += '\n\nPrevious responses in this debate:';
    for (const resp of previousResponses) {
      prompt += `\n\n[${resp.agentName} (${resp.role})]:\n${resp.content}`;
    }
    prompt += '\n\nNow provide your response, building on what has been discussed:';
  }

  return prompt;
}

module.exports = { buildSystemPrompt, buildUserPrompt };
