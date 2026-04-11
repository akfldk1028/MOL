/**
 * Visualization.js
 * ----------------
 * Vega-Lite chart specification generated from an Analysis.
 *
 * Pattern: LIDA VISGENERATOR (Microsoft) — grammar-agnostic chart specs.
 * The canvas agent picks a chart type based on data shape, then emits a
 * Vega-Lite JSON spec. The frontend can render it directly.
 */

const crypto = require('crypto');

const CHART_TYPES = ['bar', 'line', 'scatter', 'heatmap', 'pie', 'network', 'sankey', 'area', 'boxplot'];

class Visualization {
  /**
   * @param {object} params
   * @param {string} params.analysis_id
   * @param {string} params.chart_type
   * @param {object} params.spec         - Vega-Lite JSON spec
   * @param {string} [params.title]
   * @param {string} [params.caption]    - NL caption for accessibility
   */
  constructor({ analysis_id, chart_type, spec, title = null, caption = null }) {
    if (!analysis_id) throw new Error('Visualization: analysis_id required');
    if (!CHART_TYPES.includes(chart_type)) {
      throw new Error(`Visualization: chart_type must be one of ${CHART_TYPES.join(', ')}`);
    }
    if (!spec || typeof spec !== 'object') {
      throw new Error('Visualization: spec must be an object (Vega-Lite JSON)');
    }
    this.id = crypto.randomUUID();
    this.analysis_id = analysis_id;
    this.chart_type = chart_type;
    this.spec = spec;
    this.title = title;
    this.caption = caption;
    this.created_at = new Date().toISOString();
  }

  toCGBNode() {
    return {
      id: `viz-${this.id}`,
      type: 'Visualization',
      title: this.title || `${this.chart_type} chart`,
      description: this.caption || `${this.chart_type} visualization for analysis ${this.analysis_id.slice(0, 8)}`,
      metadata: {
        analysis_id: this.analysis_id,
        chart_type: this.chart_type,
        spec: this.spec,
        title: this.title,
        caption: this.caption,
      },
    };
  }

  toJSON() {
    return {
      id: this.id,
      analysis_id: this.analysis_id,
      chart_type: this.chart_type,
      spec: this.spec,
      title: this.title,
      caption: this.caption,
      created_at: this.created_at,
    };
  }
}

module.exports = { Visualization, CHART_TYPES };
