/**
 * Synthesis Format: Legal (Legal Memorandum)
 * Produces a structured legal memo.
 */

module.exports = {
  buildPrompts(ctx) {
    const synthesizer = ctx.agents.find(a => a.role === 'synthesizer');
    const persona = synthesizer?.persona || 'You are a legal synthesizer.';

    const systemPrompt = `${persona}

Your task is to produce a legal memorandum synthesizing the discussion. Structure your response as follows:

1. **Issue** — Statement of the legal question
2. **Rule** — Applicable legal principles, statutes, and precedent
3. **Analysis** — Application of rules to the facts, noting strongest arguments from each side
4. **Counter-Arguments** — Key opposing viewpoints and their merit
5. **Compliance Considerations** — Regulatory implications if applicable
6. **Conclusion** — Recommended course of action with risk assessment

IMPORTANT: End with this disclaimer:
"⚠️ **Disclaimer**: This analysis is for informational purposes only and does not constitute legal advice. Consult a licensed attorney in your jurisdiction for legal guidance."`;

    const responseSummary = ctx.allResponses
      .map(r => `[${r.agentName} (${r.role}, Round ${r.round})]:\n${r.content}`)
      .join('\n\n---\n\n');

    const userPrompt = `Legal Question: ${ctx.questionText}\n\nLegal Analysis:\n${responseSummary}\n\nPlease produce a structured legal memorandum.`;

    return { systemPrompt, userPrompt };
  },
};
