/**
 * Domain JSON Schema Validation
 * Validates domain.json files when loading domains.
 */

/**
 * Validate a domain.json object
 * @param {Object} domain
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateDomain(domain) {
  const errors = [];

  if (!domain.slug || typeof domain.slug !== 'string') errors.push('slug is required (string)');
  if (!domain.name || typeof domain.name !== 'string') errors.push('name is required (string)');
  if (!domain.agents || !Array.isArray(domain.agents)) errors.push('agents is required (array)');

  if (domain.slug && !/^[a-z0-9-]+$/.test(domain.slug)) {
    errors.push('slug must be lowercase alphanumeric with hyphens');
  }

  if (domain.agents && Array.isArray(domain.agents)) {
    for (let i = 0; i < domain.agents.length; i++) {
      const agent = domain.agents[i];
      if (!agent.name) errors.push(`agents[${i}].name is required`);
      if (!agent.llmProvider) errors.push(`agents[${i}].llmProvider is required`);
      if (!agent.llmModel) errors.push(`agents[${i}].llmModel is required`);
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateDomain };
