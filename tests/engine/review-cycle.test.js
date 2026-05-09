const { analyzeAITells, isLikelyAIGenerated } = require('../../src/backend/engine/harness/agents/AITellsDetector');
const { normalizeLength, sanitizeOutput } = require('../../src/backend/engine/harness/agents/LengthNormalizer');
const { getLengthSpec, countKoreanWords, getNormalizeMode, isOutsideHardRange } = require('../../src/backend/config/length-governance');
const { auditChapter, runRuleBasedChecks } = require('../../src/backend/engine/harness/agents/ContinuityAuditor');
const { getActiveDimensions } = require('../../src/backend/config/genre-audit-config');
const { TruthManager, TRUTH_TYPES } = require('../../src/backend/services/story/truth/TruthManager');

// ─── Length Governance ───

describe('Length Governance', () => {
  test('getLengthSpec returns genre-specific specs', () => {
    const fantasy = getLengthSpec('fantasy');
    expect(fantasy.target).toBe(3500);
    expect(fantasy.softMin).toBe(2500);
    expect(fantasy.hardMax).toBe(7000);

    const romance = getLengthSpec('romance');
    expect(romance.target).toBe(2500);
    expect(romance.softMin).toBe(1800);
  });

  test('getLengthSpec falls back to general', () => {
    const spec = getLengthSpec('unknown_genre');
    expect(spec.target).toBe(2500);
  });

  test('countKoreanWords handles Korean text', () => {
    const text = '서연은 한강 둔치를 달리고 있었다. 이어폰에서 흘러나오는 음악에 맞춰 발걸음을 옮겼다.';
    const count = countKoreanWords(text);
    expect(count).toBeGreaterThan(10);
  });

  test('countKoreanWords handles empty', () => {
    expect(countKoreanWords('')).toBe(0);
    expect(countKoreanWords(null)).toBe(0);
  });

  test('getNormalizeMode detects expand/compress/none', () => {
    const spec = getLengthSpec('romance');
    expect(getNormalizeMode(1000, spec)).toBe('expand');
    expect(getNormalizeMode(2500, spec)).toBe('none');
    expect(getNormalizeMode(4000, spec)).toBe('compress');
  });

  test('isOutsideHardRange', () => {
    const spec = getLengthSpec('fantasy');
    expect(isOutsideHardRange(1000, spec)).toBe(true);
    expect(isOutsideHardRange(3000, spec)).toBe(false);
    expect(isOutsideHardRange(8000, spec)).toBe(true);
  });
});

// ─── AI Tells Detector ───

describe('AITellsDetector', () => {
  test('detects AI markers in Korean text', () => {
    const aiText = '한편 서연은 생각했다. ' + '물론 이것은 중요했다. '.repeat(5) +
      '사실상 그녀는 알고 있었다. 결론적으로 이 상황은 복잡했다. '.repeat(3) +
      '이러한 관점에서 문제가 심각했다. 다양한 측면에서 해결책을 찾아야 했다. '.repeat(3);
    const result = analyzeAITells(aiText);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });

  test('clean text has no issues', () => {
    const cleanText = '서연은 카페 문을 열었다. 종소리가 울렸다. 민준이 창가에 앉아 커피를 마시고 있었다. ' +
      '그의 눈이 서연을 향했다. 미소가 번졌다. 서연의 심장이 빠르게 뛰었다. ' +
      '자리에 앉으며 메뉴를 훑었다. 손끝이 떨렸다. 민준이 먼저 말을 걸었다. ' +
      '오랜만이네요. 서연은 고개를 끄덕였다. 바깥에는 벚꽃이 흩날리고 있었다.';
    const result = analyzeAITells(cleanText);
    expect(result.score).toBe(0);
  });

  test('skips short text', () => {
    const result = analyzeAITells('짧은 텍스트');
    expect(result.issues.length).toBe(0);
  });

  test('detects paragraph uniformity', () => {
    // 5 paragraphs of exactly similar length
    const uniform = Array(5).fill('서연은 길을 걸었다. 바람이 불었다. 나뭇잎이 흔들렸다. 햇살이 따스했다.').join('\n\n');
    const result = analyzeAITells(uniform);
    const uniformIssue = result.issues.find(i => i.category === '단락 균일성');
    expect(uniformIssue).toBeDefined();
  });

  test('isLikelyAIGenerated with extreme AI text', () => {
    // Multi-paragraph with uniform lengths + AI markers + transitions
    const para = '한편 이에 따라 물론 사실상 결론적으로 이러한 관점에서 다양한 측면에서 그러나 한편으로는 더 나아가 주목할 만한 것은 그럼에도 불구하고 아마도 어쩌면 다소.';
    const extreme = Array(6).fill(para).join('\n\n');
    expect(isLikelyAIGenerated(extreme)).toBe(true);
  });
});

