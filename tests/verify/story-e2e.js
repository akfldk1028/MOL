#!/usr/bin/env node
/**
 * story-e2e.js — End-to-end story generation verification with DashScope
 *
 * Usage:
 *   node tests/verify/story-e2e.js [genre]
 *   node tests/verify/story-e2e.js romance
 *   node tests/verify/story-e2e.js fantasy
 *
 * Requires: DASHSCOPE_API_KEY env var
 *
 * Tests:
 *   1. Full pipeline: Outline → Plan → Write → LengthNorm → ContinuityAudit → AITells → Eval
 *   2. Truth files initialization
 *   3. Review cycle feedback injection
 *   4. Word count within genre spec
 *   5. AI-tell score
 *   6. Korean language purity
 */

const { StoryOrchestrator } = require('../../src/backend/services/story/StoryOrchestrator');
const { analyzeAITells } = require('../../src/backend/engine/harness/agents/AITellsDetector');
const { getLengthSpec, countKoreanWords } = require('../../src/backend/config/length-governance');
const openaiCompat = require('../../src/backend/nodes/llm-call/providers/openai-compat');

const genre = process.argv[2] || 'romance';

const SERIES = {
  romance: {
    title: '한강의 온도',
    genre: 'romance',
    synopsis: '직장인 서연(28)은 매일 출근길 한강 다리에서 같은 남자 민준(30)을 본다. 어느 날 비를 맞고 서있는 그에게 우산을 건네면서 시작되는 이야기.',
    character_sheet: '서연: 28세, 출판사 편집자, 내성적, 책벌레. 민준: 30세, 건축사무소 설계사, 과묵하지만 따뜻함. 지수: 서연의 동료, 활발한 성격.',
  },
  fantasy: {
    title: '별을 삼킨 아이',
    genre: 'fantasy',
    synopsis: '마법이 소멸한 세계에서 유일하게 마법을 쓸 수 있는 소녀 하늘(16). 마법사 사냥꾼들에게 쫓기며 잃어버린 마법의 근원을 찾아 떠나는 여정.',
    character_sheet: '하늘: 16세, 은빛 머리, 별의 마법 사용. 검은: 마법사 사냥꾼 두목, 30대, 과거 마법사였으나 배신당함. 노을: 하늘의 동행자, 20세, 검술사.',
    world_setting: '마법이 100년 전 대재앙으로 소멸. 마법사는 박해받는 존재. 5개 왕국이 있으며 각 왕국은 옛 마법 유물을 놓고 전쟁 중.',
  },
  martial_arts: {
    title: '천산검로',
    genre: 'martial_arts',
    synopsis: '무림 최하위 문파 출신 이강(18)이 천산에서 발견한 고대 검보로 무림맹과 사교 사이 권력 투쟁에 휘말리는 이야기.',
    character_sheet: '이강: 18세, 천인검파 막내제자, 근성과 지략. 매화: 무림맹주의 딸, 17세, 매화검법. 혈랑: 사교 호법, 40대, 냉혹한 전략가.',
    world_setting: '중원 무림. 정파 무림맹 vs 사교 혈교. 강호에 10대 고수가 있으며 이강은 무명. 내공 10단계 체계.',
  },
};

const series = SERIES[genre] || SERIES.romance;
const lengthSpec = getLengthSpec(genre);

async function llmCall(system, user, opts = {}) {
  const model = opts.model || process.env.DASHSCOPE_MODEL || 'qwen-turbo';
  return openaiCompat.call(
    model, system, user,
    { provider: 'dashscope', maxOutputTokens: opts.maxOutputTokens || 8192 }
  );
}

function log(label, data) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${label}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
}

