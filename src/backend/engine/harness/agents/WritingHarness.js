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
        // Pre-clean: strip wrong-language chars first, then check length
        const cleaned = output.replace(langCfg.badChars, '');
        const badCharsCount = (output.match(langCfg.badChars) || []).length;

        // If contamination heavy, reject first (transform will strip but we want retry with cleaner output)
        if (badCharsCount > 100) {
          return { valid: false, reason: `Wrong-language contamination: ${badCharsCount} invalid chars for ${langCfg.name} — LLM wrote in wrong language` };
        }

        const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
        const charCount = cleaned.replace(/\s/g, '').length;
        const hasValidScript = langCfg.validChar.test(cleaned);
        const minWords = Math.floor(targetWordCount * 0.6);
        // Language-aware word count on CLEANED text (after stripping wrong-lang chars)
        const effectiveCount = langCfg.charPerWord > 1
          ? Math.max(wordCount, Math.floor(charCount / langCfg.charPerWord))
          : wordCount;
        if (effectiveCount < minWords) {
          return { valid: false, reason: `Only ${effectiveCount} effective words (${charCount} valid chars after cleaning), need at least ${minWords} for ${langCfg.name}` };
        }
        if (!hasValidScript) {
          return { valid: false, reason: `No ${langCfg.script} detected — expected ${langCfg.name} text` };
        }
        // Meta-text check
        if (output.includes('[continue]') || output.includes('[to be continued by]')) {
          return { valid: false, reason: 'LLM broke character — meta-text detected' };
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
  const chapterNumber = options.chapterNumber || 1;

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
    '- Types: shocking revelation / unanswered question / dramatic reversal',
    '- Do NOT end abruptly mid-sentence. Complete the chapter with a proper hook.',
    '',
  );

  // Sentiment/emotion guidance (SCORE paper)
  if (options.emotionTarget) {
    parts.push(`## Emotional Target: ${options.emotionTarget}`);
  }

  // Language-specific rules + title + word count + character rules
  const lang = options.language || 'ko';
  const LANG_PROMPT_BLOCK = {
    ko: {
      langRules: [
        '## 언어 규칙 (절대 준수)',
        '⛔ 절대 중국어(汉字) 사용 금지. 한자 한 글자도 포함하면 실패.',
        '⛔ 절대 일본어(ひらがな/カタカナ) 사용 금지.',
        '⛔ 영어 단어 삽입 금지 (고유명사 제외).',
        '✅ 반드시 100% 한국어(한글)로만 작성하세요.',
        '✅ 자연스러운 한국어 소설 문체. 설명문이 아닌 이야기체.',
        '✅ 대화는 "쌍따옴표" 사용.',
        '',
      ],
      titleInstr: [
        '## 제목 (첫 줄)',
        '첫 줄에 반드시 "제목: [챕터 제목]" 형식으로 제목을 작성하세요.',
        '예: 제목: 비 오는 한강',
        '',
      ],
      wordRule: [
        '## 분량 규칙 (절대 준수)',
        `⛔ ${wc}단어 미만이면 무조건 실패입니다. 절대 짧게 쓰지 마세요.`,
        `✅ 최소 ${wc}단어, 목표 ${Math.floor(wc * 1.2)}단어 이상.`,
        '✅ 각 서브이벤트를 충분히 전개하세요 — 요약하지 말고 장면을 풀어 쓰세요.',
        '✅ 대화, 내면 독백, 감각 묘사를 풍부하게 넣으세요.',
        '',
      ],
      charRule: [
        '## 캐릭터명 규칙 (절대 준수)',
        '⛔ 아웃라인에 없는 캐릭터를 새로 만들지 마세요.',
        '⛔ 캐릭터 이름을 변경하거나 다른 이름으로 부르지 마세요.',
        '✅ 위 아웃라인의 캐릭터 이름을 정확히 그대로 사용하세요.',
        '',
      ],
    },
    en: {
      langRules: [
        '## Language Rules (MUST FOLLOW)',
        '⛔ NO Korean (한글), Chinese (汉字), or Japanese characters anywhere.',
        '✅ Write in natural, flowing English prose.',
        '✅ Use standard punctuation: "double quotes" for dialogue.',
        '✅ Literary fiction style — show, don\'t tell.',
        '',
      ],
      titleInstr: [
        '## Title (First Line)',
        'The first line MUST be in this exact format: "Title: [chapter title]"',
        'Example: Title: The Midnight Stack Trace',
        '',
      ],
      wordRule: [
        '## Word Count Rule (MUST FOLLOW)',
        `⛔ Any output below ${wc} words is an automatic failure. Do NOT write short.`,
        `✅ Minimum ${wc} words, target ${Math.floor(wc * 1.2)}+ words.`,
        '✅ Fully develop each sub-event — don\'t summarize, write scenes.',
        '✅ Include dialogue, inner monologue, and sensory details.',
        '',
      ],
      charRule: [
        '## Character Name Rule (MUST FOLLOW)',
        '⛔ Do NOT invent new characters not in the outline.',
        '⛔ Do NOT change or rename characters.',
        '✅ Use the EXACT character names from the outline above.',
        '',
      ],
    },
    ja: {
      langRules: [
        '## 言語ルール（絶対遵守）',
        '⛔ 韓国語（한글）一切使用禁止。',
        '⛔ 英単語の過度な混入禁止（固有名詞除く）。',
        '✅ 必ず日本語（ひらがな・カタカナ・漢字）で執筆。',
        '✅ 自然な日本語の小説文体。説明文ではなく物語体。',
        '✅ 会話は「鍵括弧」を使用。',
        '',
      ],
      titleInstr: [
        '## タイトル（1行目）',
        '1行目に必ず「タイトル: [章のタイトル]」形式で記載してください。',
        '例: タイトル: 桜降る夜',
        '',
      ],
      wordRule: [
        '## 文字数ルール（絶対遵守）',
        `⛔ ${wc}語未満は失敗。絶対に短く書かないでください。`,
        `✅ 最低${wc}語、目標${Math.floor(wc * 1.2)}語以上。`,
        '✅ 各サブイベントを十分に展開してください — 要約ではなく場面を描いてください。',
        '✅ 対話、内心独白、感覚描写を豊富に入れてください。',
        '',
      ],
      charRule: [
        '## キャラクター名ルール（絶対遵守）',
        '⛔ アウトラインにないキャラクターを作らないでください。',
        '⛔ キャラクター名を変更・別名呼称しないでください。',
        '✅ 上のアウトラインのキャラクター名を正確にそのまま使用してください。',
        '',
      ],
    },
  };
  const block = LANG_PROMPT_BLOCK[lang] || LANG_PROMPT_BLOCK.ko;

  parts.push(...block.langRules);
  parts.push(...block.titleInstr);
  parts.push(...block.wordRule);
  if (options.outline) parts.push(...block.charRule);

  // B3: 1화 도입부 후크 강제 (R1 + R2 + R5)
  // 라이브 ep1 4편 정독 결과 모두 클리셰 + 정보 과다 + cliffhanger 부재로 예심 통과 어려움.
  // chapterNumber === 1일 때만 활성화.
  if (chapterNumber === 1) {
    if (lang === 'ko') {
      parts.push(
        '## 🔥 1화 오프닝 (절대 준수)',
        '',
        '**R1 — 첫 50자 후크**',
        '- 첫 문장: 갈등 / 의문 / 위험 셋 중 하나로 시작하라.',
        '- ⛔ 금지: 날씨/풍경 묘사, 자기소개("내 이름은~"), 평온한 일상.',
        '- ✅ 예시: "검을 휘두르는 순간, 나는 내 몸이 아님을 깨달았다."',
        '',
        '**R2 — 첫 200자 정보 ≤ 3 요소**',
        '- 인물 1~2명 + 사건 1개만. 세계관/배경/마법체계 일괄 노출 금지.',
        '- 정보는 2화 이후 점진 공개. 1화는 호기심 증폭이 목적.',
        '',
        '**R5 — 마지막 200자 cliffhanger**',
        '- 의문문(?), 생략(…), 전환어("다음 순간 / 그때 / 그러나") 중 하나로 끝내라.',
        '- ⛔ 금지: "이렇게 하루가 끝났다", "그는 결심했다" 같은 종료/요약형.',
        '',
        '**진부한 클리셰 금지**',
        '- 갑자기 변한 몸 / 잃어버린 후계자 / 의문의 노인 / 검은 나무 / 트럭에 치여 회귀',
        '- 위 패턴 사용 시 차별화된 변주 필수.',
        '',
      );
    } else if (lang === 'en') {
      parts.push(
        '## 🔥 Chapter 1 Opening (MANDATORY)',
        '',
        '**R1 — First 50 chars hook**: Open with conflict / mystery / danger. NO weather descriptions, self-introductions, or peaceful daily life.',
        '**R2 — First 200 chars info ≤ 3 elements**: 1-2 characters + 1 event. NO worldbuilding dump.',
        '**R5 — Last 200 chars cliffhanger**: End with question (?), ellipsis (...), or transition ("Then..." / "But...").',
        '**No tropes**: avoid "suddenly transformed body", "lost heir", "mysterious old man".',
        '',
      );
    } else if (lang === 'ja') {
      parts.push(
        '## 🔥 第1話オープニング（厳守）',
        '',
        '**R1**: 最初の50字は対立・謎・危険から始める。天候描写・自己紹介・平穏な日常は禁止。',
        '**R2**: 最初の200字は人物1～2名＋事件1つのみ。世界観の一括説明禁止。',
        '**R5**: 最後の200字は疑問符（？）・省略（…）・転換語（「次の瞬間」「だが」）で終わる。',
        '',
      );
    }
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