// ─── LengthNormalizer ───

describe('LengthNormalizer', () => {
  test('skips normalization when in range', async () => {
    const spec = getLengthSpec('romance');
    const content = '서연은 카페에 앉아 있었다. 바람이 불고 나뭇잎이 흔들렸다. 창밖으로 햇살이 들어왔다. '.repeat(200); // ~2000+ words
    const result = await normalizeLength({
      content,
      lengthSpec: spec,
      llmCall: async () => content,
    });
    expect(result.applied).toBe(false);
    expect(result.mode).toBe('none');
  });

  test('expands short content via LLM', async () => {
    const spec = getLengthSpec('fantasy');
    const shortContent = '짧은 내용.';
    const expandedContent = '확장된 내용입니다. '.repeat(200);
    const result = await normalizeLength({
      content: shortContent,
      lengthSpec: spec,
      llmCall: async () => expandedContent,
    });
    expect(result.applied).toBe(true);
    expect(result.mode).toBe('expand');
  });

  test('handles LLM failure gracefully', async () => {
    const spec = getLengthSpec('fantasy');
    const result = await normalizeLength({
      content: '짧은 내용.',
      lengthSpec: spec,
      llmCall: async () => { throw new Error('LLM error'); },
    });
    expect(result.applied).toBe(false);
    expect(result.warning).toContain('LLM error');
  });

  test('sanitizeOutput strips wrapper text', () => {
    const raw = '아래는 수정된 본문입니다.\n\n서연은 걸었다.';
    const result = sanitizeOutput(raw, 'fallback');
    expect(result).not.toContain('아래는');
    expect(result).toContain('서연');
  });

  test('sanitizeOutput strips fenced code', () => {
    const raw = '```\n서연은 걸었다.\n```';
    const result = sanitizeOutput(raw, 'fallback');
    expect(result).toBe('서연은 걸었다.');
  });
});

// ─── ContinuityAuditor ───

describe('ContinuityAuditor', () => {
  test('auditChapter returns passed with no issues', async () => {
    const result = await auditChapter({
      chapterContent: '서연은 서울 강남에서 커피를 마셨다.',
      chapterNumber: 2,
      genre: 'romance',
      truthFiles: { currentState: '서연: 서울 강남, 28세' },
      llmCall: async () => '[]',
    });
    expect(result.passed).toBe(true);
    expect(result.issues.length).toBe(0);
  });

  test('auditChapter detects critical issues', async () => {
    const result = await auditChapter({
      chapterContent: '서연은 부산에서 해운대를 걸었다.',
      chapterNumber: 3,
      genre: 'romance',
      truthFiles: { currentState: '서연: 서울, 이동 불가 상태' },
      llmCall: async () => JSON.stringify([
        { dimensionId: 2, severity: 'critical', description: '서연이 서울에서 부산으로 순간이동', suggestion: '이동 장면 추가' },
      ]),
    });
    expect(result.passed).toBe(false);
    expect(result.criticalCount).toBe(1);
  });

  test('rule-based honorific check works', () => {
    const dims = getActiveDimensions('romance');
    // regex: 습니다|입니다 vs 했다|이다|한다|였다|갔다 — both >10, ratio >0.3
    const casual = '그녀는 했다. 그것은 했다. 그는 했다. 모두 했다. 누군가 했다. 서연이 했다. 민준이 했다. 팀장이 했다. 동료가 했다. 친구가 했다. 부모가 했다. ';
    const formal = '감사합니다. 알겠습니다. 죄송합니다. 부탁드립니다. 반갑습니다. 맞습니다. 좋습니다. 됩니다. 있습니다. 봅니다. 갑니다. 옵니다. 합니다. 놀랍습니다. 아름답습니다. 대단합니다. ';
    const text = casual + formal;
    const issues = runRuleBasedChecks(text, dims);
    const honorificIssue = issues.find(i => i.dimensionId === 16);
    expect(honorificIssue).toBeDefined();
  });

  test('handles LLM failure gracefully', async () => {
    const result = await auditChapter({
      chapterContent: '서연은 걸었다.',
      chapterNumber: 1,
      genre: 'romance',
      llmCall: async () => { throw new Error('LLM error'); },
    });
    expect(result.passed).toBe(true);
    expect(result.summary).toContain('skipped');
  });

  test('returns empty for no content', async () => {
    const result = await auditChapter({
      chapterContent: '',
      chapterNumber: 1,
      genre: 'romance',
      llmCall: async () => '[]',
    });
    expect(result.passed).toBe(true);
  });
});

