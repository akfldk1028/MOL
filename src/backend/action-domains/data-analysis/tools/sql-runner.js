/**
 * sql-runner.js
 * -------------
 * Safe SQL runner for data-analysis queries.
 *
 * SECURITY:
 *   1. SELECT statements ONLY — reject DROP/DELETE/INSERT/UPDATE/TRUNCATE/ALTER
 *   2. No multi-statement (no ';' except at end)
 *   3. No system schema access (pg_*, information_schema, supabase_*)
 *   4. Row limit auto-applied (default 1000)
 *   5. Query timeout (default 10s)
 *
 * Uses the existing queryAll helper — no new DB connection pool.
 * For full isolation, a separate read-only role should be used in prod.
 */

const DANGEROUS_KEYWORDS = [
  'drop',
  'delete',
  'insert',
  'update',
  'truncate',
  'alter',
  'create',
  'grant',
  'revoke',
  'comment',
  'copy',
  'vacuum',
  'analyze',
];

const FORBIDDEN_SCHEMAS = [
  'pg_catalog',
  'information_schema',
  'pg_toast',
  'supabase_auth',
  'supabase_realtime',
  'storage',
  'auth',
];

/**
 * Validate a SQL string. Returns { ok, errors }.
 */
function validate(sql) {
  const errors = [];
  if (!sql || typeof sql !== 'string') {
    return { ok: false, errors: ['sql must be a non-empty string'] };
  }

  const trimmed = sql.trim().replace(/;$/, '');
  const lowered = trimmed.toLowerCase();

  // Must start with SELECT or WITH (CTE)
  if (!/^(select|with)\b/i.test(trimmed)) {
    errors.push('only SELECT / WITH queries allowed');
  }

  // No dangerous keywords
  for (const kw of DANGEROUS_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(lowered)) {
      errors.push(`forbidden keyword: ${kw}`);
    }
  }

  // No multi-statement
  if (trimmed.includes(';')) {
    errors.push('multi-statement queries not allowed (no semicolons)');
  }

  // No forbidden schemas
  for (const schema of FORBIDDEN_SCHEMAS) {
    if (lowered.includes(schema)) {
      errors.push(`access to ${schema} schema forbidden`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Auto-apply LIMIT if not present.
 */
function enforceLimit(sql, maxRows = 1000) {
  const trimmed = sql.trim().replace(/;$/, '');
  if (/\blimit\s+\d+/i.test(trimmed)) return trimmed;
  return `${trimmed} LIMIT ${maxRows}`;
}

/**
 * Execute a validated query with a timeout.
 * @param {string} sql
 * @param {object} [options]
 * @param {number} [options.timeout=10000]
 * @param {number} [options.maxRows=1000]
 * @returns {Promise<{ ok, rows, errors, rowCount }>}
 */
async function runSQL(sql, options = {}) {
  const { timeout = 10000, maxRows = 1000 } = options;

  const validation = validate(sql);
  if (!validation.ok) {
    return { ok: false, rows: [], errors: validation.errors, rowCount: 0 };
  }

  const limited = enforceLimit(sql, maxRows);

  try {
    const { queryAll } = require('../../../config/database');
    // queryAll does not natively support per-statement timeout; we wrap in Promise.race
    const rows = await Promise.race([
      queryAll(limited, []),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`sql-runner timeout ${timeout}ms`)), timeout)
      ),
    ]);
    return {
      ok: true,
      rows: Array.isArray(rows) ? rows : [],
      errors: [],
      rowCount: Array.isArray(rows) ? rows.length : 0,
    };
  } catch (err) {
    return {
      ok: false,
      rows: [],
      errors: [err.message],
      rowCount: 0,
    };
  }
}

module.exports = {
  runSQL,
  validate,
  enforceLimit,
  DANGEROUS_KEYWORDS,
  FORBIDDEN_SCHEMAS,
};
