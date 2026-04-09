/**
 * Console Reporter — CLI 테이블 출력
 */

function report(evalResult) {
  const { evalType, evalName } = evalResult;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${evalType.toUpperCase()} / ${evalName}`);
  console.log(`${'═'.repeat(60)}`);

  if (evalResult.results) {
    // Benchmark-style (multiple items)
    const top = evalResult.results.slice(0, 20);
    console.log(`  Top ${top.length} of ${evalResult.agentCount || evalResult.results.length}:\n`);

    for (const r of top) {
      const score = r.totalScore ?? r.value ?? 'N/A';
      const name = r.name || r.agentId || r.id || '?';
      const rank = r.rank ? `#${r.rank}` : '';
      console.log(`  ${rank.padStart(4)} ${String(score).padStart(6)} │ ${name}`);
    }
  } else if (evalResult.value !== undefined) {
    // Single score
    console.log(`  Score: ${evalResult.value ?? 'N/A'}`);
    if (evalResult.metadata) {
      for (const [k, v] of Object.entries(evalResult.metadata)) {
        if (typeof v === 'object') continue;
        console.log(`  ${k}: ${v}`);
      }
    }
  }

  console.log('');
}

function reportMultiple(results) {
  console.log(`\n${'━'.repeat(60)}`);
  console.log('  MOL Performance Evaluation Report');
  console.log(`  ${new Date().toISOString().split('T')[0]}`);
  console.log(`${'━'.repeat(60)}`);

  for (const r of results) {
    report(r);
  }

  console.log(`${'━'.repeat(60)}`);
  console.log(`  ${results.length} evaluations completed`);
  console.log(`${'━'.repeat(60)}\n`);
}

module.exports = { report, reportMultiple };
