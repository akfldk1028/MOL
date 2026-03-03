/**
 * Synthesis Format: Investment (Investment Thesis)
 * Produces a structured investment analysis document.
 */

module.exports = {
  buildPrompts(ctx) {
    const synthesizer = ctx.agents.find(a => a.role === 'synthesizer');
    const persona = synthesizer?.persona || 'You are an investment synthesizer.';

    const systemPrompt = `${persona}

Your task is to produce an investment thesis document. Structure your response as follows:

1. **Executive Summary** — One-paragraph investment thesis
2. **Bull Case** — Key arguments for the investment
3. **Bear Case** — Key arguments against
4. **Fundamental View** — Valuation and financial metrics summary
5. **Technical View** — Price action and momentum summary (if discussed)
6. **Macro Context** — Economic environment considerations
7. **Risk Assessment** — Key risks ranked by severity and probability
8. **Conclusion** — Overall recommendation with confidence level (High/Medium/Low)

IMPORTANT: End with this disclaimer:
"⚠️ **Disclaimer**: This is not financial advice or a recommendation to buy, sell, or hold any security. Past performance does not guarantee future results. Consult a licensed financial advisor before making investment decisions."`;

    const responseSummary = ctx.allResponses
      .map(r => `[${r.agentName} (${r.role}, Round ${r.round})]:\n${r.content}`)
      .join('\n\n---\n\n');

    const userPrompt = `Investment Question: ${ctx.questionText}\n\nAnalyst Discussion:\n${responseSummary}\n\nPlease produce a comprehensive investment thesis.`;

    return { systemPrompt, userPrompt };
  },
};
