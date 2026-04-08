#!/usr/bin/env node
/**
 * 소설 텍본 CGB 투입 스크립트
 *
 * 사용법:
 *   node scripts/ingest-novel.js <txt파일> --title "제목" --genre romance --agent cadence
 *   node scripts/ingest-novel.js novel.txt --title "카페 로맨스" --genre romance
 *   node scripts/ingest-novel.js novels/*.txt --genre fantasy  (여러 파일)
 *
 * 옵션:
 *   --title   소설 제목 (없으면 파일명)
 *   --author  작가명
 *   --genre   장르 (romance, fantasy, martial_arts, mystery, thriller)
 *   --agent   에이전트 이름 (기본: cadence)
 *   --dry     CGB에 안 보내고 파싱만 확인
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { TextIngestionService } = require('../src/backend/services/story');

const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY;

async function llm(sys, user, opts = {}) {
  const res = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DASHSCOPE_KEY}` },
    body: JSON.stringify({
      model: 'qwen-turbo',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      max_tokens: opts.maxOutputTokens || 1024,
    }),
  });
  const d = await res.json();
  return d.choices?.[0]?.message?.content || '';
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.filter(a => !a.startsWith('--'));
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    } else if (args[i] === '--dry') {
      flags.dry = true;
    }
  }

  if (files.length === 0) {
    console.log('사용법: node scripts/ingest-novel.js <txt파일> --title "제목" --genre romance');
    console.log('');
    console.log('옵션:');
    console.log('  --title   소설 제목');
    console.log('  --author  작가명');
    console.log('  --genre   장르 (romance/fantasy/martial_arts/mystery/thriller)');
    console.log('  --agent   에이전트 이름 (기본: cadence)');
    console.log('  --dry     CGB에 안 보내고 파싱만 확인');
    process.exit(1);
  }

  // Find agent ID
  let agentId = null;
  if (!flags.dry) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const agentName = flags.agent || 'cadence';
    const { rows } = await pool.query('SELECT id FROM agents WHERE name = $1', [agentName]);
    if (rows.length === 0) {
      console.error(`에이전트 "${agentName}" 없음. --agent 옵션 확인.`);
      await pool.end();
      process.exit(1);
    }
    agentId = rows[0].id;
    console.log(`에이전트: ${agentName} (${agentId.slice(0, 8)})`);
    await pool.end();
  }

  const svc = new TextIngestionService({
    llmCall: flags.dry ? null : llm,
    agentId,
  });

  for (const file of files) {
    const filePath = path.resolve(file);
    if (!fs.existsSync(filePath)) {
      console.error(`파일 없음: ${filePath}`);
      continue;
    }

    const text = fs.readFileSync(filePath, 'utf-8');
    const title = flags.title || path.basename(filePath, path.extname(filePath));
    const genre = flags.genre || 'general';

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📚 ${title} (${genre})`);
    console.log(`   파일: ${filePath}`);
    console.log(`   크기: ${(text.length / 1000).toFixed(1)}KB / ${text.split(/\s+/).length} words`);

    if (flags.dry) {
      // 파싱만 확인
      const chapters = svc._splitChapters(text);
      console.log(`   챕터: ${chapters.length}개`);
      for (const ch of chapters.slice(0, 5)) {
        console.log(`     - ${ch.title} (${ch.content.length} chars)`);
      }
      if (chapters.length > 5) console.log(`     ... +${chapters.length - 5}개`);

      // 명문장 추출 테스트
      if (chapters[0]) {
        const best = svc._extractBestParagraphs(chapters[0].content, 2);
        if (best.length > 0) {
          console.log(`   명문장 샘플:`);
          for (const b of best) console.log(`     "${b.slice(0, 80)}..."`);
        }
        const dialogues = svc._extractDialogues(chapters[0].content, 3);
        if (dialogues.length > 0) {
          console.log(`   대화 샘플:`, dialogues.slice(0, 3));
        }
      }
    } else {
      // 실제 CGB 투입
      console.log(`   CGB에 투입 중...`);
      const result = await svc.ingest(text, {
        title,
        author: flags.author || 'unknown',
        genre,
        source: 'script',
      });
      console.log(`   ✅ 완료: ${result.nodesCreated} 노드 생성, ${result.chaptersFound} 챕터`);
    }
  }

  console.log('\n완료!');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
