/**
 * Synthesis Format: General
 * Extracted from LLMService.generateSynthesis
 * Standard multi-perspective synthesis.
 */

module.exports = {
  /**
   * Build system and user prompts for general synthesis
   * @param {import('../../../engine/WorkflowContext')} ctx
   * @returns {{systemPrompt: string, userPrompt: string}}
   */
  buildPrompts(ctx) {
    const synthesizer = ctx.agents.find(a => a.name === 'synthesizer');
    const persona = synthesizer?.persona || 'You are "Synthesizer", a bridge-builder who finds common ground.';

    const systemPrompt = `${persona}\n\nYour task is to create a comprehensive synthesis of the debate. Identify key agreements, disagreements, and the strongest arguments. Provide a clear, actionable conclusion that addresses the original question. Write in a structured format with clear sections.`;

    const responseSummary = ctx.allResponses
      .map(r => `[${r.agentName} (${r.role}, Round ${r.round})]:\n${r.content}`)
      .join('\n\n---\n\n');

    const userPrompt = `Original Question: ${ctx.questionText}\n\nDebate Responses:\n${responseSummary}\n\nPlease synthesize these perspectives into a comprehensive answer.`;

    return { systemPrompt, userPrompt };
  },
};
