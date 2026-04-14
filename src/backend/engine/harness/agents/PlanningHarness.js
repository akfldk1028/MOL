/**
 * PlanningHarness — SubTasker + Weaver (Non-Linear Narration) agent harness
 *
 * Paper: StoryWriter (CIKM 2025) — NLN strategy based on Genette's narrative order theory
 * Paper: Long Story KG (2025) — cosine similarity → twist vs plain decision
 * Paper: KG-Guided Storytelling (2025) — genre-dependent KG strategy
 *
 * Input:  HandoffArtifact('outline') from OutlineAgent
 * Output: HandoffArtifact('chapter_plan') → chapters with distributed sub-events
 */

const { createHarnessConfig } = require('../HarnessConfig');

function createPlanningHarness(options = {}) {
  const genre = options.genre || 'romance';
  const maxChapters = options.maxChapters || 20;

  // Genre-dependent KG strategy (KG-Guided Storytelling paper)
  const kgIntensity = ['fantasy', 'sci-fi', 'action', 'adventure', 'mystery'].includes(genre)
    ? 'high'   // KG very effective for kinetic narratives
    : 'low';   // KG can hinder introspective/romance — use emotion curve instead

  return createHarnessConfig({
    name: 'planner',
    role: `Story structure architect. You plan non-linear chapter layouts using Genette's narrative theory. Genre: ${genre}.`,

    intent: {
      goal: `Decompose events into sub-events and distribute across ${maxChapters} chapters with non-linear narration.`,
      successCriteria: [
        'Each event broken into 2-4 sub-events',
        'Sub-events distributed across multiple chapters (interweaving)',
        'Chronological order may be broken for dramatic effect (analepsis/prolepsis)',
        'Each chapter has clear dramatic purpose and cliffhanger potential',
        `KG intensity: ${kgIntensity} — ${kgIntensity === 'high' ? 'use graph nodes for world-building' : 'focus on emotional arcs'}`,
      ],
      failureCriteria: [
        'Strict chronological ordering without any interweaving',
        'All sub-events of one event crammed into single chapter',
        'Chapters with no dramatic tension or purpose',
      ],
    },

    memory: {
      readKeys: ['outliner/handoff:outline'], // Read outline from OutlineAgent
      writeKeys: ['handoff:chapter_plan'],
      injectSummary: true,
      getContext: options.getContext || null,
    },

    planning: {
      stages: ['decompose_events', 'distribute_chapters'],
      maxIterations: 2,
    },

    authority: {
      maxTokens: 8192,
      maxRetries: 2,
      timeoutMs: 90_000,
      validate: (output) => {
        const chapterCount = (output.match(/Chapter\s*\d+|챕터\s*\d+|Ch\s*\d+/gi) || []).length;
        if (chapterCount < 3) return { valid: false, reason: `Only ${chapterCount} chapters, need at least 3` };
        return { valid: true };
      },
    },

    control: {
      onSuccess: 'handoff',
      onFailure: 'retry',
    },

    tools: {
      llmProvider: 'dashscope',
      llmModel: options.model || 'qwen3.5-flash',
      useCGB: kgIntensity === 'high',
      cgbAPIs: kgIntensity === 'high'
        ? ['/api/v1/creative/brainstorm', '/api/v1/graph/search']
        : [],
    },

    handoff: {
      artifactKey: 'planner/chapter_plan',
      artifactFormat: 'json',
      transform: (output) => parseChapterPlan(output),
    },
  });
}

function parseChapterPlan(raw) {
  try {
    const fenceMatch = raw.match(/```json\s*([\s\S]*?)```/);
    if (fenceMatch) return JSON.parse(fenceMatch[1]);
  } catch {}

  // I4 fix: Use matchAll instead of fragile exec loop
  const chapterRegex = /(?:Chapter|Ch|챕터)\s*(\d+)[:\s]*([^\n]*)/gi;
  const matches = [...raw.matchAll(chapterRegex)];
  const chapters = matches.map((match, i) => {
    const start = match.index;
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    return {
      number: parseInt(match[1]),
      title: match[2].trim() || `Chapter ${match[1]}`,
      content: raw.slice(start, end).trim(),
    };
  });

  return { chapters, raw: chapters.length === 0 ? raw : undefined };
}

function buildPlanningPrompt(outlineArtifact, options = {}) {
  const outline = typeof outlineArtifact === 'string'
    ? outlineArtifact
    : JSON.stringify(outlineArtifact, null, 2);

  const parts = [
    '## Story Outline (from OutlineAgent)',
    outline,
    '',
    '## Task: Create Chapter Plan',
    '1. Break each event into 2-4 sub-events',
    '2. Distribute sub-events across chapters using Non-Linear Narration (NLN)',
    '   - Use analepsis (flashback) and prolepsis (flash-forward) for dramatic effect',
    '   - Interweave multiple event lines in single chapters',
    '3. Each chapter should end with a hook or cliffhanger',
    '',
    'Format:',
    'Chapter N: [Title]',
    '- Sub-events: [list which sub-events appear]',
    '- Characters: [who appears]',
    '- Dramatic purpose: [why this chapter matters]',
    '- Cliffhanger: [how it ends]',
  ];

  const lang = options.language || 'ko';
  const LANG_INSTR = { ko: '한국어로 작성하세요.', en: 'Write in English.', ja: '日本語で書いてください。' };
  parts.push('', LANG_INSTR[lang] || LANG_INSTR.ko);

  return parts.join('\n');
}

module.exports = { createPlanningHarness, parseChapterPlan, buildPlanningPrompt };
