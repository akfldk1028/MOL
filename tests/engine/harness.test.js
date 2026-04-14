const { AgentHarness, createHarnessConfig } = require('../../src/backend/engine/harness');
const { createOutlineHarness, parseOutlineOutput } = require('../../src/backend/engine/harness/agents/OutlineHarness');
const { createPlanningHarness, parseChapterPlan } = require('../../src/backend/engine/harness/agents/PlanningHarness');
const { createWritingHarness } = require('../../src/backend/engine/harness/agents/WritingHarness');
const { createEvaluationHarness, parseEvaluationOutput } = require('../../src/backend/engine/harness/agents/EvaluationHarness');
const { HandoffArtifact } = require('../../src/backend/engine/harness/HandoffArtifact');
const { SharedMemory } = require('../../src/backend/engine/open-multi-agent/shared-memory');

describe('HarnessConfig', () => {
  test('creates config with IMPACT defaults', () => {
    const config = createHarnessConfig({ name: 'test', role: 'tester' });
    expect(config.name).toBe('test');
    expect(config.intent.goal).toBe('');
    expect(config.authority.maxRetries).toBe(2);
    expect(config.tools.llmProvider).toBe('dashscope');
    expect(config.handoff.artifactFormat).toBe('text');
  });
});

describe('AgentHarness', () => {
  test('runs agent and returns result', async () => {
    const config = createHarnessConfig({
      name: 'test-agent',
      role: 'test',
      intent: { goal: 'test goal' },
    });
    const mockLLM = async () => 'hello from agent';
    const harness = new AgentHarness(config, mockLLM);
    const result = await harness.run('do something');
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello from agent');
    expect(result.iterations).toBe(1);
    expect(result.agent).toBe('test-agent');
  });

  test('retries on validation failure', async () => {
    let calls = 0;
    const config = createHarnessConfig({
      name: 'retry-agent',
      role: 'test',
      planning: { maxIterations: 3 },
      authority: {
        validate: (output) => {
          if (output.includes('bad')) return { valid: false, reason: 'bad output' };
          return { valid: true };
        },
      },
      control: { onFailure: 'retry' },
    });
    const mockLLM = async () => { calls++; return calls < 3 ? 'bad output' : 'good output'; };
    const harness = new AgentHarness(config, mockLLM);
    const result = await harness.run('test');
    expect(result.success).toBe(true);
    expect(result.output).toBe('good output');
    expect(result.iterations).toBe(3);
  });

  test('enforces timeout via Promise.race', async () => {
    const config = createHarnessConfig({
      name: 'slow-agent',
      role: 'test',
      authority: { timeoutMs: 100 },
    });
    const mockLLM = async () => new Promise(resolve => setTimeout(() => resolve('late'), 5000));
    const harness = new AgentHarness(config, mockLLM);
    const result = await harness.run('test');
    expect(result.success).toBe(false);
    expect(result.output).toContain('timeout');
  }, 10000);

  test('stores handoff artifact in shared memory', async () => {
    const mem = new SharedMemory();
    const config = createHarnessConfig({
      name: 'producer',
      role: 'test',
      handoff: { artifactKey: 'producer/output', artifactFormat: 'text' },
    });
    const mockLLM = async () => 'artifact data';
    const harness = new AgentHarness(config, mockLLM, mem);
    await harness.run('produce');
    const stored = await mem.read('producer/output');
    expect(stored).toBe('artifact data');
  });
});

