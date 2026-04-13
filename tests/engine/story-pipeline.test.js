const { StoryOrchestrator } = require('../../src/backend/services/story/StoryOrchestrator');
const { StoryStateTracker } = require('../../src/backend/services/story/StoryStateTracker');
const { TextIngestionService } = require('../../src/backend/services/story/TextIngestionService');

// ─── Mock LLM ───
const OUTLINE_RESPONSE = 'Event 1: 만남\nSetting: 한강\nCharacters: 서연, 민준\nAction: 충돌\nConflict: 커피\n\nEvent 2: 재회\nSetting: 회사\nCharacters: 서연, 민준\nAction: 신입\nConflict: 오해\n\nEvent 3: 협업\nSetting: 회의실\nCharacters: 서연, 민준\nAction: 프로젝트\nConflict: 충돌\n\nEvent 4: 변화\nSetting: 편의점\nCharacters: 서연, 민준\nAction: 대화\nConflict: 벽\n\nEvent 5: 위기\nSetting: 발표장\nCharacters: 서연, 민준\nAction: 위기\nConflict: 팀장\nPlot Twist: 보호\n\nEvent 6: 고백\nSetting: 한강\nCharacters: 서연, 민준\nAction: 고백\nConflict: 트라우마';

const PLAN_RESPONSE = 'Chapter 1: 만남과 오해\n- Sub-events: E1+E2\n- Cliffhanger: 복도 마주침\n\nChapter 2: 팀워크\n- Sub-events: E3+E4\n- Cliffhanger: 야근 후\n\nChapter 3: 위기와 고백\n- Sub-events: E5+E6\n- Cliffhanger: 고백';

const WRITE_RESPONSE = '서연은 한강 둔치를 달리고 있었다. ' + '이어폰에서 흘러나오는 음악에 맞춰 발걸음을 옮기는 순간 누군가와 정면으로 부딪혔다. '.repeat(25) + '\n\n민준은 웃었다. 괜찮아요. 서연의 가슴이 뛰었다. ' + '월요일 아침 팀장의 메일을 확인하다가 눈이 커졌다. '.repeat(15) + '\n\n서연은 고개를 돌렸다. 심장이 너무 빨리 뛰었다.';

const EVAL_RESPONSE = '```json\n{"scores":{"relevance":4,"coherence":4,"empathy":5,"surprise":3,"creativity":4,"complexity":3},"overallScore":3.8,"feedback":"Good chemistry.","passed":true}\n```';

function createMockLLM() {
  return async (system) => {
    if (system.includes('outline architect')) return OUTLINE_RESPONSE;
    if (system.includes('structure architect')) return PLAN_RESPONSE;
    if (system.includes('Creative fiction writer')) return WRITE_RESPONSE;
    if (system.includes('literary critic')) return EVAL_RESPONSE;
    if (system.includes('continuity auditor')) return '[]'; // no issues
    if (system.includes('story state tracker') || system.includes('story architect')) return '{}'; // truth files
    if (system.includes('챕터 길이 조정기')) return WRITE_RESPONSE; // length normalizer passthrough
    if (system.includes('수정 편집자')) return ''; // spot-fix reviser (no patches = skip)
    return 'fallback';
  };
}

// ─── StoryOrchestrator ───

describe('StoryOrchestrator', () => {
  test('full pipeline: outline → plan → write → eval', async () => {
    const story = new StoryOrchestrator({
      genre: 'romance', language: 'ko', targetWordCount: 500,
      llmCall: createMockLLM(),
    });

    const result = await story.generateEpisode({
      series: { title: '사랑의 온도', genre: 'romance', synopsis: '한강 로맨스' },
      episodeNumber: 1,
    });

    expect(result.success).toBe(true);
    expect(result.episode).toBeDefined();
    expect(result.episode.wordCount).toBeGreaterThan(100);
    expect(result.outline).toBeDefined();
    expect(result.outline.events.length).toBeGreaterThanOrEqual(5);
    expect(result.evaluation).toBeDefined();
    expect(result.evaluation.passed).toBe(true);
    expect(result.writeAttempts).toBe(1);
  });

  test('retries writing when evaluation fails', async () => {
    let evalCallCount = 0;
    const mockLLM = async (system) => {
      if (system.includes('outline architect')) return OUTLINE_RESPONSE;
      if (system.includes('structure architect')) return PLAN_RESPONSE;
      if (system.includes('Creative fiction writer')) return WRITE_RESPONSE;
      if (system.includes('literary critic')) {
        evalCallCount++;
        if (evalCallCount < 3) {
          return '```json\n{"scores":{"relevance":2,"coherence":2,"empathy":2,"surprise":1,"creativity":2,"complexity":1},"overallScore":1.7,"feedback":"Needs work.","passed":false}\n```';
        }
        return EVAL_RESPONSE;
      }
      if (system.includes('continuity auditor')) return '[]';
      if (system.includes('story state tracker') || system.includes('story architect')) return '{}';
      if (system.includes('챕터 길이 조정기')) return WRITE_RESPONSE;
      if (system.includes('수정 편집자')) return '';
      return 'fallback';
    };

    const story = new StoryOrchestrator({
      genre: 'romance', language: 'ko', targetWordCount: 500,
      llmCall: mockLLM, maxEvalRetries: 3,
    });

    const result = await story.generateEpisode({
      series: { title: '테스트', genre: 'romance', synopsis: 'test' },
      episodeNumber: 1,
    });

    expect(result.success).toBe(true);
    expect(result.writeAttempts).toBe(3); // 2 failures + 1 success
  });

  test('reports progress events', async () => {
    const events = [];
    const story = new StoryOrchestrator({
      genre: 'romance', language: 'ko', targetWordCount: 500,
      llmCall: createMockLLM(),
      onProgress: (e) => events.push(e.type),
    });

    await story.generateEpisode({
      series: { title: '테스트', genre: 'romance', synopsis: 'test' },
      episodeNumber: 1,
    });

    expect(events).toContain('pipeline_start');
    expect(events).toContain('pipeline_complete');
    expect(events.filter(e => e === 'stage_start').length).toBeGreaterThanOrEqual(4); // outline, plan, write, eval + continuity_audit, length_normalize
  });

  test('stateTracker is wired into pipeline', async () => {
    const story = new StoryOrchestrator({
      genre: 'romance', language: 'ko', targetWordCount: 500,
      llmCall: createMockLLM(),
    });
    story.stateTracker.trackEntity('서연', 'character', 'active', { episodeNumber: 0 });

    const result = await story.generateEpisode({
      series: { title: '테스트', genre: 'romance', synopsis: 'test' },
      episodeNumber: 1,
    });

    expect(result.success).toBe(true);
    expect(story.stateTracker.getActiveCharacters().length).toBe(1);
  });
});

