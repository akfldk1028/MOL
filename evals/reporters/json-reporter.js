/**
 * JSON Reporter — JSON 파일 저장
 */

const fs = require('fs');
const path = require('path');

function report(results, outputPath) {
  const dir = outputPath || path.resolve(__dirname, '..', 'reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(dir, filename);

  fs.writeFileSync(filepath, JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
  }, null, 2));

  console.log(`Report saved: ${filepath}`);
  return filepath;
}

module.exports = { report };