// ─── TruthManager ───

describe('TruthManager', () => {
  test('TRUTH_TYPES has 6 types', () => {
    expect(TRUTH_TYPES.length).toBe(6);
    expect(TRUTH_TYPES).toContain('currentState');
    expect(TRUTH_TYPES).toContain('pendingHooks');
  });

  test('formatForPrompt formats truth files', () => {
    const truthFiles = {
      currentState: '서연: 서울',
      storyBible: '현대 배경',
      pendingHooks: '비밀 편지',
      bookRules: '이름 변경 금지',
      particleLedger: null,
      volumeOutline: null,
    };
    const formatted = TruthManager.formatForPrompt(truthFiles);
    expect(formatted).toContain('Truth Files');
    expect(formatted).toContain('서연');
    expect(formatted).toContain('비밀 편지');
    expect(formatted).toContain('ABSOLUTE');
  });

  test('formatForPrompt returns empty for no content', () => {
    const formatted = TruthManager.formatForPrompt({});
    expect(formatted).toBe('');
  });

  test('formatForPrompt truncates at maxChars', () => {
    const longContent = 'a'.repeat(5000);
    const formatted = TruthManager.formatForPrompt({ currentState: longContent }, 200);
    expect(formatted.length).toBeLessThanOrEqual(220); // 200 + "[... truncated]"
  });

  test('store rejects invalid truthType', async () => {
    await expect(TruthManager.store('agent1', 'series1', 'invalid_type', 'content'))
      .rejects.toThrow('invalid truthType');
  });
});

// ─── SpotFixReviser ───

const { parsePatches, applyPatches } = require('../../src/backend/engine/harness/agents/SpotFixReviser');

describe('SpotFixReviser', () => {
  test('parsePatches extracts valid patches', () => {
    const raw = `--- PATCH 1 ---
TARGET_TEXT:
그녀는 갑자기 놀랐다.
REPLACEMENT_TEXT:
그녀의 눈이 커졌다.
--- END PATCH ---
--- PATCH 2 ---
TARGET_TEXT:
모두가 놀랐다.
REPLACEMENT_TEXT:
영수가 커피잔을 떨어뜨렸다.
--- END PATCH ---`;
    const patches = parsePatches(raw);
    expect(patches.length).toBe(2);
    expect(patches[0].targetText).toBe('그녀는 갑자기 놀랐다.');
    expect(patches[1].replacementText).toContain('영수');
  });

  test('applyPatches replaces matched text', () => {
    const original = '서연은 카페에 앉아 있었다. ' + '창밖으로 비가 내리고 있었다. '.repeat(10) + '그녀는 갑자기 놀랐다. 밖에는 비가 내렸다.';
    const patches = [{ targetText: '그녀는 갑자기 놀랐다.', replacementText: '그녀의 눈이 커졌다.' }];
    const result = applyPatches(original, patches);
    expect(result.applied).toBe(true);
    expect(result.content).toContain('그녀의 눈이 커졌다.');
    expect(result.content).not.toContain('갑자기');
  });

  test('applyPatches rejects excessive touch ratio', () => {
    const original = '짧은 문장.';
    const patches = [{ targetText: '짧은 문장', replacementText: '수정' }];
    const result = applyPatches(original, patches);
    expect(result.applied).toBe(false);
    expect(result.rejected).toContain('%');
  });

  test('applyPatches skips unmatched patches', () => {
    const original = '서연은 걸었다. '.repeat(20);
    const patches = [{ targetText: '존재하지 않는 문장', replacementText: '수정' }];
    const result = applyPatches(original, patches);
    expect(result.applied).toBe(false);
  });
});