// ─── StoryStateTracker ───

describe('StoryStateTracker', () => {
  let tracker;
  beforeEach(() => { tracker = new StoryStateTracker(); });

  test('tracks entity states', () => {
    tracker.trackEntity('서연', 'character', 'active', { role: 'protagonist' });
    expect(tracker.getEntity('서연').status).toBe('active');
    expect(tracker.getActiveCharacters().length).toBe(1);
  });

  test('blocks revival of destroyed entities (SCORE Markov)', () => {
    tracker.trackEntity('마법 반지', 'item', 'active');
    tracker.trackEntity('마법 반지', 'item', 'destroyed', { episodeNumber: 3 });
    const result = tracker.trackEntity('마법 반지', 'item', 'active', { episodeNumber: 5 });
    expect(result.valid).toBe(false);
    expect(result.warning).toContain('destroyed');
  });

  test('detects emotional whiplash', () => {
    tracker.trackEmotion(1, { sentiment: 0.8, dominantEmotion: 'joy', intensity: 0.7 });
    const ok = tracker.checkEmotionalConsistency(0.7);
    expect(ok.consistent).toBe(true);
    const bad = tracker.checkEmotionalConsistency(0.1);
    expect(bad.consistent).toBe(false);
    expect(bad.warning).toContain('whiplash');
  });

  test('detects theme drift (Korean)', () => {
    tracker.setThemeAnchors({ topic: '로맨스 사랑 직장 동료' });
    expect(tracker.checkThemeDrift('서연은 사랑하는 직장 동료를 만났다').drifted).toBe(false);
    expect(tracker.checkThemeDrift('우주선이 화성에 착륙했다').drifted).toBe(true);
  });

  test('generates summary for prompt injection', () => {
    tracker.trackEntity('서연', 'character', 'active', { role: 'protagonist' });
    tracker.trackEmotion(1, { sentiment: 0.6, dominantEmotion: 'tension', intensity: 0.5 });
    const summary = tracker.getSummary();
    expect(summary).toContain('서연');
    expect(summary).toContain('tension');
  });

  test('serialize and deserialize', () => {
    tracker.trackEntity('민준', 'character', 'active');
    tracker.trackEmotion(1, { sentiment: 0.5, dominantEmotion: 'calm' });
    const json = tracker.serialize();
    const restored = StoryStateTracker.deserialize(json);
    expect(restored.getEntity('민준').status).toBe('active');
    expect(restored.emotionalArc.length).toBe(1);
  });
});

// ─── TextIngestionService ───

describe('TextIngestionService', () => {
  test('splits English chapters', () => {
    const svc = new TextIngestionService({});
    const text = 'Chapter 1: Beginning\nOnce upon a time in a land far far away there was a great kingdom with many people living happily.\n\nChapter 2: Middle\nThe brave hero ventured forth into the dark forest and found the legendary sword of power hidden beneath the ancient oak tree.\n\nChapter 3: End\nAfter defeating the dragon and saving the princess, they all lived happily ever after in the restored kingdom of light.';
    const chapters = svc._splitChapters(text);
    expect(chapters.length).toBe(3);
    expect(chapters[0].title).toContain('Beginning');
  });

  test('splits Korean chapters', () => {
    const svc = new TextIngestionService({});
    const text = '제 1 장 시작\n옛날 옛날에 한 마을이 있었습니다. 그 마을에는 용감한 청년이 살고 있었는데 그의 이름은 민준이었습니다.\n\n제 2 장 중간\n영웅이 검을 찾았습니다. 그 검은 용을 물리칠 수 있는 유일한 무기였으며 산꼭대기에 숨겨져 있었습니다.\n\n제 3 장 끝\n마침내 용을 물리치고 마을로 돌아온 민준은 영웅으로 추대받았습니다. 모두가 행복하게 살았습니다.';
    const chapters = svc._splitChapters(text);
    expect(chapters.length).toBeGreaterThanOrEqual(2);
  });

  test('falls back to word-count splitting', () => {
    const svc = new TextIngestionService({});
    const text = 'word '.repeat(10000);
    const chapters = svc._splitChapters(text);
    expect(chapters.length).toBeGreaterThan(1);
  });
});
