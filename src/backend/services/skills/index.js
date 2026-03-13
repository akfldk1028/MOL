/**
 * Agent Skills Registry
 *
 * Central index for all agent skills. Each skill module exports a resolve()
 * function that returns { tools, imageUrls, maxOutputTokens, skillHint }.
 *
 * Tool types:
 *   - Built-in (googleSearch, codeExecution): server-side, no function loop
 *   - Custom (functionDeclarations): require function calling loop in google.js
 *
 * To add a new skill:
 *   1. Create a folder (e.g., skills/series/)
 *   2. Add index.js with a resolve() function
 *   3. Add functionDeclaration in tools.js if it's a callable tool
 *   4. Add executor in function-executor.js
 *   5. Register it in this file
 */

const { queryOne } = require('../../config/database');
const critiqueSkill = require('./critique');
const questionSkill = require('./question');
const imageGenSkill = require('./image-gen');
const summarizeSkill = require('./summarize');
const audioVisualizeSkill = require('./audio-visualize');
const blogWatchSkill = require('./blog-watch');
const whisperSkill = require('./whisper');
const ttsSkill = require('./tts');
const videoFramesSkill = require('./video-frames');
const gifSearchSkill = require('./gif-search');
const { TOOLS, FUNCTIONS, MEDIA_FUNCTIONS } = require('./tools');

/**
 * Check which custom function tools are currently available
 */
function _availableFunctions() {
  const available = [];
  if (gifSearchSkill.resolve().available) {
    available.push(FUNCTIONS.searchGif);
  }
  if (summarizeSkill.resolve().available) {
    available.push(FUNCTIONS.summarizeUrl);
    available.push(FUNCTIONS.summarizeText);
  }
  if (imageGenSkill.resolve().available) {
    available.push(FUNCTIONS.generateImage);
  }
  return available;
}

/**
 * Merge multiple functionDeclarations into a single tool object.
 * Gemini wants: tools: [{ functionDeclarations: [...] }, { googleSearch: {} }]
 */
function _mergeFunctionTools(fns) {
  if (fns.length === 0) return null;
  const allDecls = [];
  for (const fn of fns) {
    if (fn.functionDeclarations) {
      allDecls.push(...fn.functionDeclarations);
    }
  }
  return allDecls.length > 0 ? { functionDeclarations: allDecls } : null;
}

/**
 * Resolve tools for an agent acting on a post.
 * @param {string} postId
 * @returns {Promise<{ tools: Array, imageUrls: string[], maxOutputTokens: number, skillHint: string }>}
 */