describe('Per-Agent Harness Configs', () => {
  test('OutlineHarness has correct IMPACT settings', () => {
    const config = createOutlineHarness({ genre: 'fantasy' });
    expect(config.name).toBe('outliner');
    expect(config.tools.llmModel).toBeTruthy(); // GLM or qwen3.5-flash
    expect(config.tools.useCGB).toBe(true);
    expect(config.authority.maxTokens).toBe(8192);
    expect(config.handoff.artifactFormat).toBe('json');
  });

  test('PlanningHarness KG strategy varies by genre', () => {
    expect(createPlanningHarness({ genre: 'fantasy' }).tools.useCGB).toBe(true);
    expect(createPlanningHarness({ genre: 'sci-fi' }).tools.useCGB).toBe(true);
    expect(createPlanningHarness({ genre: 'romance' }).tools.useCGB).toBe(false);
    expect(createPlanningHarness({ genre: 'thriller' }).tools.useCGB).toBe(false);
    expect(createPlanningHarness({ genre: 'mystery' }).tools.useCGB).toBe(true);
  });

  test('WritingHarness has high token limit', () => {
    const config = createWritingHarness({ genre: 'romance', chapterNumber: 5, targetWordCount: 5000 });
    expect(config.authority.maxTokens).toBe(16384); // DashScope qwen3.5-flash max
    expect(config.handoff.artifactKey).toBe('writer/chapter_5');
  });

  test('WritingHarness language-specific validation (English)', () => {
    const config = createWritingHarness({ genre: 'romance', chapterNumber: 1, targetWordCount: 3000, language: 'en' });
    // English text should pass
    const enValid = config.authority.validate('A'.repeat(100) + ' ' + 'the quick brown fox jumps over the lazy dog. '.repeat(300));
    expect(enValid.valid).toBe(true);
    // Korean text in English series should fail
    const koInEn = config.authority.validate('안녕하세요 '.repeat(200));
    expect(koInEn.valid).toBe(false);
  });

  test('WritingHarness language-specific validation (Japanese)', () => {
    const config = createWritingHarness({ genre: 'romance', chapterNumber: 1, targetWordCount: 3000, language: 'ja' });
    // Japanese should have hiragana/katakana (need enough chars for 3000 target)
    const jaText = 'これは日本語のテストです。' + 'ひらがな '.repeat(2000);
    const jaValid = config.authority.validate(jaText);
    expect(jaValid.valid).toBe(true);
    // Korean in Japanese series should fail
    const koInJa = config.authority.validate('안녕하세요 '.repeat(200));
    expect(koInJa.valid).toBe(false);
  });

  test('EvaluationHarness uses cheaper model', () => {
    const config = createEvaluationHarness({ genre: 'romance' });
    expect(config.tools.llmModel).toBeTruthy(); // GLM or qwen-turbo
    expect(config.name).toBe('evaluator');
  });
});

describe('parseOutlineOutput', () => {
  test('parses event blocks', () => {
    const raw = 'Event 1: Meeting\nSetting: Cafe\nCharacters: A, B\nAction: Talk\nConflict: Argue\n\nEvent 2: Departure\nSetting: Station\nCharacters: A\nAction: Leave';
    const result = parseOutlineOutput(raw);
    expect(result.events.length).toBe(2);
    expect(result.events[0].title).toBe('Meeting');
    expect(result.events[1].id).toBe('event_2');
  });
});

describe('parseChapterPlan', () => {
  test('parses chapter blocks with matchAll', () => {
    const raw = 'Chapter 1: The Beginning\nSome content here\n\nChapter 2: The Middle\nMore content\n\nChapter 3: The End\nFinal content';
    const result = parseChapterPlan(raw);
    expect(result.chapters.length).toBe(3);
    expect(result.chapters[0].number).toBe(1);
    expect(result.chapters[2].title).toBe('The End');
  });

  test('parses Korean chapters', () => {
    const raw = '챕터 1: 만남\n내용...\n\n챕터 2: 갈등\n내용...\n\n챕터 3: 해결\n내용...';
    const result = parseChapterPlan(raw);
    expect(result.chapters.length).toBe(3);
  });
});

describe('parseEvaluationOutput', () => {
  test('parses JSON evaluation', () => {
    const raw = '```json\n{"scores":{"relevance":4,"coherence":3,"empathy":5,"surprise":3,"creativity":4,"complexity":3},"overallScore":3.7,"feedback":"Good"}\n```';
    const result = parseEvaluationOutput(raw);
    expect(result.scores.relevance).toBe(4);
    expect(result.overallScore).toBe(3.7);
    expect(result.passed).toBe(true);
  });

  test('parses text-format scores', () => {
    const raw = 'Relevance: 4/5\nCoherence: 3/5\nEmpathy: 4/5\nSurprise: 2/5\nCreativity: 3/5\nComplexity: 2/5';
    const result = parseEvaluationOutput(raw);
    expect(result.scores.relevance).toBe(4);
    expect(result.scores.surprise).toBe(2);
    expect(result.overallScore).toBe(3);
  });

  test('marks as failed below threshold', () => {
    const raw = '```json\n{"scores":{"relevance":2,"coherence":2,"empathy":2,"surprise":1,"creativity":2,"complexity":1},"overallScore":1.7}\n```';
    const result = parseEvaluationOutput(raw, 3.5);
    expect(result.passed).toBe(false);
    expect(result.rewriteRequired).toBe(true);
  });
});

describe('HandoffArtifact', () => {
  test('serialize and deserialize', () => {
    const artifact = new HandoffArtifact('outline', 'outliner', 'planner', { events: [1, 2, 3] });
    const json = artifact.serialize();
    const restored = HandoffArtifact.deserialize(json);
    expect(restored.type).toBe('outline');
    expect(restored.data.events).toEqual([1, 2, 3]);
  });

  test('store and load from SharedMemory', async () => {
    const mem = new SharedMemory();
    const artifact = new HandoffArtifact('test', 'agent1', 'agent2', { key: 'value' });
    await artifact.storeTo(mem);
    const loaded = await HandoffArtifact.loadFrom(mem, 'agent1', 'test');
    expect(loaded).not.toBeNull();
    expect(loaded.data.key).toBe('value');
  });
});
