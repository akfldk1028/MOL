/**
 * CritiqueHarness — IMPACT harness configs for critique domain agents
 *
 * Each critique domain has 4 agent roles: respondent, devil_advocate, fact_checker, synthesizer
 * Each role gets its own IMPACT config (Intent/Memory/Planning/Authority/Control/Tools)
 *
 * Usage:
 *   const config = createCritiqueHarness({ role: 'respondent', domain: 'novel', agent });
 *   const harness = new AgentHarness(config, llmCall, sharedMemory);
 *   const result = await harness.run(userPrompt);
 *
 * Papers:
 * - IMPACT framework (swyx 2025): Intent, Memory, Planning, Authority, Control, Tools
 * - Anthropic 3-agent harness (2026): structured handoff + separation of concerns
 * - NLAH (2026): Natural-language harness contracts
 */

const { createHarnessConfig } = require('../HarnessConfig');

// ─── Domain-specific synthesis instructions ───

const DOMAIN_SYNTHESIS = {
  novel: {
    format: 'critique-novel',
    sections: ['Editorial Summary (1-10)', 'Narrative Structure', 'Character Analysis', 'Prose & Style', 'World-Building', 'Market Viability', 'Revision Priorities'],
  },
  webtoon: {
    format: 'critique-webtoon',
    sections: ['Panel Flow', 'Story Hooks', 'Dialogue & Tone', 'Genre & Market', 'Overall'],
  },
  book: {
    format: 'critique',
    sections: ['Thematic Analysis', 'Structural Examination', 'Critical Theory', 'Cultural Context', 'Synthesis'],
  },
  tech: {
    format: 'tech',
    sections: ['Architecture', 'Security', 'Performance', 'Developer Experience', 'Conclusion'],
  },
  investment: {
    format: 'investment',
    sections: ['Fundamental', 'Technical', 'Macro', 'Risk', 'Conclusion'],
  },
  legal: {
    format: 'legal',
    sections: ['Legal Issues', 'Precedents', 'Regulatory', 'Risk', 'Recommendations'],
  },
  medical: {
    format: 'medical',
    sections: ['Clinical Question', 'Evidence', 'Consensus', 'Disagreements', 'Clinical Considerations', 'Risk', 'Conclusion'],
    appendDisclaimer: true,
  },
  general: {
    format: 'general',
    sections: ['Analysis', 'Multiple Perspectives', 'Synthesis'],
  },
};

// ─── Role-specific IMPACT configs ───

/**
 * Create IMPACT harness config for a critique agent.
 *
 * @param {object} options
 * @param {string} options.role - Agent role: 'respondent' | 'devil_advocate' | 'fact_checker' | 'synthesizer'
 * @param {string} options.domain - Domain slug: 'novel' | 'webtoon' | 'tech' | ...
 * @param {object} options.agent - Agent definition { name, displayName, persona, llmProvider, llmModel }
 * @param {number} [options.round=1] - Current round number
 * @param {number} [options.maxRounds=3] - Max rounds
 * @returns {object} HarnessConfig
 */
