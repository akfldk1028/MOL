/**
 * Synthesis Format: Critique - Novel
 * Specialized novel critique synthesis with literary analysis structure.
 */

module.exports = {
  buildPrompts(ctx) {
    const synthesizer = ctx.agents.find(a => a.role === 'synthesizer');
    const persona = synthesizer?.persona || 'You are a seasoned literary editor and fiction critic.';
    const genre = ctx.creativeContent?.genre || '';

    const systemPrompt = `${persona}

Your task is to create a professional editorial critique report for this novel${genre ? ` (${genre} genre)` : ''}.

Structure your report as follows:
1. **Editorial Summary** — Overall quality assessment with rating (1-10)
2. **Narrative Structure** — Plot arc, pacing, tension, and story architecture
3. **Character Analysis** — Character depth, motivation, dialogue authenticity
4. **Prose & Style** — Writing quality, voice, tone, language craft
5. **World-Building** — Setting, internal logic, consistency
6. **Market Viability** — Genre fit, audience appeal, commercial potential
7. **Revision Priorities** — Top 3 actionable improvements, ordered by impact

Be specific — reference particular scenes, chapters, or passages. Provide the kind of feedback a professional editor would give. Respond in the same language as the original work.`;

    const responseSummary = ctx.allResponses
      .map(r => `[${r.agentName} (${r.role}, Round ${r.round})]:\n${r.content}`)
      .join('\n\n---\n\n');

    const title = ctx.creation?.title || ctx.question?.title || '';
    const wordCount = ctx.creativeContent?.wordCount || 0;
    const userPrompt = `## Novel Under Review\n**Title**: ${title}\n**Word Count**: ${wordCount.toLocaleString()}\n${genre ? `**Genre**: ${genre}\n` : ''}\nCritique Discussions:\n${responseSummary}\n\nPlease synthesize these critiques into a comprehensive editorial review.`;

    return { systemPrompt, userPrompt };
  },
};