// ─── PostWriteValidator ───

const { validatePostWrite } = require('../../src/backend/engine/harness/agents/PostWriteValidator');

describe('PostWriteValidator', () => {
  test('detects meta narration', () => {
    const content = '서연은 걸었다. '.repeat(20) + '다음 장에서 밝혀지겠지만 민준은 비밀이 있었다.';
    const v = validatePostWrite(content);
    expect(v.find(x => x.rule === '메타서술')).toBeDefined();
  });

  test('detects report terms', () => {
    const content = '서연은 걸었다. '.repeat(20) + '그녀의 핵심 동기는 민준을 찾는 것이었다.';
    const v = validatePostWrite(content);
    expect(v.find(x => x.rule === '보고서용어')).toBeDefined();
  });

  test('detects sermon words', () => {
    const content = '서연은 걸었다. '.repeat(20) + '당연히 그럴 수밖에 없었다.';
    const v = validatePostWrite(content);
    expect(v.find(x => x.rule === '작가설교')).toBeDefined();
  });

  test('detects collective shock', () => {
    const content = '서연은 걸었다. '.repeat(20) + '모두가 놀랐다.';
    const v = validatePostWrite(content);
    expect(v.find(x => x.rule === '집단반응')).toBeDefined();
  });

  test('clean text has no violations', () => {
    const content = [
      '서연은 카페에 앉아 커피를 마셨다. 창밖으로 비가 내렸다.',
      '민준이 문을 열고 들어왔다. 그의 눈이 서연을 향했다.',
      '미소가 번졌다. 서연의 심장이 빠르게 뛰었다.',
      '자리에 앉으며 메뉴를 훑었다. 바리스타가 다가왔다.',
      '"뭐 드릴까요?" 그가 친절하게 물었다. 민준은 잠시 고민했다.',
      '비는 더 세차게 쏟아졌고, 거리에는 우산을 펼친 사람들로 가득했다.',
      '서연은 컵을 두 손으로 감쌌다. 따뜻한 온기가 손가락 끝까지 퍼졌다.',
      '"오래 기다렸어?" 민준이 물었다. 그녀는 천천히 고개를 저었다.',
    ].join('\n\n');
    const v = validatePostWrite(content);
    expect(v.length).toBe(0);
  });

  // ─── Repetition / structural defect rules (LLM output runaway guards) ───

  test('rule 11: blocks any sentence repeated 3+ times in body', () => {
    const filler = '인물 A가 거리를 걸었다. 바람이 차게 불었다. ';
    const repeated = '"같은 의미의 긴 대사가 본문 안에서 자꾸 등장한다."';
    const content = [filler, repeated, filler, repeated, filler, repeated, repeated].join('\n\n');
    const v = validatePostWrite(content);
    const rule = v.find(x => x.rule === '문장반복');
    expect(rule).toBeDefined();
    expect(rule.severity).toBe('error');
  });

  test('rule 11: short interjections ("응", "왜?") do NOT trigger', () => {
    const content = [
      '인물 A가 말했다. "오랜만이야."', '"응"',
      '인물 B가 답했다. "잘 지냈어?"', '"응"',
      '인물 A가 미소를 지었다. "여전하네."', '"응"',
    ].join('\n\n');
    const v = validatePostWrite(content);
    expect(v.find(x => x.rule === '문장반복')).toBeUndefined();
  });

  test('rule 12: blocks near-duplicate trailing paragraphs (Dice >= 0.85)', () => {
    const intro = '인물 A가 무엇인가를 만지작거렸다. 시선이 흔들렸다.\n\n' +
      '인물 B가 옆에서 지켜보고 있었다. 무언가 말하려 했다.\n\n' +
      '바람이 차게 불어왔다.\n\n';
    const dupePara = '인물 B가 다시 한 번 이름을 불렀다. 인물 A는 고개를 돌리지 않고 손에 든 것만 바라보았다. 시야가 흐릿하게 반짝이고 있었다.';
    const content = intro + dupePara + '\n\n' + dupePara + '!\n\n' + dupePara;
    const v = validatePostWrite(content);
    const rule = v.find(x => x.rule === '단락복붙');
    expect(rule).toBeDefined();
    expect(rule.severity).toBe('error');
  });

  test('rule 12: paraphrased paragraphs (similar idea, different words) do NOT trigger', () => {
    const content = [
      '햇살이 창을 통해 들어왔다. 인물 A는 눈을 뜨고 천장을 바라보았다.',
      '아침이 밝자 인물 A는 침대에서 일어났다. 창밖으로 새가 날아갔다.',
      '커튼 사이로 빛이 새어 들어왔다. 인물 A는 기지개를 켜며 하품했다.',
    ].join('\n\n');
    const v = validatePostWrite(content);
    expect(v.find(x => x.rule === '단락복붙')).toBeUndefined();
  });

  test('rule 13: detects 3 adjacent paragraphs starting with same word', () => {
    const content = [
      '인물 A가 거리에 들어선 카페 문 앞에서 잠시 망설였다. 안에서 따뜻한 빛이 새어 나오고 있었다.',
      '바리스타가 카운터 너머로 인사를 건넸다. 인물 A는 어색한 미소를 지으며 고개를 끄덕였다.',
      '인물 A가 창가 자리로 다가갔다. 의자를 끌어당기는 소리가 작게 울렸다.',
      '인물 A가 가방을 내려놓고 의자에 앉았다. 잠시 숨을 고르며 창밖을 바라보았다.',
      '인물 A가 메뉴판을 펼쳐 천천히 훑어보았다. 글자 하나하나가 흐릿하게 눈에 들어왔다.',
    ].join('\n\n');
    const v = validatePostWrite(content);
    expect(v.find(x => x.rule === '단락시작반복')).toBeDefined();
  });

  test('diceSimilarity returns 1 for identical, low for unrelated, high for paraphrase', () => {
    const { diceSimilarity } = require('../../src/backend/engine/harness/agents/PostWriteValidator');
    expect(diceSimilarity('인물 A가 손을 들었다', '인물 A가 손을 들었다')).toBe(1);
    expect(diceSimilarity('도시의 한 카페', '바닷가의 절벽')).toBeLessThan(0.3);
    expect(diceSimilarity('인물 A가 손을 들었다', '인물 A가 손을 올렸다')).toBeGreaterThan(0.6);
  });
});

