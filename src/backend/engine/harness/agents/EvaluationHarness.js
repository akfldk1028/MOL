/**
 * EvaluationHarness — Independent quality evaluator agent harness
 *
 * Paper: Anthropic 3-agent harness (2026) — "separating the agent doing the work
 *        from the agent judging it proves to be a strong lever"
 * Paper: StoryWriter (CIKM 2025) — HANNA 6-dimension evaluation
 * Paper: Long Story KG (2025) — Writer-Reader simulator (1-round)
 * Paper: SCORE (2025) — emotional consistency + state tracking
 *
 * Input:  HandoffArtifact('episode') from WritingAgent
 * Output: HandoffArtifact('evaluation') → scores + feedback → back to WritingAgent if needed
 *
 * Key: Evaluator uses CHEAPER model (qwen-turbo) since evaluation is simpler than generation.
 * Few-shot calibrated examples ensure consistent scoring.
 */

const { createHarnessConfig } = require('../HarnessConfig');

function createEvaluationHarness(options = {}) {
  const genre = options.genre || 'romance';
  const passThreshold = options.passThreshold || 3.5; // Out of 5

  return createHarnessConfig({
    name: 'evaluator',
    role: `Expert literary critic and story quality evaluator. You assess fiction across 6 standardized dimensions. Genre expertise: ${genre}.`,

    intent: {
      goal: 'Evaluate the generated chapter/episode across 6 dimensions and provide specific, actionable feedback.',
      successCriteria: [
        'Score each of 6 dimensions (1-5 scale)',
        'Provide specific quotes/examples for each score',
        'Give actionable improvement suggestions',
        'Flag any character inconsistencies or plot holes',
        'Check emotional arc consistency (SCORE)',
      ],
      failureCriteria: [
        'Vague feedback like "good job" or "needs improvement"',
        'Scores without justification',
        'Missing any of the 6 dimensions',
        'Being too lenient (all 5s) or too harsh (all 1s)',
      ],
    },

    memory: {
      readKeys: [
        'writer/chapter_*',         // The episode to evaluate
        'outliner/handoff:outline',  // Compare against original plan
        'planner/handoff:chapter_plan',
      ],
      writeKeys: ['handoff:evaluation'],
      injectSummary: true,
    },

    planning: {
      stages: ['evaluate'],
      maxIterations: 1, // Single evaluation pass — no retries needed
    },

    authority: {
      maxTokens: 4096,
      maxRetries: 1,
      timeoutMs: 60_000,
      validate: (output) => {
        // Must contain score patterns (JSON or text format)
        const hasScores = /\d\s*\/\s*5/g.test(output)
          || /score[:\s]*\d/gi.test(output)
          || /"(relevance|coherence|empathy|surprise|creativity|complexity)"\s*:\s*\d/i.test(output)
          || /overallScore/i.test(output);
        if (!hasScores) return { valid: false, reason: 'No scores found in evaluation output' };
        return { valid: true };
      },
    },

    control: {
      onSuccess: 'handoff',
      onFailure: 'retry',
    },

    tools: {
      llmProvider: 'dashscope',
      llmModel: options.model || 'qwen-turbo',
      useCGB: true,
      cgbAPIs: ['/api/v1/creative/evaluate'],
    },

    handoff: {
      artifactKey: 'evaluator/evaluation',
      artifactFormat: 'json',
      transform: (output) => parseEvaluationOutput(output, passThreshold),
    },
  });
}

/**
 * Parse LLM evaluation output into structured scores.
 * HANNA dimensions: Relevance, Coherence, Empathy, Surprise, Creativity, Complexity
 */
