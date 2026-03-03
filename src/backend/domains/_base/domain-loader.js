/**
 * Domain Loader
 * Reads and validates domain.json files from domain folders.
 */

const fs = require('fs');
const path = require('path');
const { validateDomain } = require('./domain-schema');

/**
 * Load a domain definition from a folder
 * @param {string} domainDir - Absolute path to the domain folder
 * @returns {Object} Parsed and validated domain definition
 */
function loadDomain(domainDir) {
  const jsonPath = path.join(domainDir, 'domain.json');

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`domain.json not found in ${domainDir}`);
  }

  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const domain = JSON.parse(raw);

  const { valid, errors } = validateDomain(domain);
  if (!valid) {
    throw new Error(`Invalid domain.json in ${domainDir}: ${errors.join(', ')}`);
  }

  // Load workflow.json if present
  const workflowPath = path.join(domainDir, 'workflow.json');
  if (fs.existsSync(workflowPath)) {
    domain.workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
  }

  // Load agent modules if agents/ folder exists
  const agentsDir = path.join(domainDir, 'agents');
  if (fs.existsSync(agentsDir)) {
    const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.js'));
    domain.agentModules = agentFiles.map(f => require(path.join(agentsDir, f)));
  }

  // Load prompts if prompts/ folder exists
  const promptsDir = path.join(domainDir, 'prompts');
  if (fs.existsSync(promptsDir)) {
    domain.prompts = {};
    if (fs.existsSync(path.join(promptsDir, 'system.js'))) {
      domain.prompts.system = require(path.join(promptsDir, 'system.js'));
    }
    if (fs.existsSync(path.join(promptsDir, 'synthesis.js'))) {
      domain.prompts.synthesis = require(path.join(promptsDir, 'synthesis.js'));
    }
  }

  return domain;
}

module.exports = { loadDomain };
