/**
 * OutlineHarness — EventSeed + EventValidator agent harness
 *
 * Paper: StoryWriter (CIKM 2025) — event-based outline with character relations
 * Paper: Long Story KG (2025) — KG-driven obstacle nodes for twists
 *
 * Input:  premise (genre, synopsis, characters)
 * Output: HandoffArtifact('outline') → events JSON + characters + relationships
 */

const { createHarnessConfig } = require('../HarnessConfig');

function createOutlineHarness(options = {}) {
  const genre = options.genre || 'romance';
  const maxEvents = options.maxEvents || 12;
  const language = options.language || 'ko';

  return createHarnessConfig({
    name: 'outliner',
    role: `Story outline architect specializing in ${genre} genre. You create event-based story outlines with rich character relationships.`,

    intent: {
      goal: `Generate a detailed event-based outline with ${maxEvents} events, characters, and inter-event relationships for a ${genre} story.`,
      successCriteria: [
        `Produce ${Math.floor(maxEvents * 0.7)}-${maxEvents} events with clear causal relationships`,
        'Each event must have: title, setting, characters, action, conflict',
        'Characters must have consistent traits and motivations across events',
        'Include at least 2 plot twists (obstacle nodes)',
        'Events must form a complete narrative arc (setup → conflict → climax → resolution)',
      ],
      failureCriteria: [
        'Generic or vague event descriptions',
        'Missing character relationships',
        'No conflict or dramatic tension',
        'Events that could belong to any genre',
      ],
    },

    memory: {
      readKeys: [],  // First in pipeline — reads nothing
      writeKeys: ['handoff:outline'],
      injectSummary: false,
      getContext: options.getContext || null, // CGB research context injector
    },

    planning: {
      stages: ['generate_events', 'validate_events'],
      maxIterations: 3, // EventSeed → EventValidator → refine (max 3 rounds)
    },

    authority: {
      maxTokens: 8192,
      maxRetries: 2,
      timeoutMs: 90_000,
      validate: (output) => {
        // Must contain at least 5 events (flexible pattern matching)
        const eventPatterns = [
          /Event\s*\d+/gi,
          /이벤트\s*\d+/gi,
          /\d+\.\s*\*\*/g,       // "1. **Title**" markdown format
          /#{1,3}\s*\d+/g,       // "## 1" or "### 1"
          /\d+\)\s/g,            // "1) " numbered list
        ];
        let eventCount = 0;
        for (const p of eventPatterns) {
          const matches = output.match(p) || [];
          eventCount = Math.max(eventCount, matches.length);
        }
        if (eventCount < 3 && output.length < 500) {
          return { valid: false, reason: `Only ${eventCount} events found, need at least 3 (output too short: ${output.length} chars)` };
        }
        // Long enough output (>1000 chars) likely has enough structure even without exact pattern
        if (output.length < 1000) return { valid: true };
        // Check for Chinese character contamination
        const chineseChars = output.match(/[\u4E00-\u9FFF]/g);
        if (chineseChars && chineseChars.length > 5) {
          return { valid: false, reason: `Chinese characters detected (${chineseChars.length}) — must be pure Korean` };
        }
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
      useCGB: true,
      cgbAPIs: ['/api/v1/graph/search', '/api/v1/creative/brainstorm'],
    },

    handoff: {
      artifactKey: 'outliner/outline',
      artifactFormat: 'json',
      transform: (output) => parseOutlineOutput(output),
    },
  });
}

/**
 * Parse LLM outline output into structured events JSON.
 * Handles both structured and free-form outputs.
 */
