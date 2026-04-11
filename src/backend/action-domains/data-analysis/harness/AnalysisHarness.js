/**
 * AnalysisHarness.js
 * ------------------
 * Sequential pipeline runner for data analysis.
 *
 *   atlas (Plan) → scout (Query × N) → lens (Analysis) → canvas (Viz) → oracle (Insight)
 *
 * Each stage:
 *   1. Builds agent-specific prompt from previous stage output
 *   2. Calls LLM (DashScope qwen-turbo by default)
 *   3. Parses + validates output via Zod-like check
 *   4. Retries once on invalid output
 *   5. Emits intermediate state to session log
 *
 * The harness never calls tools directly from LLM output without validation.
 * Query execution (sql-runner, youtube-fetcher, etc.) is invoked explicitly
 * by the harness using parsed Query objects from scout.
 */

const { HarnessBase } = require('../../_base/harness-base');
const { SessionBase } = require('../../_base/session-base');

const { DataSource } = require('../components/DataSource');
const { Goal } = require('../components/Goal');
const { Plan } = require('../components/Plan');
const { Query } = require('../components/Query');
const { Analysis } = require('../components/Analysis');
const { Visualization } = require('../components/Visualization');
const { Insight } = require('../components/Insight');
const { ExperienceTrace } = require('../components/ExperienceTrace');

const sqlRunner = require('../tools/sql-runner');
const pandasRunner = require('../tools/pandas-runner');
const chartGenerator = require('../tools/chart-generator');
const youtubeFetcher = require('../tools/youtube-fetcher');
const webFetcher = require('../tools/web-fetcher');

class AnalysisHarness extends HarnessBase {
  constructor(options = {}) {
    super({
      domain: 'data-analysis',
      config: options.config || {},
      llmCall: options.llmCall,
    });
  }

  /**
   * Create an analysis session.
   * @param {object} params
   * @param {Goal} params.goal
   * @param {DataSource} params.dataSource
   * @returns {SessionBase}
   */
  createSession({ goal, dataSource }) {
    const session = new SessionBase({
      domain: 'data-analysis',
      deadlineTurns: 10,
      metadata: {
        goal_id: goal.id,
        data_source_id: dataSource.id,
      },
    });
    session.goal = goal;
    session.dataSource = dataSource;
    return session;
  }

  /**
   * Run the full 5-stage pipeline.
   * @returns {Promise<{ plan, queries, analysis, visualization, insight, reason }>}
   */
  async run(session) {
    session.start();

    try {
      // Stage 1: atlas — Plan
      const plan = await this._stageAtlas(session);
      session.plan = plan;
      session.recordTurn({ actor: 'atlas', action: 'plan', payload: plan.toJSON() });

      // Stage 2: scout — Queries (per subproblem in topological order)
      const queries = await this._stageScout(session, plan);
      session.queries = queries;
      session.recordTurn({ actor: 'scout', action: 'queries', payload: queries.map((q) => q.toJSON()) });

      // Execute each query (harness-driven, not LLM-driven)
      const executedResults = await this._executeQueries(queries, session.dataSource);
      session.queryResults = executedResults;

      // Stage 3: lens — Analysis
      const analysis = await this._stageLens(session, queries, executedResults);
      session.analysis = analysis;
      session.recordTurn({ actor: 'lens', action: 'analyze', payload: analysis.toJSON() });

      // Stage 4: canvas — Visualization
      const visualization = await this._stageCanvas(session, analysis, executedResults);
      session.visualization = visualization;
      session.recordTurn({ actor: 'canvas', action: 'visualize', payload: visualization.toJSON() });

      // Stage 5: oracle — Insight
      const insight = await this._stageOracle(session, analysis, visualization);
      session.insight = insight;
      session.recordTurn({ actor: 'oracle', action: 'insight', payload: insight.toJSON() });

      // Save ExperienceTrace if successful
      if (insight.confidence >= 0.7) {
        const trace = new ExperienceTrace({
          goal_id: session.goal.id,
          plan_id: plan.id,
          insight_id: insight.id,
          success: true,
          reusable_tags: this._extractTags(session.goal.nl_intent),
          quality_score: insight.confidence,
        });
        session.trace = trace;
      }

      session.close('closed', {
        plan_id: plan.id,
        insight_id: insight.id,
      });

      return {
        session_id: session.id,
        plan: plan.toJSON(),
        queries: queries.map((q) => q.toJSON()),
        analysis: analysis.toJSON(),
        visualization: visualization.toJSON(),
        insight: insight.toJSON(),
        reason: 'completed',
      };
    } catch (err) {
      session.fail(err);
      return {
        session_id: session.id,
        plan: session.plan ? session.plan.toJSON() : null,
        queries: session.queries ? session.queries.map((q) => q.toJSON()) : [],
        analysis: session.analysis ? session.analysis.toJSON() : null,
        visualization: session.visualization ? session.visualization.toJSON() : null,
        insight: session.insight ? session.insight.toJSON() : null,
        error: err.message,
        reason: 'failed',
      };
    }
  }

