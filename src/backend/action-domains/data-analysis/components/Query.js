/**
 * Query.js
 * --------
 * A generated, validated tool call (SQL, pandas code, API request).
 *
 * The `scout` agent generates queries and the harness validates + executes
 * them via the tool registry.
 */

const crypto = require('crypto');

const LANGUAGES = ['sql', 'pandas', 'json-path', 'api-call', 'web-fetch'];

class Query {
  /**
   * @param {object} params
   * @param {string} params.plan_id
   * @param {string} params.subproblem_id - which subproblem this satisfies
   * @param {string} params.language      - sql / pandas / json-path / api-call / web-fetch
   * @param {string} params.code          - the actual query string
   * @param {object} [params.parameters]  - bound parameters
   * @param {object} [params.result_schema] - expected result shape
   */
  constructor({ plan_id, subproblem_id, language, code, parameters = {}, result_schema = null }) {
    if (!plan_id) throw new Error('Query: plan_id required');
    if (!subproblem_id) throw new Error('Query: subproblem_id required');
    if (!LANGUAGES.includes(language)) {
      throw new Error(`Query: language must be one of ${LANGUAGES.join(', ')}`);
    }
    if (!code || typeof code !== 'string') {
      throw new Error('Query: code must be a non-empty string');
    }
    this.id = crypto.randomUUID();
    this.plan_id = plan_id;
    this.subproblem_id = subproblem_id;
    this.language = language;
    this.code = code;
    this.parameters = parameters;
    this.result_schema = result_schema;
    this.validated = false;
    this.validation_errors = [];
    this.created_at = new Date().toISOString();
  }

  markValidated(errors = []) {
    this.validated = errors.length === 0;
    this.validation_errors = errors;
  }

  toCGBNode() {
    return {
      id: `query-${this.id}`,
      type: 'Query',
      title: `[${this.language}] ${this.code.slice(0, 80)}`,
      description: this.code,
      metadata: {
        plan_id: this.plan_id,
        subproblem_id: this.subproblem_id,
        language: this.language,
        parameters: this.parameters,
        validated: this.validated,
        validation_errors: this.validation_errors,
        result_schema: this.result_schema,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      plan_id: this.plan_id,
      subproblem_id: this.subproblem_id,
      language: this.language,
      code: this.code,
      parameters: this.parameters,
      validated: this.validated,
      validation_errors: this.validation_errors,
      result_schema: this.result_schema,
      created_at: this.created_at,
    };
  }
}

module.exports = { Query, LANGUAGES };