function parseEvaluationOutput(raw, passThreshold = 3.5) {
  const dimensions = ['relevance', 'coherence', 'empathy', 'surprise', 'creativity', 'complexity'];
  const scores = {};
  let feedback = '';

  // Try JSON first (fenced or unfenced)
  try {
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = fenceMatch ? fenceMatch[1] : raw;
    // Find the outermost { ... }
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(jsonStr.slice(start, end + 1));
      if (parsed.scores) {
        const scoreVals = Object.values(parsed.scores).filter(v => typeof v === 'number');
        const overall = parsed.overallScore || (scoreVals.length > 0
          ? scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length : 0);
        const passed = overall >= passThreshold;
        return {
          ...parsed,
          overallScore: Math.round(overall * 10) / 10,
          passed,
          rewriteRequired: !passed,
          missing: parsed.missing || '',
          superfluous: parsed.superfluous || '',
          searchQueries: Array.isArray(parsed.searchQueries) ? parsed.searchQueries.slice(0, 3) : [],
        };
      }
    }
  } catch {}

  // Parse dimension:score patterns (multiple formats)
  for (const dim of dimensions) {
    const patterns = [
      new RegExp(`"${dim}"\\s*:\\s*(\\d+\\.?\\d*)`, 'i'),                   // "relevance": 4
      new RegExp(`${dim}[:\\s]+(\\d+\\.?\\d*)\\s*(?:\\/\\s*5)?`, 'i'),      // relevance: 4/5
      new RegExp(`${dim}[:\\s]*.*?(\\d)\\s*\\/\\s*5`, 'i'),                  // relevance ... 4/5
      new RegExp(`\\*\\*${dim}\\*\\*[:\\s]*(\\d+\\.?\\d*)`, 'i'),            // **relevance**: 4
      new RegExp(`\\d+\\.\\s*\\*\\*${dim}\\*\\*.*?(\\d+\\.?\\d*)`, 'i'),     // 1. **Relevance** ... 4
    ];
    for (const p of patterns) {
      const m = raw.match(p);
      if (m) { scores[dim] = parseFloat(m[1]); break; }
    }
  }

  // Extract feedback section
  const feedbackMatch = raw.match(/(?:feedback|suggestions?|improvements?)[:\s]*([\s\S]+?)(?=##|\n\n\n|$)/i);
  feedback = feedbackMatch ? feedbackMatch[1].trim() : '';

  // Extract missing/superfluous (Reflexion pattern)
  const missingMatch = raw.match(/(?:missing|부족한\s*(?:점|요소|부분))[:\s]*([\s\S]+?)(?=##|\n\n\n|superfluous|불필요|$)/i);
  const superfluousMatch = raw.match(/(?:superfluous|불필요한?\s*(?:점|요소|부분)|제거)[:\s]*([\s\S]+?)(?=##|\n\n\n|$)/i);

  // Calculate overall
  const scoreValues = Object.values(scores).filter(v => typeof v === 'number');
  const overallScore = scoreValues.length > 0
    ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
    : 0;

  return {
    scores,
    overallScore: Math.round(overallScore * 10) / 10,
    passed: overallScore >= passThreshold,
    feedback,
    missing: missingMatch ? missingMatch[1].trim() : '',
    superfluous: superfluousMatch ? superfluousMatch[1].trim() : '',
    searchQueries: [],
    rewriteRequired: overallScore < passThreshold,
    // Keep partial scores + raw for RL (even 2/6 dimensions are useful signal)
    raw: scoreValues.length < 6 ? raw : undefined,
    strengths: [],
    weaknesses: feedback ? [feedback] : [],
  };
}

/**
 * Build evaluation prompt with few-shot calibration examples.
 * Anthropic pattern: explicit scoring criteria + calibrated examples.
 */
function buildEvaluationPrompt(episodeText, outlinePlan, options = {}) {
  const parts = [
    '## Task: Evaluate This Chapter',
    '',
    '### Original Plan',
    typeof outlinePlan === 'string' ? outlinePlan.slice(0, 1000) : JSON.stringify(outlinePlan).slice(0, 1000),
    '',
    '### Chapter Text',
    episodeText.slice(0, 8000),
    '',
    '## Evaluation Criteria (HANNA Framework, 1-5 scale)',
    '',
    '1. **Relevance** (1-5): Does the chapter follow the planned outline?',
    '2. **Coherence** (1-5): Is the plot logical and internally consistent?',
    '3. **Empathy** (1-5): Do characters feel real? Can readers connect emotionally?',
    '4. **Surprise** (1-5): Are there unexpected but logical twists or revelations?',
    '5. **Creativity** (1-5): Is the writing original and imaginative?',
    '6. **Complexity** (1-5): Does the narrative have multiple layers and interwoven elements?',
    '',
    '## Calibration Examples',
    '- Score 5: Publication-quality prose with vivid sensory details, complex character dynamics, surprising plot turns',
    '- Score 4: Engaging read with good pacing, minor rough edges in dialogue or description',
    '- Score 3: Competent but generic — reads like AI-generated content with formulaic patterns',
    '- Score 2: Significant issues — plot holes, flat characters, telling instead of showing',
    '- Score 1: Incoherent, off-topic, or unreadable',
    '',
    '## Output Format',
    'Return a JSON block:',
    '```json',
    '{',
    '  "scores": { "relevance": N, "coherence": N, "empathy": N, "surprise": N, "creativity": N, "complexity": N },',
    '  "overallScore": N.N,',
    '  "missing": "What important elements are absent? (plot threads, character depth, sensory details, etc.)",',
    '  "superfluous": "What should be removed or condensed? (redundant descriptions, filler dialogue, etc.)",',
    '  "feedback": "Specific, actionable improvement suggestions with quotes from the text",',
    '  "strengths": ["what worked well"],',
    '  "weaknesses": ["what needs improvement"],',
    '  "searchQueries": ["1-3 search queries for CGB graph to find style/knowledge references that could improve this chapter"]',
    '}',
    '```',
  ];

  const lang = options.language || 'ko';
  const EVAL_LANG = {
    ko: [
      '', '## 한국어 품질 추가 기준',
      '- 자연스러운 한국어 문체인가? (번역체 X, 설명문 X)',
      '- 대화가 한국어 구어체로 자연스러운가?',
      '- 중국어(汉字)/일본어가 섞여 있지 않은가?',
      '- 한국 문화/배경에 맞는 설정인가?', '',
      '한국어로 평가를 작성하세요.',
    ],
    en: [
      '', '## English Quality Additional Criteria',
      '- Natural flowing English prose (not translated-sounding)?',
      '- Dialogue reads like authentic spoken English?',
      '- No Korean/Chinese/Japanese characters mixed in?',
      '- Setting and culture consistent with English-speaking context?', '',
      'Write the evaluation in English.',
    ],
    ja: [
      '', '## 日本語品質追加基準',
      '- 自然な日本語文体か？（翻訳調ではない）',
      '- 会話が日本語の話し言葉として自然か？',
      '- 韓国語が混ざっていないか？',
      '- 日本の文化・背景に合った設定か？', '',
      '日本語で評価を書いてください。',
    ],
  };
  parts.push(...(EVAL_LANG[lang] || EVAL_LANG.ko));

  return parts.join('\n');
}

module.exports = { createEvaluationHarness, parseEvaluationOutput, buildEvaluationPrompt };
