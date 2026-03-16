/**
 * Episode Generation Prompts
 * Used by TaskWorker when agents autonomously create series episodes.
 * Pattern follows heartbeat-decision.js
 */

function buildEpisodeSystemPrompt(agent, series, nextEpisodeNumber) {
  const isWebtoon = series.content_type === 'webtoon';

  const base = [
    `You are ${agent.display_name || agent.name}, a creative writer.`,
    agent.persona ? `Your persona: ${agent.persona}` : '',
    `You are writing episode ${nextEpisodeNumber} of "${series.title}".`,
    series.content_type ? `Content type: ${series.content_type}` : '',
    series.genre ? `Genre: ${series.genre}` : '',
    series.episode_prompt_hint ? `Writer's guide: ${series.episode_prompt_hint}` : '',
  ];

  if (isWebtoon) {
    base.push(
      '',
      'You are creating a WEBTOON episode — a vertical-scroll visual story.',
      'Your episode must include 4-8 scene panels with vivid image descriptions.',
      '',
      '=== CHARACTER CONSISTENCY (CRITICAL) ===',
      'Every IMAGE description MUST repeat the FULL character appearance details:',
      '- Hair: exact color, length, style (e.g. "shoulder-length dark brown messy hair")',
      '- Eyes: exact color (e.g. "glowing ice-blue eyes")',
      '- Face: distinguishing features (e.g. "scar across left cheek, sharp jawline")',
      '- Clothing: exact outfit (e.g. "torn dark leather armor, tattered brown cloak")',
      '- Build: body type (e.g. "lean muscular build, tall")',
      'Do NOT abbreviate or skip — repeat the SAME description in EVERY panel so the AI generates the SAME character.',
      '',
      'Format your response EXACTLY as follows:',
      'TITLE: [episode title here]',
      '[blank line]',
      'Then for each scene panel, write:',
      '[PANEL]',
      'IMAGE: [Detailed visual description for AI image generation. ALWAYS include full character appearance (hair, eyes, face, clothes, build), pose, expression, background, lighting, camera angle.]',
      'TEXT: [Narration, dialogue, or sound effects for this panel. Can be empty for silent panels.]',
      '[/PANEL]',
      '',
      'Example:',
      '[PANEL]',
      'IMAGE: A young man with shoulder-length dark brown messy hair, glowing ice-blue eyes, a scar across his left cheek, lean muscular build, wearing torn dark leather armor and a tattered brown cloak — kneeling on a stone floor in a dark dungeon, clutching his wounded arm, grimacing in pain. Torchlight casts harsh shadows. Close-up shot, webtoon style, dark fantasy, full color.',
      'TEXT: ...젠장. 여기가 어디야.',
      '[/PANEL]',
      '',
      'Write 4-8 panels per episode. Each IMAGE description must include FULL character appearance.',
      'Use the same art style keywords in every panel: "webtoon style, [genre], full color, high quality illustration".',
    );
  } else {
    base.push(
      `Target length: approximately ${series.target_word_count || 2000} words.`,
      '',
      'Format your response exactly as follows:',
      'TITLE: [episode title here]',
      '[blank line]',
      '[episode content here]',
    );
  }

  base.push(
    '',
    'Write naturally. Match the tone and style established in previous episodes.',
    'Match the language of the series (Korean if the series is in Korean).',
    'Do not include episode numbers in the title.',
  );

  return base.filter(Boolean).join('\n');
}

function buildEpisodeUserPrompt(series, previousEpisodes) {
  let prompt = '';

  if (series.synopsis) {
    prompt += `Series synopsis: ${series.synopsis}\n\n`;
  }

  if (previousEpisodes && previousEpisodes.length > 0) {
    prompt += '--- Previous episodes ---\n';
    for (const ep of previousEpisodes) {
      const summary = ep.content ? ep.content.slice(0, 300) : '(no content)';
      prompt += `Episode ${ep.episode_number}: "${ep.title}"\n${summary}...\n\n`;
    }
  } else {
    prompt += 'This is the first episode. Begin the story.\n';
  }

  prompt += '--- Continue the story naturally ---\n';
  return prompt;
}

module.exports = {
  buildEpisodeSystemPrompt,
  buildEpisodeUserPrompt,
};
