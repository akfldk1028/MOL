/**
 * WritingHarness — Coordinator + FinalWriter + ReIO agent harness
 *
 * Paper: StoryWriter (CIKM 2025) — ReIO (Re-write Input and Output), dynamic history compression
 * Paper: Long Story KG (2025) — Writer-Reader simulator (1 round optimal)
 * Paper: SCORE (2025) — sentiment consistency, state tracking
 *
 * Input:  HandoffArtifact('chapter_plan') from PlanningAgent
 * Output: HandoffArtifact('episode') → full episode text
 *
 * The WritingHarness has the most complex control flow:
 * 1. Coordinator compresses story history (sliding window)
 * 2. FinalWriter generates chapter text
 * 3. ReIO validates against outline, rewrites if deviated
 * 4. Writer-Reader simulation (optional 1-round feedback)
 */

const { createHarnessConfig } = require('../HarnessConfig');

const LANG_CONFIG = {
  ko: {
    name: '한국어',
    script: '한글',
    writeRule: '반드시 100% 한국어로 작성 — 중국어/일본어/영어 단어 절대 금지',
    failRules: [
      'Using ANY Chinese characters (汉字) in the text — this is Korean fiction',
      'Using Japanese (ひらがな/カタカナ) in the text',
      'Mixing languages — the ENTIRE text must be pure Korean (한글)',
    ],
    validChar: /[\uAC00-\uD7AF]/,      // Hangul
    badChars: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g, // Chinese + Hiragana + Katakana
    charPerWord: 2.5,  // Korean: ~2.5 chars per "word"
  },
  en: {
    name: 'English',
    script: 'Latin alphabet',
    writeRule: 'Write entirely in English — no Korean/Chinese/Japanese characters',
    failRules: [
      'Using any Korean (한글), Chinese (汉字), or Japanese characters',
      'Mixing languages — the text must be pure English',
    ],
    validChar: /[a-zA-Z]/,
    badChars: /[\uAC00-\uD7AF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g,
    charPerWord: 1,  // English words = actual words
  },
  ja: {
    name: '日本語',
    script: 'ひらがな・カタカナ・漢字',
    writeRule: '必ず日本語で書く — 韓国語や純中国語は絶対禁止',
    failRules: [
      'Using Korean characters (한글)',
      'Pure Chinese without Japanese (must use hiragana/katakana)',
      'Mixing English words excessively',
    ],
    validChar: /[\u3040-\u309F\u30A0-\u30FF]/, // Hiragana + Katakana (Japanese markers)
    badChars: /[\uAC00-\uD7AF]/g, // Korean only — Chinese kanji is OK in Japanese
    charPerWord: 2,
  },
};

function createWritingHarness(options = {}) {
  const genre = options.genre || 'romance';
  const targetWordCount = options.targetWordCount || 3000;
  const chapterNumber = options.chapterNumber || 1;
  const language = options.language || 'ko';
  const langCfg = LANG_CONFIG[language] || LANG_CONFIG.ko;

  return createHarnessConfig({
    name: 'writer',
    role: `Creative fiction writer specializing in ${genre}. You write immersive, emotionally engaging prose with vivid descriptions and authentic dialogue.`,

    intent: {
      goal: `Write chapter ${chapterNumber} (MINIMUM ${targetWordCount} words, aim for ${Math.floor(targetWordCount * 1.2)}) following the chapter plan. Maintain consistency with previous chapters.`,
      successCriteria: [
        `Write AT LEAST ${targetWordCount} words — longer is better, shorter is FAILURE`,
        'Follow the chapter plan sub-events in order',
        'End with a cliffhanger or emotional hook',
        'Maintain character voice consistency — use EXACT names from outline',
        'Show, don\'t tell — use sensory details (sight, sound, smell, touch, taste)',
        langCfg.writeRule,
        genre === 'romance' ? 'Build emotional tension between leads' :
        genre === 'fantasy' ? 'Vivid world-building through action' :
        genre === 'thriller' ? 'Escalating suspense and pacing' :
        'Engaging narrative voice',
      ],
      failureCriteria: [
        'Deviating from the chapter plan outline',
        'INVENTING NEW CHARACTERS not in the outline — use ONLY provided character names',
        'Changing character names, ages, or occupations from the outline',
        ...langCfg.failRules,
        'Breaking character consistency',
        'Telling emotions instead of showing them',
        'Writing less than the minimum word count',
        'Abrupt ending without hook',
        'Repetitive sentence patterns',
      ],
    },

    memory: {
      readKeys: [
        'planner/handoff:chapter_plan',
        'outliner/handoff:outline',
      ],
      writeKeys: ['handoff:episode'],
      injectSummary: true, // See all previous chapter results
      getContext: options.getContext || null, // CGB episode history
    },

    planning: {
      stages: ['compress_history', 'write', 'reio_check'],
      maxIterations: 3, // Write → ReIO check → rewrite (max 3)
    },

    authority: {
      maxTokens: 16384, // DashScope qwen3.5-flash max (32K은 API 400 에러)
      maxRetries: 2,
      timeoutMs: 300_000, // 5 min for long generation
      validate: (output) => {
        const wordCount = output.split(/\s+/).length;
        const charCount = output.replace(/\s/g, '').length;
        const hasValidScript = langCfg.validChar.test(output);
        const minWords = Math.floor(targetWordCount * 0.6);
        // Language-aware word count (Korean/Japanese use char count, English uses word count)
        const effectiveCount = langCfg.charPerWord > 1
          ? Math.max(wordCount, Math.floor(charCount / langCfg.charPerWord))
          : wordCount;
        if (effectiveCount < minWords) {
          return { valid: false, reason: `Only ${effectiveCount} words (${charCount} chars), need at least ${minWords} for ${langCfg.name}` };
        }
        if (!hasValidScript) {
          return { valid: false, reason: `No ${langCfg.script} detected — expected ${langCfg.name} text` };
        }
        // Meta-text check
        if (output.includes('[continue]') || output.includes('[to be continued by]')) {
          return { valid: false, reason: 'LLM broke character — meta-text detected' };
        }
        // Wrong-language contamination check
        const badChars = output.match(langCfg.badChars);
        if (badChars && badChars.length > 50) {
          return { valid: false, reason: `Wrong-language contamination: ${badChars.length} invalid chars for ${langCfg.name}` };
        }
        return { valid: true };
      },
    },

    control: {
      onSuccess: 'handoff',
      onFailure: 'retry',
      // ReIO: continue if outline deviation detected (WritingAgent reruns)
      shouldContinue: (output, iteration) => {
        if (iteration >= 3) return false; // Max ReIO rounds
        // Simple deviation check — can be enhanced with LLM evaluation
        return false; // Default: don't auto-continue, let EvaluationHarness handle
      },
    },

    tools: {
      llmProvider: 'dashscope',
      llmModel: options.model || 'qwen3.5-flash',
      useCGB: true,
      cgbAPIs: ['/api/v1/graph/search', '/api/v1/creative/evaluate'],
    },

    handoff: {
      artifactKey: `writer/chapter_${chapterNumber}`,
      artifactFormat: 'text',
      transform: (output) => {
        // Language-specific cleanup: strip chars from wrong languages
        const badChars = output.match(langCfg.badChars);
        let cleaned = output;
        if (badChars && badChars.length > 0) {
          console.warn(`[WritingHarness:${language}] Stripping ${badChars.length} wrong-language chars`);
          cleaned = output.replace(langCfg.badChars, '');
        }
        return {
          chapterNumber,
          title: extractTitle(cleaned),
          content: cleaned,
          wordCount: cleaned.split(/\s+/).length,
        };
      },
    },
  });
}

/** Korean-aware word count: Korean chars/2.5 or space-split, whichever is higher */
function countWords(text) {
  if (!text) return 0;
  const wordCount = text.split(/\s+/).length;
  const charCount = text.replace(/\s/g, '').length;
  const isKorean = /[\uAC00-\uD7AF]/.test(text);
  return isKorean ? Math.max(wordCount, Math.floor(charCount / 2.5)) : wordCount;
}

function extractTitle(text) {
  // Try various title patterns (English + Korean)
  const titleMatch = text.match(/^TITLE:\s*(.+)/mi)
    || text.match(/^제목:\s*(.+)/mi)
    || text.match(/^##?\s*(.+)/m);
  if (titleMatch) return titleMatch[1].trim();
  // First line as fallback
  const firstLine = text.split('\n')[0]?.trim();
  return firstLine && firstLine.length < 100 ? firstLine : 'Untitled';
}

/**
 * Build the writing prompt with dynamic history compression.
 * StoryWriter paper: sliding window [2, k-1] for optimal compression.
 */
function buildWritingPrompt(chapterPlan, previousChapters = [], options = {}) {
  const parts = [];

  // Long-term memory: series premise + character sheet (anchors)
  if (options.premise) {
    parts.push('## Series Premise (Long-Term Memory)', options.premise, '');
  }

  // CHARACTER SHEET — CRITICAL for consistency (fixes handoff issue)
  if (options.outline) {
    const outlineStr = typeof options.outline === 'string' ? options.outline : JSON.stringify(options.outline, null, 2);
    parts.push(
      '## Story Outline & Characters (from OutlineAgent — YOU MUST USE THESE)',
      '⚠️ CRITICAL: Use EXACTLY these character names, settings, and relationships.',
      'Do NOT invent new characters or change names. Follow this outline strictly.',
      '',
      outlineStr.slice(0, 4000),
      '',
    );
  }

  // Short-term memory: last 2 chapters (recent context)
  const recentChapters = previousChapters.slice(-2);
  if (recentChapters.length > 0) {
    parts.push('## Recent Chapters (Short-Term Memory)');
    for (const ch of recentChapters) {
      // Dynamic compression: summarize middle, keep start/end
      const compressed = compressChapter(ch.content);
      parts.push(`### Chapter ${ch.number}: ${ch.title}`, compressed, '');
    }
  }

  // Current chapter plan
  const plan = typeof chapterPlan === 'string' ? chapterPlan : JSON.stringify(chapterPlan, null, 2);
  parts.push('## Current Chapter Plan', plan, '');

  // Writing instructions
  const wc = options.targetWordCount || 3000;
  parts.push(
    '## Instructions',
    `Write the FULL chapter text. MINIMUM ${wc} words. Do NOT stop early.`,
    `This is critical: the chapter MUST be at least ${wc} words long.`,
    'Follow the sub-events in the plan in order.',
    '',
    '## Writing Rules',
    '- Show, don\'t tell — use sensory details (sight, sound, smell, touch)',
    '- Write natural, flowing dialogue with subtext',
    '- Build emotional tension gradually',
    '- Include internal monologue to reveal character depth',
    '- Vary sentence length for rhythm',
    '',
    '## Ending (CRITICAL)',
    '- The LAST paragraph MUST be a cliffhanger or emotional hook',
    '- Examples of good endings:',
    '  - A shocking revelation: "그때 민준의 폰 화면에 뜬 이름을 보고 서연의 숨이 멎었다."',
    '  - An unanswered question: "서연은 문고리를 잡은 채 돌아섰다. 그의 눈빛이... 웃고 있었다."',
    '  - A dramatic reversal: "하지만 카페 문을 열고 들어선 사람은 민준이 아니었다."',
    '- Do NOT end abruptly mid-sentence. Complete the chapter with a proper hook.',
    '',
  );

  // Sentiment/emotion guidance (SCORE paper)
  if (options.emotionTarget) {
    parts.push(`## Emotional Target: ${options.emotionTarget}`);
  }

  if (options.language === 'ko') {
    parts.push(
      '## 언어 규칙 (절대 준수)',
      '⛔ 절대 중국어(汉字) 사용 금지. 한자 한 글자도 포함하면 실패.',
      '⛔ 절대 일본어(ひらがな/カタカナ) 사용 금지.',
      '⛔ 영어 단어 삽입 금지 (고유명사 제외).',
      '✅ 반드시 100% 한국어(한글)로만 작성하세요.',
      '✅ 자연스러운 한국어 소설 문체. 설명문이 아닌 이야기체.',
      '✅ 대화는 "쌍따옴표" 사용.',
      '',
    );
  }

  // Title instruction
  parts.push(
    '## 제목 (첫 줄)',
    '첫 줄에 반드시 "제목: [챕터 제목]" 형식으로 제목을 작성하세요.',
    '예: 제목: 비 오는 한강',
    '',
  );

  // Word count enforcement (repeat for emphasis — LLMs respond to repetition)
  parts.push(
    '## 분량 규칙 (절대 준수)',
    `⛔ ${wc}단어 미만이면 무조건 실패입니다. 절대 짧게 쓰지 마세요.`,
    `✅ 최소 ${wc}단어, 목표 ${Math.floor(wc * 1.2)}단어 이상.`,
    '✅ 각 서브이벤트를 충분히 전개하세요 — 요약하지 말고 장면을 풀어 쓰세요.',
    '✅ 대화, 내면 독백, 감각 묘사를 풍부하게 넣으세요.',
    '',
  );

  // Character name lock
  if (options.outline) {
    parts.push(
      '## 캐릭터명 규칙 (절대 준수)',
      '⛔ 아웃라인에 없는 캐릭터를 새로 만들지 마세요.',
      '⛔ 캐릭터 이름을 변경하거나 다른 이름으로 부르지 마세요.',
      '✅ 위 아웃라인의 캐릭터 이름을 정확히 그대로 사용하세요.',
      '',
    );
  }

  return parts.join('\n');
}

/**
 * Compress chapter history (StoryWriter: sliding window [2, k-1]).
 * Keep first 200 chars + last 200 chars, summarize middle.
 */
function compressChapter(content, maxLength = 800) {
  if (!content || content.length <= maxLength) return content || '';
  const head = content.slice(0, 300);
  const tail = content.slice(-300);
  return `${head}\n\n[... compressed ...]\n\n${tail}`;
}

module.exports = { createWritingHarness, buildWritingPrompt, compressChapter, extractTitle, countWords };
