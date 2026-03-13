/**
 * Synthesis Format: Final Report
 * Comprehensive end-to-end report combining critique, rewrite, and A/B comparison.
 */

module.exports = {
  buildPrompts(ctx) {
    const synthesizer = ctx.agents.find(a => a.role === 'synthesizer');
    const persona = synthesizer?.persona || 'You are a master literary critic and comprehensive report writer.';
    const creationType = ctx.creativeContent?.creationType || ctx.creation?.creation_type || 'novel';
    const title = ctx.creation?.title || ctx.question?.title || '';

    const systemPrompt = `${persona}

You are writing the FINAL comprehensive report for a creative work that has undergone a complete critique workflow. Structure your report as follows:

## Executive Summary
Brief overall assessment comparing the original work and its improved version (2-3 sentences).

## 1. Critique Summary
Summarize the key findings from the multi-agent critique session.

## 2. Rewrite Highlights
What was improved in the rewritten version? What key changes were made?

## 3. A/B Comparison Results
Present the scoring comparison in a clear table format. Include the scores for each criterion.

## 4. Actionable Recommendations
Specific, prioritized next steps for the author (3-5 concrete actions).

## 5. Final Verdict
Overall assessment and encouragement for the author.

Be balanced, constructive, and specific. Write in the same language as the original work.`;

    // Gather all context
    const critiqueSummary = ctx.synthesisContent || 'No critique synthesis available.';
    const rewriteContent = ctx.rewriteContent
      ? (ctx.rewriteContent.length > 3000
        ? ctx.rewriteContent.slice(0, 3000) + '\n[... truncated ...]'
        : ctx.rewriteContent)
      : 'No rewrite generated.';
    const comparisonAnalysis = ctx.comparisonResult?.content || 'No comparison available.';
    const scores = ctx.comparisonResult?.scores;
    const scoreTable = scores
      ? `Original scores: ${JSON.stringify(scores.original)}\nRewrite scores: ${JSON.stringify(scores.rewrite)}\nDelta: ${JSON.stringify(scores.delta)}`
      : 'No scores available.';

    const userPrompt = `## Work: "${title}" (${creationType})

### Critique Synthesis:
${critiqueSummary}

### Rewrite (excerpt):
${rewriteContent}

### A/B Comparison:
${comparisonAnalysis}

### Scores:
${scoreTable}

Please write the final comprehensive report.`;

    return { systemPrompt, userPrompt };
  },
};
