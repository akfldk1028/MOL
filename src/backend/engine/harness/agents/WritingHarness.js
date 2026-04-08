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

function createWritingHarness(options = {}) {
  const genre = options.genre || 'romance';
  const targetWordCount = options.targetWordCount || 3000;
  const chapterNumber = options.chapterNumber || 1;

  return createHarnessConfig({
    name: 'writer',
    role: `Creative fiction writer specializing in ${genre}. You write immersive, emotionally engaging prose with vivid descriptions and authentic dialogue.`,

    intent: {
      goal: `Write chapter ${chapterNumber} (~${targetWordCount} words) following the chapter plan. Maintain consistency with previous chapters.`,
      successCriteria: [
        `Write approximately ${targetWordCount} words (±20%)`,
        'Follow the chapter plan sub-events in order',
        'End with a cliffhanger or emotional hook',
        'Maintain character voice consistency',
        'Show, don\'t tell — use sensory details',
        genre === 'romance' ? 'Build emotional tension between leads' :
        genre === 'fantasy' ? 'Vivid world-building through action' :
        genre === 'thriller' ? 'Escalating suspense and pacing' :
        'Engaging narrative voice',
      ],
      failureCriteria: [
        'Deviating from the chapter plan outline',
        'INVENTING NEW CHARACTERS not in the outline — use ONLY provided character names',
        'Changing character names, ages, or occupations from the outline',
        'Breaking character consistency',
        'Telling emotions instead of showing them',
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
      maxTokens: 32768, // Long output for full chapters (increased from 16K)
      maxRetries: 2,
      timeoutMs: 300_000, // 5 min for long generation
      validate: (output) => {
        // S4: Korean text has fewer spaces — use char count as fallback
        const wordCount = output.split(/\s+/).length;
        const charCount = output.replace(/\s/g, '').length;
        const isKorean = /[\uAC00-\uD7AF]/.test(output);
        const minWords = Math.floor(targetWordCount * 0.5);
        const effectiveCount = isKorean ? Math.max(wordCount, Math.floor(charCount / 3)) : wordCount;
        if (effectiveCount < minWords) {
          return { valid: false, reason: `Only ${effectiveCount} words (${charCount} chars), need at least ${minWords}` };
        }
        // Check for common LLM failure modes
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
      llmModel: options.model || process.env.GLM_MODEL || 'qwen3.5-flash', // GLM free → DashScope fallback
      useCGB: true,
      cgbAPIs: ['/api/v1/graph/search', '/api/v1/creative/evaluate'],
    },

    handoff: {
      artifactKey: `writer/chapter_${chapterNumber}`,
      artifactFormat: 'text',
      transform: (output) => ({
        chapterNumber,
        title: extractTitle(output),
        content: output,
        wordCount: output.split(/\s+/).length,
      }),
    },
  });
}

function extractTitle(text) {
  // Try TITLE: pattern
  const titleMatch = text.match(/^TITLE:\s*(.+)/mi) || text.match(/^#\s*(.+)/m);
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
    parts.push('반드시 한국어로 작성하세요. 자연스러운 한국어 문체를 사용하세요.');
    parts.push('소설처럼 자연스러운 문장을 쓰세요. 설명문이 아닌 이야기체로.');
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

module.exports = { createWritingHarness, buildWritingPrompt, compressChapter, extractTitle };