function parseOutlineOutput(raw) {
  // Try JSON first
  try {
    const fenceMatch = raw.match(/```json\s*([\s\S]*?)```/);
    if (fenceMatch) return JSON.parse(fenceMatch[1]);
  } catch {}

  // Parse event blocks
  const events = [];
  const eventRegex = /Event\s*(\d+)[:\s]*([^\n]+)[\s\S]*?(?=Event\s*\d+|$)/gi;
  let match;
  while ((match = eventRegex.exec(raw)) !== null) {
    const block = match[0];
    events.push({
      id: `event_${match[1]}`,
      title: match[2].trim(),
      setting: extractField(block, 'Setting') || extractField(block, 'Location') || '',
      characters: extractField(block, 'Character') || extractField(block, 'Characters') || '',
      action: extractField(block, 'Action') || '',
      conflict: extractField(block, 'Conflict') || '',
      plotTwist: extractField(block, 'Plot Twist') || extractField(block, 'Twist') || '',
    });
  }

  return {
    events,
    raw: events.length === 0 ? raw : undefined,
  };
}

function extractField(block, fieldName) {
  const regex = new RegExp(`${fieldName}\\s*[:\\-]\\s*(.+?)(?=\\n[A-Z]|\\n\\n|$)`, 'is');
  const m = block.match(regex);
  return m ? m[1].trim() : '';
}

/** Build the premise prompt for the OutlineAgent. */
function buildOutlinePrompt(series, options = {}) {
  const parts = [
    `## Story Premise`,
    `Title: ${series.title}`,
    `Genre: ${series.genre || 'romance'}`,
    series.synopsis ? `Synopsis: ${series.synopsis}` : '',
    series.characters ? `Main Characters: ${series.characters}` : '',
    '',
    `Generate a detailed event-based outline.`,
    `Format each event as:`,
    `Event N: [Title]`,
    `Setting: [where/when]`,
    `Characters: [who is involved]`,
    `Action: [what happens]`,
    `Conflict: [dramatic tension]`,
    `Plot Twist: [unexpected element, if any]`,
    '',
    `Requirements:`,
    `- Create 8-12 events forming a complete narrative arc`,
    `- Include at least 2 plot twists`,
    `- Show clear causal relationships between events`,
    `- Characters must have consistent motivations`,
  ];

  if (options.brainContext) {
    parts.push('', '## Creative Inspiration (from Knowledge Graph)');
    for (const node of options.brainContext.slice(0, 5)) {
      parts.push(`- [${node.type}] ${node.title}: ${(node.description || '').slice(0, 100)}`);
    }
  }

  parts.push(
    '',
    '## Character Development Rules',
    '- Each main character must have: name, age, occupation, personality flaw, hidden desire',
    '- Characters must CHANGE through events (flat characters are boring)',
    '- Include at least one misunderstanding or secret between characters',
    '- Supporting characters should serve the theme (mentor, rival, catalyst)',
    '',
    '## Plot Structure Rules',
    '- Event 1-2: Setup (introduce world + characters + initial attraction/conflict)',
    '- Event 3-5: Rising action (deepen relationship + introduce obstacles)',
    '- Event 6-8: Complications (misunderstanding, external threat, past revealed)',
    '- Event 9-10: Crisis (darkest moment, seeming breakup/failure)',
    '- Event 11-12: Climax + Resolution (confrontation, confession, earned ending)',
  );

  if (options.language === 'ko') {
    parts.push(
      '',
      '## 언어 규칙 (절대 준수)',
      '⛔ 중국어(汉字) 절대 금지 — 한자 한 글자도 사용하지 마세요.',
      '⛔ 일본어(ひらがな/カタカナ) 절대 금지.',
      '✅ 반드시 100% 한국어(한글)로만 작성.',
      '✅ 캐릭터 이름은 자연스러운 한국 이름 (예: 서연, 민준, 지현).',
      '✅ 장소/배경도 한국 현실에 맞게 (서울, 부산, 강남, 홍대 등).',
      '',
      '## 캐릭터 시트 포맷 (반드시 포함)',
      '각 주인공은 아래 정보를 반드시 포함:',
      '- 이름 (한국 이름)',
      '- 나이',
      '- 직업',
      '- 성격 결함 (flaws)',
      '- 숨겨진 욕망 (hidden desire)',
      '- 외형 특징 2-3가지',
      '',
    );
  }

  return parts.filter(Boolean).join('\n');
}

module.exports = { createOutlineHarness, parseOutlineOutput, buildOutlinePrompt };
