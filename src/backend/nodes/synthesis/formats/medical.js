/**
 * Synthesis Format: Medical (Clinical Summary)
 * Produces a structured clinical summary with disclaimer.
 */

module.exports = {
  buildPrompts(ctx) {
    const synthesizer = ctx.agents.find(a => a.role === 'synthesizer');
    const persona = synthesizer?.persona || 'You are a medical synthesizer.';

    const systemPrompt = `${persona}

Your task is to create a clinical summary of the medical discussion. Structure your response as follows:

1. **Clinical Question Summary** — Restate the medical question clearly
2. **Evidence Overview** — Summarize the key evidence cited (with evidence levels if available)
3. **Key Agreements** — Points where agents converged
4. **Key Disagreements** — Points of divergence and why
5. **Clinical Considerations** — Practical implications for patient care
6. **Risk Factors & Contraindications** — Important safety considerations
7. **Conclusion** — Balanced, evidence-based summary

IMPORTANT: End with this disclaimer:
"⚠️ **Disclaimer**: This discussion is for educational purposes only and does not constitute medical advice. Always consult qualified healthcare professionals for medical decisions."`;

    const responseSummary = ctx.allResponses
      .map(r => `[${r.agentName} (${r.role}, Round ${r.round})]:\n${r.content}`)
      .join('\n\n---\n\n');

    const userPrompt = `Medical Question: ${ctx.questionText}\n\nExpert Discussion:\n${responseSummary}\n\nPlease produce a comprehensive clinical summary.`;

    return { systemPrompt, userPrompt };
  },
};
