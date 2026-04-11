/**
 * DataSource.js
 * -------------
 * A handle to the data being analyzed.
 *
 * Supported types:
 *   - youtube:      YouTube Data API v3 (channel, video, trending)
 *   - sql:          Supabase / Postgres (read-only)
 *   - csv:          user-uploaded CSV file
 *   - api:          generic REST endpoint
 *   - user-upload:  user-provided raw data blob
 *   - web:          scraped web page
 */

const crypto = require('crypto');

const SOURCE_TYPES = ['youtube', 'sql', 'csv', 'api', 'user-upload', 'web'];

class DataSource {
  /**
   * @param {object} params
   * @param {string} params.source_type
   * @param {string} [params.uri]         - URL, table name, or file path
   * @param {object} [params.schema]      - data shape (columns/fields)
   * @param {string} [params.owner_agent_id]
   * @param {object} [params.auth]        - API key refs etc (NEVER log)
   */
  constructor({ source_type, uri, schema = null, owner_agent_id = null, auth = null }) {
    if (!SOURCE_TYPES.includes(source_type)) {
      throw new Error(`DataSource: source_type must be one of ${SOURCE_TYPES.join(', ')}`);
    }
    this.id = crypto.randomUUID();
    this.source_type = source_type;
    this.uri = uri;
    this.schema = schema;
    this.owner_agent_id = owner_agent_id;
    this._auth = auth; // underscore = don't serialize
    this.created_at = new Date().toISOString();
  }

  /**
   * Get a short description suitable for prompt injection.
   */
  describe() {
    return `[${this.source_type}] ${this.uri || '(no uri)'}`;
  }

  /**
   * Schema summary for prompts — truncated to fit.
   */
  schemaSummary(maxChars = 500) {
    if (!this.schema) return '(no schema known)';
    const str = typeof this.schema === 'string'
      ? this.schema
      : JSON.stringify(this.schema);
    return str.length > maxChars ? str.slice(0, maxChars) + '...' : str;
  }

  toCGBNode() {
    return {
      id: `datasource-${this.id}`,
      type: 'DataSource',
      title: this.describe(),
      description: this.schemaSummary(200),
      metadata: {
        source_type: this.source_type,
        uri: this.uri,
        schema: this.schema,
        owner_agent_id: this.owner_agent_id,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      source_type: this.source_type,
      uri: this.uri,
      schema: this.schema,
      owner_agent_id: this.owner_agent_id,
      created_at: this.created_at,
    };
  }
}

module.exports = { DataSource, SOURCE_TYPES };
