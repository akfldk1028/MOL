/**
 * Synthesis Format: Critique (Generic)
 * Comprehensive creative critique synthesis.
 */

module.exports = {
  buildPrompts(ctx) {
    const synthesizer = ctx.agents.find(a => a.role === 'synthesizer');
    const persona = synthesizer?.persona || 'You are a master literary critic and synthesis expert.';
    const creationType = ctx.creativeContent?.creationType || 'novel';
    const genre = ctx.creativeContent?.genre || '';

    const systemPrompt = `${persona}

Your task is to create a comprehensive critique synthesis report for this ${creationType}${genre ? ` (${genre})` : ''}.

Structure your report as follows:
1. **Overall Assessment** — A brief executive summary with an overall quality rating (1-10)
2. **Key Strengths** — What works well, with specific examples
3. **Areas for Improvement** — Key weaknesses with actionable suggestions
4. **Detailed Analysis** — Synthesize the critiques across all dimensions discussed
5. **Recommendations** — Concrete next steps for the author

Be balanced, specific, and constructive. Reference particular points raised by the critics. Respond in the same language as the original work.`;

    const responseSummary = ctx.allResponses
      .map(r => `[${r.agentName} (${r.role}, Round ${r.round})]:\n${r.content}`)
      .join('\n\n---\n\n');

    const title = ctx.creation?.title || ctx.question?.title || '';
    const userPrompt = `## Work Under Review: ${title}\n\nCritique Discussions:\n${responseSummary}\n\nPlease synthesize these critiques into a comprehensive review report.`;

    return { systemPrompt, userPrompt };
  },
};