async function main() {
  if (!process.env.DASHSCOPE_API_KEY) {
    console.error('ERROR: DASHSCOPE_API_KEY not set');
    process.exit(1);
  }

  log('CONFIG', { genre, lengthSpec, series: series.title });

  const events = [];
  const story = new StoryOrchestrator({
    genre,
    language: 'ko',
    targetWordCount: lengthSpec.target,
    maxEvalRetries: 1, // 1 retry for speed
    llmCall,
    onProgress: (e) => {
      events.push(e);
      log(`EVENT:${e.type}`, {
        ...(e.stage ? { stage: e.stage } : {}),
        ...(e.wordCount !== undefined ? { wordCount: e.wordCount } : {}),
        ...(e.passed !== undefined ? { passed: e.passed } : {}),
        ...(e.score !== undefined ? { score: e.score } : {}),
        ...(e.count !== undefined ? { count: e.count } : {}),
        ...(e.attempt !== undefined ? { attempt: e.attempt } : {}),
        ...(e.mode ? { mode: e.mode } : {}),
      });
    },
  });

  log('START', `Generating "${series.title}" (${genre})...`);
  const start = Date.now();

  let result;
  try {
    result = await story.generateEpisode({
      series: { ...series, id: `verify-${genre}-${Date.now()}` },
      episodeNumber: 1,
    });
  } catch (err) {
    log('FATAL', err.message);
    process.exit(1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log('DONE', `${elapsed}s, success: ${result.success}`);

  // ─── Verification Checks ───
  const checks = [];
  function check(name, passed, detail) {
    checks.push({ name, passed, detail });
    const icon = passed ? 'PASS' : 'FAIL';
    log(icon, `${name}: ${detail}`);
  }

  // 1. Pipeline success
  check('pipeline_success', result.success, result.success ? 'OK' : result.error?.slice(0, 200));

  if (result.success) {
    const content = result.episode.content;
    const wordCount = countKoreanWords(content);

    // 2. Word count in range
    check('word_count_soft', wordCount >= lengthSpec.softMin && wordCount <= lengthSpec.softMax,
      `${wordCount} words (soft: ${lengthSpec.softMin}-${lengthSpec.softMax})`);
    check('word_count_hard', wordCount >= lengthSpec.hardMin && wordCount <= lengthSpec.hardMax,
      `${wordCount} words (hard: ${lengthSpec.hardMin}-${lengthSpec.hardMax})`);

    // 3. Korean language purity
    const chineseChars = content.match(/[\u4E00-\u9FFF]/g) || [];
    const japaneseChars = content.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || [];
    check('korean_purity', chineseChars.length <= 5 && japaneseChars.length === 0,
      `Chinese: ${chineseChars.length}, Japanese: ${japaneseChars.length}`);

    // 4. AI-tell score
    const aiTells = analyzeAITells(content);
    check('ai_tells_low', aiTells.score <= 3,
      `score: ${aiTells.score}, issues: ${aiTells.issues.length}`);

    // 5. Has cliffhanger/hook ending
    const lastParagraph = content.trim().split('\n').filter(l => l.trim()).pop() || '';
    check('has_ending', lastParagraph.length > 10,
      `Last paragraph: "${lastParagraph.slice(0, 80)}..."`);

    // 6. Evaluation passed
    const evalData = result.evaluation || {};
    check('eval_passed', evalData.passed === true,
      `overall: ${evalData.overallScore}, passed: ${evalData.passed}`);

    // 7. Continuity audit
    const audit = result.continuityAudit || {};
    check('continuity_passed', audit.passed !== false,
      `passed: ${audit.passed}, criticals: ${audit.criticalCount}, warnings: ${audit.warningCount}`);

    // 8. No meta-text leakage
    const metaTexts = ['[continue]', '[to be continued]', 'Chapter ', 'as an AI', 'language model'];
    const hasMetaLeak = metaTexts.some(m => content.toLowerCase().includes(m.toLowerCase()));
    check('no_meta_leak', !hasMetaLeak, hasMetaLeak ? 'Meta-text detected!' : 'Clean');

    // 9. Title exists
    check('has_title', !!result.episode.title && result.episode.title !== 'Untitled',
      result.episode.title);

    // ─── Output sample ───
    log('SAMPLE', '─── First 500 chars ───');
    console.log(content.slice(0, 500));
    log('SAMPLE', '─── Last 300 chars ───');
    console.log(content.slice(-300));
  }

  // ─── Summary ───
  const passed = checks.filter(c => c.passed).length;
  const total = checks.length;
  console.log('\n' + '═'.repeat(60));
  log('SUMMARY', `${passed}/${total} checks passed (${elapsed}s, ${result.writeAttempts} attempts)`);
  console.log('═'.repeat(60));

  for (const c of checks) {
    console.log(`  ${c.passed ? 'V' : 'X'} ${c.name}: ${c.detail}`);
  }

  // ─── Event timeline ───
  console.log('\n─── Event Timeline ───');
  for (const e of events) {
    const ts = e.timestamp?.slice(11, 19) || '';
    const info = e.stage || e.type;
    const extra = e.wordCount !== undefined ? ` wc:${e.wordCount}` : '';
    const pass = e.passed !== undefined ? ` passed:${e.passed}` : '';
    console.log(`  ${ts} ${info}${extra}${pass}`);
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
