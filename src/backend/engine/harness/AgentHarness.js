/**
 * AgentHarness — Runtime wrapper that executes an agent within IMPACT constraints
 *
 * The harness is the "OS" wrapping the agent "CPU" (Phil Schmid, 2026).
 * It manages: prompt assembly, memory injection, authority enforcement,
 * control flow (retry/fallback), handoff artifacts, and evaluation gates.
 *
 * Design principles (Anthropic/Manus/NLAH):
 * - Minimal intervention: only intervene for irreversible actions
 * - Progressive disclosure: start restrictive, expand as needed
 * - Fail-fast with recovery: detect problems quickly, never fail silently
 * - Harness as dataset: log trajectories for future improvement
 */

const { createHarnessConfig } = require('./HarnessConfig');
const { HandoffArtifact } = require('./HandoffArtifact');

class AgentHarness {
  /**
   * @param {object} config - HarnessConfig (IMPACT 6-element)
   * @param {Function} llmCall - async (systemPrompt, userPrompt, options) => string
   * @param {object} [sharedMemory] - SharedMemory instance for team context
   */
  constructor(config, llmCall, sharedMemory = null) {
    this.config = createHarnessConfig(config);
    this.llmCall = llmCall;
    this.sharedMemory = sharedMemory;
    this.trajectory = []; // Log for "harness as dataset"
    this._iteration = 0;
  }

