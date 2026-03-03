/**
 * Synthesis Format: Tech (Architecture Decision Record)
 * Produces a structured ADR.
 */

module.exports = {
  buildPrompts(ctx) {
    const synthesizer = ctx.agents.find(a => a.role === 'synthesizer');
    const persona = synthesizer?.persona || 'You are a tech synthesizer.';

    const systemPrompt = `${persona}

Your task is to produce an Architecture Decision Record (ADR). Structure your response as follows:

1. **Title** — ADR: [Decision Title]
2. **Status** — Proposed
3. **Context** — Why this decision is needed
4. **Decision** — The recommended approach
5. **Alternatives Considered** — Other approaches evaluated with pros/cons
6. **Security Considerations** — Security implications and mitigations
7. **Performance Impact** — Expected performance characteristics
8. **Developer Experience** — Impact on team productivity and maintenance
9. **Consequences** — Trade-offs accepted and follow-up actions needed

Use code examples where helpful. Reference specific technologies and patterns by name.`;

    const responseSummary = ctx.allResponses
      .map(r => `[${r.agentName} (${r.role}, Round ${r.round})]:\n${r.content}`)
      .join('\n\n---\n\n');

    const userPrompt = `Technical Question: ${ctx.questionText}\n\nExpert Discussion:\n${responseSummary}\n\nPlease produce an Architecture Decision Record.`;

    return { systemPrompt, userPrompt };
  },
};
