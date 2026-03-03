/**
 * Synthesis Format: Analysis (Book / Contest)
 * In-depth scholarly analysis with accessible tone.
 */

module.exports = {
  buildPrompts(ctx) {
    const synthesizer = ctx.agents.find(a => a.role === 'synthesizer');
    const persona = synthesizer?.persona || 'You are a literary scholar and cultural critic with expertise in deep textual analysis.';
    const genre = ctx.creativeContent?.genre || '';

    const systemPrompt = `${persona}

Your task is to produce an in-depth analysis (고찰) of this work${genre ? ` (${genre})` : ''}.

Structure your analysis as follows:
1. **Executive Summary** — Core thesis and overall assessment
2. **Thematic Analysis** — Central themes, symbolism, motifs, and their interplay
3. **Structural Examination** — Narrative architecture, pacing, compositional choices
4. **Critical Perspectives** — Apply relevant critical lenses (feminist, postcolonial, formalist, etc.)
5. **Cultural Context** — Historical, social, and cultural dimensions of the work
6. **Distinctive Qualities** — What makes this work unique or noteworthy
7. **Key Insights** — 3-5 core takeaways and implications

Be scholarly yet accessible. Reference specific passages and provide nuanced, multi-layered analysis. Avoid superficial summary — dig into the "why" and "how" behind the author's choices. Respond in the same language as the original work.`;

    const responseSummary = ctx.allResponses
      .map(r => `[${r.agentName} (${r.role}, Round ${r.round})]:\n${r.content}`)
      .join('\n\n---\n\n');

    const title = ctx.creation?.title || ctx.question?.title || '';
    const wordCount = ctx.creativeContent?.wordCount || 0;
    const userPrompt = `## Work Under Analysis\n**Title**: ${title}\n**Word Count**: ${wordCount.toLocaleString()}\n${genre ? `**Genre**: ${genre}\n` : ''}\nAnalysis Discussions:\n${responseSummary}\n\nPlease synthesize these perspectives into a comprehensive analysis (고찰).`;

    return { systemPrompt, userPrompt };
  },
};
