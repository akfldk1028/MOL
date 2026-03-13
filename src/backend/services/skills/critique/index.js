/**
 * Critique Skill — tools for critiquing creations
 */

const { TOOLS } = require('../tools');

function resolveWebtoon(post) {
  const result = { tools: [TOOLS.googleSearch], imageUrls: [], maxOutputTokens: 1500, skillHint: '' };

  if (Array.isArray(post.image_urls) && post.image_urls.length > 0) {
    result.imageUrls = post.image_urls;
  }

  result.skillHint = [
    'You are critiquing a webtoon.',
    Array.isArray(post.image_urls) && post.image_urls.length > 0
      ? `${post.image_urls.length} panel image(s) are included — analyze the visual composition, art style, panel flow, and visual storytelling.`
      : '',
    'You have web search available. Use it to reference genre conventions, similar works, or art techniques when relevant.',
    post.genre ? `Genre: ${post.genre}. Consider genre-specific expectations.` : '',
  ].filter(Boolean).join(' ');

  return result;
}

function resolveNovel(post) {
  const tools = [TOOLS.googleSearch];
  if (post.word_count > 500) tools.push(TOOLS.codeExecution);

  return {
    tools,
    imageUrls: [],
    maxOutputTokens: 1500,
    skillHint: [
      'You are critiquing a novel/fiction work.',
      'You have web search available. Use it to reference literary techniques, genre conventions, or comparable works when relevant.',
      post.word_count > 500
        ? 'You also have code execution (Python). Use it for quantitative text analysis if helpful (e.g., pacing analysis, vocabulary diversity).'
        : '',
      post.genre ? `Genre: ${post.genre}. Consider genre-specific expectations.` : '',
    ].filter(Boolean).join(' '),
  };
}

function resolveBookContest(post) {
  const label = post.creation_type === 'book' ? 'published book' : 'contest entry';
  return {
    tools: [TOOLS.googleSearch, TOOLS.codeExecution],
    imageUrls: [],
    maxOutputTokens: 2048,
    skillHint: [
      `You are analyzing a ${label}.`,
      'You have web search available. Use it to find scholarly context, critical theory, author background, and reception history.',
      'You also have code execution for quantitative analysis.',
      post.genre ? `Genre: ${post.genre}.` : '',
    ].filter(Boolean).join(' '),
  };
}

function resolveMusic(post) {
  return {
    tools: [TOOLS.googleSearch],
    imageUrls: [],
    maxOutputTokens: 1500,
    skillHint: [
      'You are critiquing a music work (lyrics, composition, or production).',
      'You have web search available. Use it to reference genre history, similar artists, music theory concepts, or production techniques.',
      post.genre ? `Genre: ${post.genre}. Consider genre-specific conventions and expectations.` : '',
    ].filter(Boolean).join(' '),
  };
}

function resolveIllustration(post) {
  const result = { tools: [TOOLS.googleSearch], imageUrls: [], maxOutputTokens: 1500, skillHint: '' };

  if (Array.isArray(post.image_urls) && post.image_urls.length > 0) {
    result.imageUrls = post.image_urls;
  }

  result.skillHint = [
    'You are critiquing an illustration or artwork.',
    Array.isArray(post.image_urls) && post.image_urls.length > 0
      ? `${post.image_urls.length} image(s) are included — analyze composition, color theory, technique, and artistic intent.`
      : '',
    'You have web search available. Use it to reference art movements, techniques, or similar works.',
    post.genre ? `Style/Category: ${post.genre}.` : '',
  ].filter(Boolean).join(' ');

  return result;
}

function resolveScreenplay(post) {
  const tools = [TOOLS.googleSearch];
  if (post.word_count > 500) tools.push(TOOLS.codeExecution);

  return {
    tools,
    imageUrls: [],
    maxOutputTokens: 2048,
    skillHint: [
      'You are critiquing a screenplay or script.',
      'You have web search available. Use it to reference screenwriting conventions, story structure theory, or comparable works.',
      post.word_count > 500
        ? 'You also have code execution for structural analysis (scene count, dialogue ratio, pacing).'
        : '',
      post.genre ? `Genre: ${post.genre}. Consider genre-specific narrative conventions.` : '',
    ].filter(Boolean).join(' '),
  };
}

function resolveDefault(post) {
  return {
    tools: [TOOLS.googleSearch],
    imageUrls: [],
    maxOutputTokens: 1024,
    skillHint: 'You have web search available for reference if needed.',
  };
}

const CRITIQUE_RESOLVERS = {
  webtoon: resolveWebtoon,
  novel: resolveNovel,
  book: resolveBookContest,
  contest: resolveBookContest,
  music: resolveMusic,
  illustration: resolveIllustration,
  screenplay: resolveScreenplay,
};

function resolve(post) {
  const creationType = post.creation_type || 'novel';
  const resolver = CRITIQUE_RESOLVERS[creationType] || resolveDefault;
  return resolver(post);
}

module.exports = { resolve, CRITIQUE_RESOLVERS };
