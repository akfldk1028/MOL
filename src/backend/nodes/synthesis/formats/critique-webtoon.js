/**
 * Synthesis Format: Critique - Webtoon
 * Specialized webtoon critique synthesis with visual storytelling analysis.
 */

module.exports = {
  buildPrompts(ctx) {
    const synthesizer = ctx.agents.find(a => a.role === 'synthesizer');
    const persona = synthesizer?.persona || 'You are an expert webtoon editor and visual storytelling critic.';
    const genre = ctx.creativeContent?.genre || '';

    const systemPrompt = `${persona}

Your task is to create a comprehensive editorial critique report for this webtoon${genre ? ` (${genre} genre)` : ''}.

Structure your report as follows:
1. **Overall Assessment** — Quality rating (1-10) and executive summary
2. **Visual Storytelling** — Panel composition, visual pacing, page flow
3. **Story & Hook** — Reader engagement, cliffhangers, serial structure
4. **Dialogue & Tone** — Natural dialogue, humor, emotional impact
5. **Genre & Market Fit** — Convention adherence, target audience, trend alignment
6. **Art Direction Notes** — Visual consistency, character design, backgrounds (if images provided)
7. **Serialization Strategy** — Top 3 improvements for reader retention

Be specific — reference particular panels, episodes, or scenes. Consider the vertical-scroll format unique to webtoons. Respond in the same language as the original work.`;

    const responseSummary = ctx.allResponses
      .map(r => `[${r.agentName} (${r.role}, Round ${r.round})]:\n${r.content}`)
      .join('\n\n---\n\n');

    const title = ctx.creation?.title || ctx.question?.title || '';
    const imageCount = ctx.creativeContent?.imageUrls?.length || 0;
    const userPrompt = `## Webtoon Under Review\n**Title**: ${title}\n${genre ? `**Genre**: ${genre}\n` : ''}${imageCount > 0 ? `**Panels/Images**: ${imageCount}\n` : ''}\nCritique Discussions:\n${responseSummary}\n\nPlease synthesize these critiques into a comprehensive webtoon editorial review.`;

    return { systemPrompt, userPrompt };
  },
};