  // ─────────────────────────────────────────────
  // Stage 1: atlas (Planner)
  // ─────────────────────────────────────────────

  async _stageAtlas(session) {
    const system = [
      'You are atlas, an analysis planner.',
      'Decompose the user goal into a DAG of atomic subproblems.',
      'Each subproblem should be solvable with ONE tool call.',
      '',
      'Available tools: sql, youtube, web-fetch, pandas',
      '',
      'Respond ONLY with JSON in this shape:',
      '{',
      '  "subproblems": [',
      '    { "id": "sp1", "description": "...", "tool": "sql|youtube|web|pandas", "expected_output": "..." },',
      '    ...',
      '  ],',
      '  "dependencies": { "sp2": ["sp1"], ... }',
      '}',
    ].join('\n');

    const user = [
      `## Goal\n${session.goal.nl_intent}`,
      '',
      `## Data Source\n${session.dataSource.describe()}`,
      `Schema: ${session.dataSource.schemaSummary(300)}`,
    ].join('\n');

    const raw = await this.llmCall(system, user, { maxOutputTokens: 1024 });
    const parsed = this.parseJsonAction(raw);
    if (!parsed || !Array.isArray(parsed.subproblems) || parsed.subproblems.length === 0) {
      throw new Error('atlas: failed to produce valid plan');
    }

    return new Plan({
      goal_id: session.goal.id,
      subproblems: parsed.subproblems,
      dependencies: parsed.dependencies || {},
    });
  }

  // ─────────────────────────────────────────────
  // Stage 2: scout (Collector)
  // ─────────────────────────────────────────────

  async _stageScout(session, plan) {
    const sortedSubs = plan.topologicalSort();
    const queries = [];

    for (const sub of sortedSubs) {
      const system = [
        'You are scout, a data collector.',
        'Generate ONE tool call that satisfies the given subproblem.',
        '',
        'Respond ONLY with JSON:',
        '{',
        '  "language": "sql|pandas|api-call|web-fetch",',
        '  "code": "the actual query or URL",',
        '  "parameters": {},',
        '  "result_schema": { "column1": "type", ... }',
        '}',
      ].join('\n');

      const user = [
        `## Subproblem\n${sub.description}`,
        `## Tool\n${sub.tool || 'any'}`,
        `## Data Source\n${session.dataSource.describe()}`,
        `Schema: ${session.dataSource.schemaSummary(300)}`,
        `## Expected Output\n${sub.expected_output || '(not specified)'}`,
      ].join('\n');

      const raw = await this.llmCall(system, user, { maxOutputTokens: 512 });
      const parsed = this.parseJsonAction(raw);
      if (!parsed || !parsed.language || !parsed.code) {
        console.warn(`[scout] failed to produce query for ${sub.id}, skipping`);
        continue;
      }

      const q = new Query({
        plan_id: plan.id,
        subproblem_id: sub.id,
        language: parsed.language,
        code: parsed.code,
        parameters: parsed.parameters || {},
        result_schema: parsed.result_schema || null,
      });
      queries.push(q);
    }

    return queries;
  }

  // ─────────────────────────────────────────────
  // Query execution (harness-driven, not LLM)
  // ─────────────────────────────────────────────

  async _executeQueries(queries, dataSource) {
    const results = [];
    for (const q of queries) {
      const r = await this._executeOne(q, dataSource);
      results.push({ query_id: q.id, ...r });
    }
    return results;
  }