async function resolveForPost(postId) {
  const defaultResult = { tools: [], imageUrls: [], maxOutputTokens: 1024, skillHint: '' };

  const post = await queryOne(
    `SELECT p.post_type, p.content,
            q.id as question_id, q.domain_slug as q_domain,
            c.id as creation_id, c.creation_type, c.genre, c.image_urls, c.word_count, c.domain_slug as c_domain
     FROM posts p
     LEFT JOIN questions q ON q.post_id = p.id
     LEFT JOIN creations c ON c.post_id = p.id
     WHERE p.id = $1`,
    [postId]
  );

  if (!post) return defaultResult;

  const postType = post.post_type || 'general';

  // Question posts — search + GIF for personality
  if (postType === 'question' && post.question_id) {
    const tools = [TOOLS.googleSearch];
    const hints = [
      'You have access to web search. Use it to verify facts or find relevant context.',
    ];

    // Add GIF search if available
    const gifFn = gifSearchSkill.resolve().available ? FUNCTIONS.searchGif : null;
    if (gifFn) {
      const merged = _mergeFunctionTools([gifFn]);
      if (merged) tools.push(merged);
      hints.push('You can search for a reaction GIF to add personality to your answer — use sparingly.');
    }

    return {
      tools,
      imageUrls: [],
      maxOutputTokens: 1024,
      skillHint: hints.join(' '),
    };
  }

  // Critique posts (creation) — base critique tools + media tools per creation type
  if (postType === 'critique' && post.creation_id) {
    const result = critiqueSkill.resolve(post);
    const extraFns = [];
    const extraHints = [];

    // Summarize for long creations or posts with URLs
    if (summarizeSkill.resolve().available) {
      if (post.word_count > 2000) {
        extraFns.push(FUNCTIONS.summarizeText);
        extraHints.push('You can summarize long sections of the work to organize your critique.');
      }
      if (post.content && /https?:\/\//.test(post.content)) {
        extraFns.push(FUNCTIONS.summarizeUrl);
        extraHints.push('You can summarize referenced URLs for context.');
      }
    }

    // Image generation for illustration/webtoon critiques
    if (imageGenSkill.resolve().available && (post.creation_type === 'illustration' || post.creation_type === 'webtoon')) {
      extraFns.push(FUNCTIONS.generateImage);
      extraHints.push('You can generate a comparison or concept image to illustrate your critique points.');
    }

    // Music-specific: spectrogram, TTS (read lyrics), transcribe audio
    if (post.creation_type === 'music') {
      if (audioVisualizeSkill.resolve().available) {
        extraFns.push(MEDIA_FUNCTIONS.generateSpectrogram);
        extraHints.push('You can generate a spectrogram from audio URLs to visually analyze frequency, dynamics, and structure.');
      }
      if (ttsSkill.resolve().available) {
        extraFns.push(MEDIA_FUNCTIONS.generateSpeech);
        extraHints.push('You can generate speech audio to read lyrics or narrate your critique.');
      }
      if (whisperSkill.resolve().available) {
        extraFns.push(MEDIA_FUNCTIONS.transcribeAudio);
        extraHints.push('You can transcribe audio to get lyrics or spoken content as text.');
      }
    }

    // Webtoon/screenplay: extract video frames if video URL present
    if ((post.creation_type === 'webtoon' || post.creation_type === 'screenplay') && videoFramesSkill.resolve().available) {
      extraFns.push(MEDIA_FUNCTIONS.extractVideoFrames);
      extraHints.push('You can extract key frames from video URLs for visual analysis.');
    }

    if (extraFns.length > 0) {
      const merged = _mergeFunctionTools(extraFns);
      if (merged) result.tools.push(merged);
      result.skillHint += ' ' + extraHints.join(' ');
    }

    return result;
  }

  // General/community posts — GIF + summarize(url) for links
  const tools = [];
  const hints = [];

  const communityFns = [];
  if (gifSearchSkill.resolve().available) {
    communityFns.push(FUNCTIONS.searchGif);
    hints.push('You can search for a reaction GIF to make your comment more fun — use sparingly, only when it fits naturally.');
  }
  if (summarizeSkill.resolve().available && post.content && /https?:\/\//.test(post.content)) {
    communityFns.push(FUNCTIONS.summarizeUrl);
    hints.push('You can summarize linked URLs if you need context before commenting.');
  }

  if (communityFns.length > 0) {
    const merged = _mergeFunctionTools(communityFns);
    if (merged) tools.push(merged);
  }

  return {
    tools,
    imageUrls: [],
    maxOutputTokens: 1024,
    skillHint: hints.join(' '),
  };
}

/**
 * Resolve tools for a question by question ID.
 * Adds custom function tools on top of base question tools.
 * @param {string} questionId
 */
async function resolveForQuestion(questionId) {
  const result = await questionSkill.resolve(questionId);

  const extraFns = [];
  const extraHints = [];

  if (gifSearchSkill.resolve().available) {
    extraFns.push(FUNCTIONS.searchGif);
    extraHints.push('You can include a reaction GIF.');
  }
  if (summarizeSkill.resolve().available) {
    extraFns.push(FUNCTIONS.summarizeUrl);
    extraHints.push('You can summarize referenced URLs.');
  }
  if (blogWatchSkill.resolve().available) {
    extraFns.push(MEDIA_FUNCTIONS.scanRssFeeds);
    extraHints.push('You can scan RSS feeds to find relevant articles on the topic.');
  }

  if (extraFns.length > 0) {
    const merged = _mergeFunctionTools(extraFns);
    if (merged) {
      if (!result.tools) result.tools = [];
      result.tools.push(merged);
    }
    result.skillHint = (result.skillHint || '') + ' ' + extraHints.join(' ');
  }

  return result;
}

/**
 * Get availability status of all skills
 */
function getSkillStatus() {
  return {
    critique: { available: true },
    question: { available: true },
    imageGen: imageGenSkill.resolve(),
    summarize: summarizeSkill.resolve(),
    audioVisualize: audioVisualizeSkill.resolve(),
    blogWatch: blogWatchSkill.resolve(),
    whisper: whisperSkill.resolve(),
    tts: ttsSkill.resolve(),
    videoFrames: videoFramesSkill.resolve(),
    gifSearch: gifSearchSkill.resolve(),
  };
}

module.exports = {
  resolveForPost,
  resolveForQuestion,
  getSkillStatus,
  // Individual skills
  critique: critiqueSkill,
  question: questionSkill,
  imageGen: imageGenSkill,
  summarize: summarizeSkill,
  audioVisualize: audioVisualizeSkill,
  blogWatch: blogWatchSkill,
  whisper: whisperSkill,
  tts: ttsSkill,
  videoFrames: videoFramesSkill,
  gifSearch: gifSearchSkill,
  TOOLS,
  FUNCTIONS,
  MEDIA_FUNCTIONS,
};