// ─── LongSpanFatigue ───

const { analyzeFatigue, diceCoefficient } = require('../../src/backend/engine/harness/agents/LongSpanFatigue');

describe('LongSpanFatigue', () => {
  test('detects chapter type repetition', () => {
    const { issues } = analyzeFatigue({
      episodes: [
        { episode_number: 1, title: '전투1', script_content: '검을 휘둘렀다.', chapterType: '전투' },
        { episode_number: 2, title: '전투2', script_content: '마법을 시전했다.', chapterType: '전투' },
        { episode_number: 3, title: '전투3', script_content: '방어막이 깨졌다.', chapterType: '전투' },
      ],
    });
    expect(issues.find(i => i.category === '챕터타입 반복')).toBeDefined();
  });

  test('no issues with varied types', () => {
    const { issues } = analyzeFatigue({
      episodes: [
        { episode_number: 1, title: '일상', script_content: '카페에 갔다.', chapterType: '일상' },
        { episode_number: 2, title: '전투', script_content: '검을 뽑았다.', chapterType: '전투' },
        { episode_number: 3, title: '만남', script_content: '재회했다.', chapterType: '만남' },
      ],
    });
    expect(issues.find(i => i.category === '챕터타입 반복')).toBeUndefined();
  });

  test('diceCoefficient works', () => {
    expect(diceCoefficient('abc', 'abc')).toBe(1);
    expect(diceCoefficient('abc', 'xyz')).toBe(0);
    expect(diceCoefficient('abcde', 'abcfg')).toBeGreaterThan(0);
  });
});

