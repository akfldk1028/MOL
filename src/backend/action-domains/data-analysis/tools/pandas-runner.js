/**
 * pandas-runner.js
 * ----------------
 * Python subprocess runner for pandas operations.
 *
 * WARNING: executes arbitrary Python. Must be sandboxed in prod.
 * Current implementation is a stub — returns an "unavailable" error if
 * Python is not present. Phase 5 can add real subprocess execution.
 *
 * For now, simple JS-only operations on arrays are supported via the
 * `runJS()` helper — enough for basic aggregations, filters, and group-bys
 * without Python.
 */

const { spawn } = require('child_process');
const path = require('path');

/**
 * Check if Python is available in the environment.
 */
async function isAvailable() {
  return new Promise((resolve) => {
    try {
      const proc = spawn('python', ['--version'], { stdio: 'ignore' });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

/**
 * Run Python pandas code in a subprocess (stub).
 * @param {string} code - Python code (assumes `data` is pre-injected)
 * @param {object} data - input data (passed via stdin as JSON)
 * @param {object} [options]
 * @returns {Promise<{ ok, result, errors, stdout, stderr }>}
 */
async function runPython(code, data, options = {}) {
  const { timeout = 30000 } = options;
  const available = await isAvailable();
  if (!available) {
    return {
      ok: false,
      result: null,
      errors: ['Python not available in environment. Use runJS() for JS-only ops.'],
      stdout: '',
      stderr: '',
    };
  }

  // Skeleton — wraps user code with data injection
  const wrapped = `
import sys, json
try:
    import pandas as pd
except ImportError:
    print(json.dumps({"error": "pandas not installed"}), file=sys.stderr)
    sys.exit(1)

_data = json.loads(sys.stdin.read())
df = pd.DataFrame(_data) if isinstance(_data, list) else _data

${code}
`;

  return new Promise((resolve) => {
    const proc = spawn('python', ['-c', wrapped], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ ok: false, result: null, errors: [`timeout ${timeout}ms`], stdout, stderr });
    }, timeout);

    proc.stdin.write(JSON.stringify(data));
    proc.stdin.end();

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({
          ok: false,
          result: null,
          errors: [`python exited with code ${code}`, stderr.slice(0, 500)],
          stdout,
          stderr,
        });
      } else {
        let parsed = null;
        try {
          parsed = JSON.parse(stdout);
        } catch {
          parsed = stdout;
        }
        resolve({ ok: true, result: parsed, errors: [], stdout, stderr });
      }
    });
  });
}

/**
 * Pure-JS pandas-like operations for rows (array of objects).
 * No subprocess needed.
 */
const runJS = {
  filter(rows, predicate) {
    if (typeof predicate !== 'function') return rows;
    return rows.filter(predicate);
  },

  groupBy(rows, key) {
    const groups = {};
    for (const row of rows) {
      const k = row[key];
      if (!groups[k]) groups[k] = [];
      groups[k].push(row);
    }
    return groups;
  },

  aggregate(rows, column, fn = 'sum') {
    const vals = rows.map((r) => Number(r[column]) || 0);
    if (vals.length === 0) return 0;
    switch (fn) {
      case 'sum':
        return vals.reduce((a, b) => a + b, 0);
      case 'mean':
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      case 'min':
        return Math.min(...vals);
      case 'max':
        return Math.max(...vals);
      case 'count':
        return vals.length;
      default:
        throw new Error(`runJS.aggregate: unknown fn '${fn}'`);
    }
  },

  topN(rows, column, n = 5, order = 'desc') {
    const sorted = [...rows].sort((a, b) => {
      const av = Number(a[column]) || 0;
      const bv = Number(b[column]) || 0;
      return order === 'desc' ? bv - av : av - bv;
    });
    return sorted.slice(0, n);
  },
};

module.exports = {
  isAvailable,
  runPython,
  runJS,
};
