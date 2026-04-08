/**
 * HarnessConfig — IMPACT framework schema for per-agent harness configuration
 *
 * Based on:
 * - swyx IMPACT framework (AI Engineer Summit 2025): Intent, Memory, Planning, Authority, Control, Tools
 * - Anthropic 3-agent harness (2026): structured handoff artifacts
 * - NLAH paper: contracts, roles, stage structure, adapters
 *
 * Each agent gets its own harness config that defines behavior boundaries.
 */

/**
 * @typedef {object} HarnessConfig
 * @property {string} name - Agent name
 * @property {string} role - Agent role description
 *
 * @property {object} intent - Success criteria (IMPACT: I)
 * @property {string} intent.goal - What this agent must achieve
 * @property {string[]} [intent.successCriteria] - Measurable criteria
 * @property {string[]} [intent.failureCriteria] - When to consider failed
 *
 * @property {object} memory - Context management (IMPACT: M)
 * @property {string[]} [memory.readKeys] - SharedMemory keys this agent reads
 * @property {string[]} [memory.writeKeys] - SharedMemory keys this agent writes
 * @property {boolean} [memory.injectSummary] - Inject team memory summary into prompt
 * @property {Function} [memory.getContext] - async () => string — custom context builder
 *
 * @property {object} planning - Multi-step decomposition (IMPACT: P)
 * @property {string[]} [planning.stages] - Ordered stage names
 * @property {number} [planning.maxIterations] - Max planning iterations
 *
 * @property {object} authority - Permission boundaries (IMPACT: A)
 * @property {number} [authority.maxTokens] - Max output tokens
 * @property {number} [authority.maxRetries] - Max retries on failure
 * @property {number} [authority.timeoutMs] - Timeout per run
 * @property {string[]} [authority.allowedTools] - Tool whitelist
 * @property {Function} [authority.validate] - async (output) => { valid, reason }
 *
 * @property {object} control - Execution flow (IMPACT: C)
 * @property {string} [control.onSuccess] - 'complete' | 'next_stage' | 'handoff'
 * @property {string} [control.onFailure] - 'retry' | 'fallback' | 'abort'
 * @property {Function} [control.shouldContinue] - (result, iteration) => boolean
 *
 * @property {object} tools - Available tools (IMPACT: T)
 * @property {string} [tools.llmProvider] - 'dashscope' | 'gemini' | 'ollama'
 * @property {string} [tools.llmModel] - Model name
 * @property {boolean} [tools.useCGB] - Whether to use CGB Brain
 * @property {string[]} [tools.cgbAPIs] - CGB API paths to use
 *
 * @property {object} handoff - Structured handoff artifact (Anthropic pattern)
 * @property {string} handoff.artifactKey - SharedMemory key for output artifact
 * @property {string} [handoff.artifactFormat] - 'json' | 'markdown' | 'text'
 * @property {Function} [handoff.transform] - (rawOutput) => artifact — post-process output
 */

/**
 * Create a validated HarnessConfig with defaults.
 */
function createHarnessConfig(config) {
  return {
    name: config.name,
    role: config.role || '',

    intent: {
      goal: config.intent?.goal || '',
      successCriteria: config.intent?.successCriteria || [],
      failureCriteria: config.intent?.failureCriteria || [],
    },

    memory: {
      readKeys: config.memory?.readKeys || [],
      writeKeys: config.memory?.writeKeys || [],
      injectSummary: config.memory?.injectSummary !== false,
      getContext: config.memory?.getContext || null,
    },

    planning: {
      stages: config.planning?.stages || ['execute'],
      maxIterations: config.planning?.maxIterations || 1,
    },

    authority: {
      maxTokens: config.authority?.maxTokens || 4096,
      maxRetries: config.authority?.maxRetries || 2,
      timeoutMs: config.authority?.timeoutMs || 120_000,
      allowedTools: config.authority?.allowedTools || [],
      validate: config.authority?.validate || null,
    },

    control: {
      onSuccess: config.control?.onSuccess || 'complete',
      onFailure: config.control?.onFailure || 'retry',
      shouldContinue: config.control?.shouldContinue || null,
    },

    tools: {
      llmProvider: config.tools?.llmProvider || 'dashscope',
      llmModel: config.tools?.llmModel || 'qwen-turbo',
      useCGB: config.tools?.useCGB || false,
      cgbAPIs: config.tools?.cgbAPIs || [],
    },

    handoff: {
      artifactKey: config.handoff?.artifactKey || `${config.name}/output`,
      artifactFormat: config.handoff?.artifactFormat || 'text',
      transform: config.handoff?.transform || null,
    },
  };
}

module.exports = { createHarnessConfig };
