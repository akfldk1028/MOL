/**
 * Critique Prompt Builder
 * Builds system and user prompts for creative critique mode.
 */

/**
 * Build system prompt for creative critique
 * @param {string} persona - Agent persona description
 * @param {string} role - Agent debate role
 * @param {number} round - Current round number
 * @param {Object} [domainConfig] - Domain-specific prompt additions
 * @param {Object} [creativeContent] - Creative content metadata
 * @returns {string}
 */
function buildCritiqueSystemPrompt(persona, role, round, domainConfig = {}, creativeContent = {}) {
  let prompt = persona;

  const creationType = creativeContent.creationType || 'novel';
  const isAnalysis = creationType === 'book' || creationType === 'contest';

  if (isAnalysis) {
    if (role === 'devil_advocate') {
      prompt += `\n\nIn this analysis session, apply critical theory lenses (formalist, structuralist, post-structuralist, feminist, postcolonial, etc.) to challenge surface-level readings. Identify tensions, contradictions, and unexplored dimensions in the work.`;
    } else if (role === 'fact_checker') {
      prompt += `\n\nIn this analysis session, your role is to verify cultural, historical, and contextual accuracy. Examine how the work engages with its socio-cultural context, and assess the reliability of its references and allusions.`;
    } else if (role === 'synthesizer') {
      prompt += `\n\nYou will synthesize all analysis perspectives into a comprehensive scholarly assessment (고찰).`;
    } else {
      prompt += `\n\nProvide an in-depth analytical examination of this work. Go beyond surface critique — explore thematic depth, structural choices, and the work's broader significance.`;
    }
  } else {
    if (role === 'devil_advocate') {
      prompt += `\n\nIn this critique session, you play the role of a tough but fair critic. Challenge the author's choices, identify weaknesses, and suggest concrete improvements. Be constructive but don't sugarcoat issues.`;
    } else if (role === 'fact_checker') {
      prompt += `\n\nIn this critique session, your role is to check consistency and logic. For ${creationType === 'webtoon' ? 'webtoons' : 'fiction'}, verify internal consistency, world-building logic, and whether the narrative rules are followed.`;
    } else if (role === 'synthesizer') {
      prompt += `\n\nYou will synthesize all critique perspectives into a comprehensive review report.`;
    } else {
      prompt += `\n\nProvide a focused, constructive critique of this ${creationType === 'webtoon' ? 'webtoon' : 'creative work'}.`;
    }
  }

  if (round > 1) {
    prompt += `\n\nThis is round ${round} of the ${isAnalysis ? 'analysis' : 'critique'} discussion. Build on previous ${isAnalysis ? 'analyses' : 'critiques'} — don't repeat what's been said. Refine, agree, disagree, or extend the analysis. Be concise and focused.`;
  }

  if (domainConfig.systemPromptSuffix) {
    prompt += `\n\n${domainConfig.systemPromptSuffix}`;
  }

  if (creativeContent.genre) {
    prompt += `\n\nGenre: ${creativeContent.genre}. Consider genre conventions and ${isAnalysis ? 'scholarly context' : 'reader expectations'} in your ${isAnalysis ? 'analysis' : 'critique'}.`;
  }

  prompt += `\n\nKeep your ${isAnalysis ? 'analysis' : 'critique'} focused and under 600 words. Use markdown formatting. Be specific — reference particular passages${isAnalysis ? ' and textual evidence' : ', scenes, or panels'}. Respond in the same language as the work.`;
  prompt += `\n\nIMPORTANT: Do NOT use @mentions (e.g. @name). Just refer to other participants by name directly without the @ symbol.`;

  return prompt;
}

/**
 * Build user prompt with creative content
 * @param {string} contentText - The creative work text
 * @param {Array} previousResponses - Previous critique responses
 * @param {number} round - Current round
 * @param {Object} [creativeContent] - Creative content metadata
 * @returns {string}
 */
function buildCritiqueUserPrompt(contentText, previousResponses, round, creativeContent = {}) {
  const creationType = creativeContent.creationType || 'novel';
  const title = creativeContent.title || '';
  const isAnalysis = creationType === 'book' || creationType === 'contest';

  let prompt = `## ${isAnalysis ? 'Work Under Analysis' : (creationType === 'webtoon' ? 'Webtoon' : 'Creative Work') + ' to Critique'}\n`;
  if (title) prompt += `**Title**: ${title}\n`;
  if (creativeContent.genre) prompt += `**Genre**: ${creativeContent.genre}\n`;
  if (creativeContent.wordCount) prompt += `**Length**: ${creativeContent.wordCount.toLocaleString()} words\n`;
  prompt += `\n---\n\n${contentText}`;

  if (creativeContent.imageUrls?.length > 0) {
    prompt += `\n\n---\n**Note**: This work includes ${creativeContent.imageUrls.length} image(s)/panel(s) for visual analysis.`;
  }

  if (previousResponses.length > 0) {
    prompt += `\n\n---\n## Previous ${isAnalysis ? 'Analyses' : 'Critiques'} in this Discussion:`;
    for (const resp of previousResponses) {
      prompt += `\n\n[${resp.agentName} (${resp.role})]:\n${resp.content}`;
    }
    prompt += `\n\nNow ${isAnalysis ? 'analyze' : 'provide your critique'}, building on what has been discussed:`;
  }

  return prompt;
}

module.exports = { buildCritiqueSystemPrompt, buildCritiqueUserPrompt };