  /**
   * Execute the agent within harness constraints.
   * Full lifecycle: context → prompt → LLM → validate → handoff
   *
   * @param {string} userPrompt - The task prompt
   * @param {object} [options] - Extra options
   * @returns {{ success, output, artifact, trajectory, iterations }}
   */
  async run(userPrompt, options = {}) {
    const { config } = this;
    const startTime = Date.now();
    this._iteration = 0;

    let lastOutput = null;
    let lastError = null;

    for (let i = 0; i < config.planning.maxIterations; i++) {
      this._iteration = i + 1;

      try {
        // 1. Build full prompt (Memory: inject context + team summary)
        const fullPrompt = await this._buildPrompt(userPrompt, lastOutput, options);

        // 2. Build system prompt (Intent + Role)
        const systemPrompt = this._buildSystemPrompt();

        // 3. Call LLM (Tools: provider + model)
        const llmOptions = {
          maxOutputTokens: config.authority.maxTokens,
          model: config.tools.llmModel,
          provider: config.tools.llmProvider,
        };

        // C1 fix: enforce timeout via Promise.race + S1 fix: cleanup timer
        let output;
        const timeoutMs = config.authority.timeoutMs;
        let timer;
        const llmPromise = this.llmCall(systemPrompt, fullPrompt, llmOptions);
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`LLM timeout (${timeoutMs / 1000}s)`)), timeoutMs);
        });
        try {
          output = await Promise.race([llmPromise, timeoutPromise]);
        } finally {
          clearTimeout(timer);
        }

        if (!output || !output.trim()) {
          throw new Error('LLM returned empty output');
        }

        lastOutput = output;

        // 4. Authority: validate output
        if (config.authority.validate) {
          const validation = await config.authority.validate(output);
          if (!validation.valid) {
            this._log('validation_failed', { reason: validation.reason, iteration: this._iteration });
            if (config.control.onFailure === 'retry' && this._iteration < config.planning.maxIterations) {
              lastError = validation.reason;
              continue; // Retry with feedback
            }
            return this._result(false, `Validation failed: ${validation.reason}`, startTime);
          }
        }

        // 5. Control: check if should continue
        if (config.control.shouldContinue && config.control.shouldContinue(output, this._iteration)) {
          this._log('continue', { iteration: this._iteration });
          continue;
        }

        // 6. Handoff: transform and store artifact
        const artifact = await this._createHandoff(output);

        this._log('success', { iteration: this._iteration, outputLength: output.length });
        return this._result(true, output, startTime, artifact);

      } catch (err) {
        lastError = err.message;
        this._log('error', { error: err.message, iteration: this._iteration });

        if (config.control.onFailure === 'retry' && this._iteration < config.planning.maxIterations) {
          continue;
        }
        if (config.control.onFailure === 'abort') {
          return this._result(false, `Aborted: ${err.message}`, startTime);
        }
      }
    }

    // Max iterations exhausted
    return this._result(
      lastOutput !== null,
      lastOutput || `Failed after ${this._iteration} iterations: ${lastError}`,
      startTime,
      lastOutput ? await this._createHandoff(lastOutput) : null,
    );
  }

  // ---------------------------------------------------------------------------
  // Prompt Assembly
  // ---------------------------------------------------------------------------

  _buildSystemPrompt() {
    const { config } = this;
    const lines = [
      `You are ${config.name}, ${config.role}.`,
      '',
      `## Goal`,
      config.intent.goal,
    ];

    if (config.intent.successCriteria.length > 0) {
      lines.push('', '## Success Criteria');
      for (const c of config.intent.successCriteria) lines.push(`- ${c}`);
    }
    if (config.intent.failureCriteria.length > 0) {
      lines.push('', '## Avoid');
      for (const c of config.intent.failureCriteria) lines.push(`- ${c}`);
    }

    return lines.join('\n');
  }

  async _buildPrompt(userPrompt, previousOutput, options) {
    const lines = [];

    // Inject team shared memory summary (scratchpad)
    if (this.config.memory.injectSummary && this.sharedMemory) {
      const summary = await this.sharedMemory.getSummary();
      if (summary) lines.push(summary, '');
    }

    // Custom context builder
    if (this.config.memory.getContext) {
      const ctx = await this.config.memory.getContext();
      if (ctx) lines.push(ctx, '');
    }

    // Read specific keys from shared memory
    if (this.sharedMemory && this.config.memory.readKeys.length > 0) {
      for (const key of this.config.memory.readKeys) {
        const value = await this.sharedMemory.read(key);
        if (value) lines.push(`## ${key}\n${value}\n`);
      }
    }

    // If retrying with previous output
    if (previousOutput && this._iteration > 1) {
      lines.push('## Previous Attempt (needs improvement)');
      lines.push(previousOutput.slice(0, 2000));
      lines.push('');
    }

    lines.push(userPrompt);
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Handoff
  // ---------------------------------------------------------------------------

  async _createHandoff(output) {
    const { config } = this;

    // Transform output if needed
    let artifactData = output;
    if (config.handoff.transform) {
      try {
        artifactData = config.handoff.transform(output);
      } catch (err) {
        console.warn(`[Harness:${config.name}] transform error:`, err.message);
      }
    }

    // Parse JSON if format is json
    if (config.handoff.artifactFormat === 'json' && typeof artifactData === 'string') {
      try {
        // Try to extract JSON from markdown fence
        const fenceMatch = artifactData.match(/```json\s*([\s\S]*?)```/);
        const jsonStr = fenceMatch ? fenceMatch[1] : artifactData;
        const start = jsonStr.indexOf('{') !== -1 ? jsonStr.indexOf('{') : jsonStr.indexOf('[');
        const end = jsonStr.lastIndexOf('}') !== -1 ? jsonStr.lastIndexOf('}') : jsonStr.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
          artifactData = JSON.parse(jsonStr.slice(start, end + 1));
        }
      } catch {
        // Keep as string if JSON parse fails
      }
    }

    // Store to shared memory
    if (this.sharedMemory) {
      const value = typeof artifactData === 'string' ? artifactData : JSON.stringify(artifactData);
      await this.sharedMemory.write(config.name, config.handoff.artifactKey.split('/').pop() || 'output', value);
    }

    return { key: config.handoff.artifactKey, format: config.handoff.artifactFormat, data: artifactData };
  }

  // ---------------------------------------------------------------------------
  // Logging (trajectory)
  // ---------------------------------------------------------------------------

  _log(event, data) {
    this.trajectory.push({
      agent: this.config.name,
      event,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  _result(success, output, startTime, artifact = null) {
    return {
      success,
      output,
      artifact,
      trajectory: this.trajectory,
      iterations: this._iteration,
      durationMs: Date.now() - startTime,
      agent: this.config.name,
    };
  }
}

module.exports = { AgentHarness };