// ─── HookManager ───

const { analyzeHook, getAgenda, parseHooksFromTruth, formatAgendaForPrompt } = require('../../src/backend/services/story/HookManager');

describe('HookManager', () => {
  test('analyzeHook detects stale hook', () => {
    const analysis = analyzeHook(
      { id: 'h1', text: '비밀 편지', timing: 'near-term', startChapter: 1, lastAdvanced: 1, status: 'open' },
      5,
    );
    expect(analysis.stale).toBe(true);
    expect(analysis.age).toBe(4);
    expect(analysis.dormancy).toBe(4);
  });

  test('analyzeHook detects overdue', () => {
    const analysis = analyzeHook(
      { id: 'h1', text: '복선', timing: 'immediate', startChapter: 1, lastAdvanced: 1, status: 'open' },
      10,
    );
    expect(analysis.overdue).toBe(true);
  });

  test('getAgenda returns mustAdvance for pressured hooks', () => {
    const hooks = [
      { id: 'h1', text: '비밀', timing: 'near-term', startChapter: 1, lastAdvanced: 1, status: 'open' },
      { id: 'h2', text: '검', timing: 'slow-burn', startChapter: 1, lastAdvanced: 4, status: 'open' },
    ];
    const agenda = getAgenda(hooks, 8);
    expect(agenda.mustAdvance.length).toBeGreaterThan(0);
  });

  test('parseHooksFromTruth parses markdown list', () => {
    const hooks = parseHooksFromTruth('# Hooks\n- 비밀 편지\n- 검은의 과거\n- (없음)');
    expect(hooks.length).toBe(2);
    expect(hooks[0].text).toBe('비밀 편지');
  });

  test('parseHooksFromTruth parses JSON', () => {
    const json = JSON.stringify([{ id: 'h1', text: '복선1', timing: 'mid-arc', startChapter: 3, lastAdvanced: 5, status: 'open' }]);
    const hooks = parseHooksFromTruth(json);
    expect(hooks.length).toBe(1);
    expect(hooks[0].timing).toBe('mid-arc');
  });

  test('formatAgendaForPrompt returns empty for no hooks', () => {
    expect(formatAgendaForPrompt({ mustAdvance: [], shouldResolve: [], staleWarnings: [] })).toBe('');
  });
});

// ─── GenreProfile ───

const { getGenreProfile } = require('../../src/backend/config/genre-profile');

describe('GenreProfile', () => {
  test('getGenreProfile returns complete profile', () => {
    const p = getGenreProfile('fantasy');
    expect(p.name).toBe('판타지');
    expect(p.chapterTypes.length).toBeGreaterThan(0);
    expect(p.fatigueWords.length).toBeGreaterThan(0);
    expect(p.powerScaling).toBe(true);
    expect(p.lengthSpec.target).toBe(3500);
    expect(p.auditDimensions.length).toBeGreaterThan(10);
  });

  test('getGenreProfile falls back to general', () => {
    const p = getGenreProfile('unknown_genre');
    expect(p.name).toBe('일반');
  });

  test('romance has no numerical system', () => {
    const p = getGenreProfile('romance');
    expect(p.numericalSystem).toBe(false);
    expect(p.powerScaling).toBe(false);
  });

  test('martial_arts has numerical system', () => {
    const p = getGenreProfile('martial_arts');
    expect(p.numericalSystem).toBe(true);
  });
});
