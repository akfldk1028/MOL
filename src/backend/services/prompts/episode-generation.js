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
      'Your episode must include multiple PAGE blocks, each representing one vertical strip page.',
      '',
      '=== FORMAT ===',
      'TITLE: [episode title]',
      '',
      '[PAGE 1]',
      'SCENE: [Detailed visual description. Include FULL character appearance every time: hair color/style, eye color, clothing, build. Include background, lighting, camera angle, action/pose.]',
      'DIALOGUE: [Character dialogue or narration. Empty string for silent pages.]',
      'MOOD: [Mood keywords: tense, peaceful, dramatic, comedic, etc.]',
      '',
      '[PAGE 2]',
      'SCENE: ...',
      'DIALOGUE: ...',
      'MOOD: ...',
      '',
      '=== RULES ===',
      '- Write as many pages as the story needs (typically 3-12)',
      '- Each SCENE description will become a 3-4 panel vertical webtoon strip',
      '- ALWAYS repeat FULL character appearance in EVERY SCENE (hair, eyes, clothes, build)',
      '- Describe clear visual actions and poses, not abstract concepts',
      '- Keep consistent art direction: same lighting style, same color palette throughout',
      series.style_preset ? `- Art style: ${series.style_preset}` : '- Art style: korean webtoon, full color',
      '',
      '=== CRITICAL FORMAT RULES ===',
      '- DIALOGUE에 캐릭터 이름 태그 넣지 마세요. "(Jin) 안녕" ❌ → "안녕" ✅',
      '- DIALOGUE는 순수 대사만. 괄호 캐릭터명, 나레이션 태그 금지.',
      '- MOOD 필드는 영어 키워드 1-2개만. 한국어로 번역하지 마세요.',
      '- SCENE에 "기분:", "분위기:" 같은 메타데이터 텍스트 넣지 마세요. 시각적 묘사만.',
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
    '반드시 한국어로 작성하세요. 제목, 대사, 장면 묘사 모두 한국어로.',
    'SCENE 묘사는 영어로 작성하되, DIALOGUE는 반드시 한국어 대사로 작성.',
    '자연스러운 한국어 대화체를 사용하세요.',
    'Do not include episode numbers in the title.',
  );

  return base.filter(Boolean).join('\n');
}

function buildEpisodeUserPrompt(series, previousEpisodes, feedbackDirectives = []) {
  const parts = [];

  if (series.synopsis) {
    parts.push(`Series synopsis: ${series.synopsis}`);
  }

  if (previousEpisodes && previousEpisodes.length > 0) {
    parts.push('\n--- Previous Episodes ---');
    for (const ep of previousEpisodes) {
      const content = ep.script_content || ep.content || '';
      parts.push(`Episode ${ep.episode_number}: "${ep.title}"\n${content.slice(0, 500)}...`);
    }
  } else {
    parts.push('This is the first episode. Begin the story.');
  }

  if (feedbackDirectives.length > 0) {
    parts.push('\n--- Reader Feedback (IMPORTANT — apply these) ---');
    for (const directive of feedbackDirectives) {
      parts.push(`- ${directive}`);
    }
  }

  parts.push('\nWrite the next episode now.');
  return parts.join('\n');
}

module.exports = {
  buildEpisodeSystemPrompt,
  buildEpisodeUserPrompt,
};