function createCritiqueHarness(options) {
  const { role, domain, agent, round = 1, maxRounds = 3 } = options;
  const domainConfig = DOMAIN_SYNTHESIS[domain] || DOMAIN_SYNTHESIS.general;

  const baseConfig = {
    name: agent.name || agent.displayName,
    role: `${role} critic in ${domain} domain`,

    memory: {
      readKeys: round > 1 ? ['critique/round_*'] : [],
      writeKeys: [`critique/round_${round}/${agent.name}`],
      injectSummary: round > 1, // After round 1, see other agents' prior responses
      getContext: null, // Can be overridden per-domain
    },

    planning: {
      stages: ['analyze', 'respond'],
      maxIterations: 1, // Single pass per round (convergence handled at workflow level)
    },

    authority: {
      maxTokens: role === 'synthesizer' ? 4096 : 2048,
      maxRetries: 1,
      timeoutMs: 60_000,
      validate: (output) => {
        if (!output || output.trim().length < 50) {
          return { valid: false, reason: 'Response too short (min 50 chars)' };
        }
        // Synthesizer must cover key sections
        if (role === 'synthesizer') {
          const sectionCount = domainConfig.sections.filter(s =>
            output.toLowerCase().includes(s.toLowerCase().split(' ')[0])
          ).length;
          if (sectionCount < Math.floor(domainConfig.sections.length * 0.5)) {
            return { valid: false, reason: `Only ${sectionCount}/${domainConfig.sections.length} sections covered` };
          }
        }
        return { valid: true };
      },
    },

    control: {
      onSuccess: 'handoff',
      onFailure: 'retry',
    },

    tools: {
      llmProvider: agent.llmProvider || 'dashscope',
      llmModel: agent.llmModel || 'qwen-turbo',
      useCGB: false, // Critique doesn't need CGB by default
      cgbAPIs: [],
    },

    handoff: {
      artifactKey: `critique/${agent.name}/round_${round}`,
      artifactFormat: 'text',
    },
  };

  // Role-specific overrides
  switch (role) {
    case 'respondent':
      return createHarnessConfig({
        ...baseConfig,
        intent: {
          goal: `Provide expert analysis from your perspective as ${agent.displayName || agent.name}.`,
          successCriteria: [
            'Specific, evidence-based analysis',
            'Reference particular passages, scenes, or data points',
            'Offer unique perspective based on your expertise',
            'Constructive tone — identify both strengths and weaknesses',
          ],
          failureCriteria: [
            'Vague or generic comments like "good work"',
            'Failing to reference specific content',
            'Being unnecessarily harsh without constructive suggestions',
          ],
        },
      });

    case 'devil_advocate':
      return createHarnessConfig({
        ...baseConfig,
        intent: {
          goal: `Challenge assumptions and identify overlooked weaknesses. Push back on other agents' assessments where warranted.`,
          successCriteria: [
            'Identify at least 2 overlooked issues or alternative perspectives',
            'Challenge specific claims from other respondents (if round > 1)',
            'Provide evidence for counter-arguments',
            'Be constructively provocative, not destructive',
          ],
          failureCriteria: [
            'Agreeing with everything — your job is to push back',
            'Being contrarian without substance',
            'Ignoring the content and focusing only on style',
          ],
        },
      });

    case 'fact_checker':
      return createHarnessConfig({
        ...baseConfig,
        intent: {
          goal: `Verify factual accuracy, internal consistency, and logical coherence.`,
          successCriteria: [
            'Check factual claims against known information',
            'Identify internal contradictions or plot holes',
            'Verify technical accuracy (domain-specific)',
            'Flag unsupported assertions from other agents (if round > 1)',
          ],
          failureCriteria: [
            'Skipping fact verification',
            'Missing obvious internal contradictions',
            'Confusing opinion with fact',
          ],
        },
      });

    case 'synthesizer':
      return createHarnessConfig({
        ...baseConfig,
        memory: {
          ...baseConfig.memory,
          readKeys: ['critique/round_*'], // Read ALL prior rounds
          injectSummary: true,
        },
        intent: {
          goal: `Synthesize all critique perspectives into a comprehensive ${domain} review with ${domainConfig.sections.length} sections.`,
          successCriteria: [
            `Cover all sections: ${domainConfig.sections.join(', ')}`,
            'Resolve disagreements between agents with balanced judgment',
            'Provide actionable improvement priorities',
            'Overall quality rating',
            ...(domainConfig.appendDisclaimer ? ['Include appropriate disclaimer'] : []),
          ],
          failureCriteria: [
            'Missing key sections',
            'Ignoring minority opinions without justification',
            'No actionable recommendations',
          ],
        },
        authority: {
          ...baseConfig.authority,
          maxTokens: 6144, // Synthesis needs more space
          timeoutMs: 90_000,
        },
      });

    default:
      return createHarnessConfig(baseConfig);
  }
}

/**
 * Build critique prompt for a specific agent role + round.
 *
 * @param {object} options
 * @param {string} options.content - The content being critiqued
 * @param {string} options.contentTitle - Title of the content
 * @param {string} options.domain - Domain slug
 * @param {string} options.role - Agent role
 * @param {Array} [options.priorResponses] - Previous round responses
 * @param {string} [options.agentPersona] - Agent persona text
 * @returns {string} User prompt
 */
function buildCritiquePrompt(options) {
  const { content, contentTitle, domain, role, priorResponses = [], agentPersona } = options;
  const domainConfig = DOMAIN_SYNTHESIS[domain] || DOMAIN_SYNTHESIS.general;
  const parts = [];

  if (agentPersona) {
    parts.push(`Your perspective: ${agentPersona}`);
    parts.push('');
  }

  parts.push(`## Content Under Review`);
  parts.push(`**Title**: ${contentTitle || 'Untitled'}`);
  parts.push(`**Domain**: ${domain}`);
  parts.push('');
  parts.push(typeof content === 'string' ? content.slice(0, 6000) : JSON.stringify(content).slice(0, 6000));
  parts.push('');

  if (priorResponses.length > 0) {
    parts.push('## Prior Discussion');
    for (const resp of priorResponses) {
      parts.push(`**${resp.agentName}** (${resp.role}, Round ${resp.round}):`);
      parts.push(resp.content.slice(0, 800));
      parts.push('---');
    }
    parts.push('');
  }

  if (role === 'synthesizer') {
    parts.push(`## Your Task: Final Synthesis`);
    parts.push(`Produce a structured review covering:`);
    for (let i = 0; i < domainConfig.sections.length; i++) {
      parts.push(`${i + 1}. **${domainConfig.sections[i]}**`);
    }
    if (domainConfig.appendDisclaimer) {
      parts.push('');
      parts.push('End with an appropriate professional disclaimer.');
    }
  } else {
    parts.push(`## Your Task: ${role.replace(/_/g, ' ')} Analysis`);
    parts.push('Provide your expert critique. Be specific — reference particular parts of the content.');
  }

  return parts.join('\n');
}

/**
 * Get domain synthesis config.
 * @param {string} domain
 * @returns {{ format: string, sections: string[], appendDisclaimer?: boolean }}
 */
function getDomainSynthesisConfig(domain) {
  return DOMAIN_SYNTHESIS[domain] || DOMAIN_SYNTHESIS.general;
}

module.exports = {
  createCritiqueHarness,
  buildCritiquePrompt,
  getDomainSynthesisConfig,
  DOMAIN_SYNTHESIS,
};