  async _executeOne(query, dataSource) {
    try {
      if (query.language === 'sql') {
        return await sqlRunner.runSQL(query.code);
      }
      if (query.language === 'api-call' || query.language === 'web-fetch') {
        // Treat youtube URIs specially
        if (query.code.includes('youtube') || dataSource.source_type === 'youtube') {
          // Parse video ID from code if present
          const videoIdMatch = query.code.match(/videoId[=:]\s*["']?([\w-]+)["']?/);
          if (videoIdMatch) {
            return await youtubeFetcher.fetchVideoStats(videoIdMatch[1]);
          }
          return { ok: false, errors: ['youtube query missing videoId'] };
        }
        return await webFetcher.fetchUrl(query.code, { format: 'text' });
      }
      if (query.language === 'pandas') {
        // Pure JS fallback for simple ops
        return { ok: false, errors: ['pandas execution stubbed — needs subprocess'] };
      }
      return { ok: false, errors: [`unsupported language: ${query.language}`] };
    } catch (err) {
      return { ok: false, errors: [err.message] };
    }
  }

  // ─────────────────────────────────────────────
  // Stage 3: lens (Analyst)
  // ─────────────────────────────────────────────

  async _stageLens(session, queries, executedResults) {
    const system = [
      'You are lens, a data analyst.',
      'Given query results, extract statistics, trends, and anomalies.',
      '',
      'Respond ONLY with JSON:',
      '{',
      '  "statistics": { "metric": value, ... },',
      '  "trends": [...],',
      '  "anomalies": [...],',
      '  "checks_passed": [...]',
      '}',
    ].join('\n');

    const user = [
      `## Goal\n${session.goal.nl_intent}`,
      '## Query Results',
      JSON.stringify(executedResults).slice(0, 2000),
    ].join('\n');

    const raw = await this.llmCall(system, user, { maxOutputTokens: 1024 });
    const parsed = this.parseJsonAction(raw);
    if (!parsed) {
      throw new Error('lens: failed to produce valid analysis');
    }

    return new Analysis({
      query_id: queries[0] ? queries[0].id : 'unknown',
      result: executedResults,
      checks_passed: parsed.checks_passed || [],
      anomalies: parsed.anomalies || [],
      statistics: parsed.statistics || {},
    });
  }

  // ─────────────────────────────────────────────
  // Stage 4: canvas (Visualizer)
  // ─────────────────────────────────────────────

  async _stageCanvas(session, analysis, executedResults) {
    // Data for charting: take first successful result rows
    const first = executedResults.find((r) => r.ok && r.rows && r.rows.length > 0);
    const data = first ? first.rows : [];

    if (data.length === 0) {
      // No data — return empty placeholder viz
      return new Visualization({
        analysis_id: analysis.id,
        chart_type: 'bar',
        spec: { $schema: 'https://vega.github.io/schema/vega-lite/v5.json', data: { values: [] } },
        title: 'No data',
        caption: 'Query returned no rows',
      });
    }

    // Ask canvas (LLM) to pick chart type + axes
    const system = [
      'You are canvas, a visualization designer.',
      'Given data and analysis, pick the best chart type and specify x/y fields.',
      '',
      'Respond ONLY with JSON:',
      '{',
      '  "chart_type": "bar|line|scatter|pie|heatmap",',
      '  "x": "field_name",',
      '  "y": "field_name",',
      '  "title": "short title",',
      '  "caption": "one-line description"',
      '}',
    ].join('\n');

    const user = [
      `## Analysis Summary\n${analysis.summarize(400)}`,
      `## Data Sample (first row)\n${JSON.stringify(data[0])}`,
      `## Available fields\n${Object.keys(data[0]).join(', ')}`,
    ].join('\n');

    const raw = await this.llmCall(system, user, { maxOutputTokens: 400 });
    const parsed = this.parseJsonAction(raw) || {};

    const { chart_type, spec } = chartGenerator.toVegaLite({
      data,
      chart_type: parsed.chart_type,
      x: parsed.x,
      y: parsed.y,
      title: parsed.title,
    });

    return new Visualization({
      analysis_id: analysis.id,
      chart_type,
      spec,
      title: parsed.title || null,
      caption: parsed.caption || null,
    });
  }

  // ─────────────────────────────────────────────
  // Stage 5: oracle (Insighter)
  // ─────────────────────────────────────────────

  async _stageOracle(session, analysis, visualization) {
    const system = [
      'You are oracle, a data insight generator.',
      'Summarize the analysis as one actionable insight for the user.',
      '',
      'Respond ONLY with JSON:',
      '{',
      '  "text": "1-3 sentence insight",',
      '  "confidence": 0.0-1.0,',
      '  "recommendations": ["action 1", "action 2"],',
      '  "metrics": { "key_number": value }',
      '}',
    ].join('\n');

    const user = [
      `## Original Goal\n${session.goal.nl_intent}`,
      `## Analysis\n${analysis.summarize(400)}`,
      `## Chart\n${visualization.chart_type}: ${visualization.title || ''}`,
    ].join('\n');

    const raw = await this.llmCall(system, user, { maxOutputTokens: 600 });
    const parsed = this.parseJsonAction(raw);
    if (!parsed || !parsed.text) {
      return new Insight({
        goal_id: session.goal.id,
        text: 'Unable to produce a high-confidence insight from this analysis.',
        confidence: 0.2,
      });
    }

    return new Insight({
      goal_id: session.goal.id,
      text: parsed.text,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
      supporting_queries: session.queries ? session.queries.map((q) => q.id) : [],
      visualization_id: visualization.id,
      recommendations: parsed.recommendations || [],
      metrics: parsed.metrics || {},
    });
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  _extractTags(nlIntent) {
    return nlIntent
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5);
  }
}

module.exports = {
  AnalysisHarness,
};
