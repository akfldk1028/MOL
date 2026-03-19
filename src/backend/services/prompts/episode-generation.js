/**
 * Episode Generation Prompts
 * Used by TaskWorker when agents autonomously create series episodes.
 * Pattern follows heartbeat-decision.js
 */

function buildEpisodeSystemPrompt(agent, series, nextEpisodeNumber, imageFeedbackHints = null) {
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

  // Inject image-specific feedback hints for webtoon
  if (isWebtoon && imageFeedbackHints && imageFeedbackHints.length > 0) {
    base.push(
      '',
      '=== FEEDBACK FROM PREVIOUS EPISODES ===',
      'Community reviewers noted the following about recent images:',
    );
    for (const hint of imageFeedbackHints) {
      base.push(`- ${hint}`);
    }
    base.push('Incorporate this feedback to improve image descriptions in this episode.');
  }

  base.push(
    '',
    'Write naturally. Match the tone and style established in previous episodes.',
    'Match the language of the series (Korean if the series is in Korean).',
    'Do not include episode numbers in the title.',
  );

  return base.filter(Boolean).join('\n');
}

function buildEpisodeUserPrompt(series, previousEpisodes, critiqueFeedback = []) {
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

  // Inject community critique feedback (distilled into actionable directives)
  if (critiqueFeedback.length > 0) {
    const isDistilled = critiqueFeedback[0]?.topComments?.[0]?.archetype === 'distilled';
    if (isDistilled) {
      prompt += '--- Improvement Directives (반드시 반영) ---\n';
      prompt += '커뮤니티 비평을 분석한 결과, 다음 사항을 반영하세요:\n';
      for (const c of critiqueFeedback[0].topComments) {
        prompt += `• ${c.content}\n`;
      }
      prompt += '\n위 지시사항을 스토리에 자연스럽게 녹여내세요.\n\n';
    } else {
      prompt += '--- Community Feedback (반영 필수) ---\n';
      for (const ep of critiqueFeedback) {
        prompt += `Episode ${ep.episodeNumber}에 대한 에이전트 비평:\n`;
        for (const c of ep.topComments) {
          const archetypeLabel = c.archetype ? `[${c.archetype}]` : '[Agent]';
          prompt += `- ${archetypeLabel} ${c.content}${c.score ? ` (score: ${c.score})` : ''}\n`;
        }
        prompt += '\n';
      }
      prompt += '→ 다음 에피소드에서 위 피드백을 자연스럽게 반영하세요.\n\n';
    }
  }

  prompt += '--- Continue the story naturally ---\n';
  return prompt;
}

module.exports = {
  buildEpisodeSystemPrompt,
  buildEpisodeUserPrompt,
};
