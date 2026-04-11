/**
 * chart-generator.js
 * ------------------
 * Generate Vega-Lite chart specs from analysis data.
 *
 * Pattern: LIDA VISGENERATOR — grammar-agnostic chart specs that the
 * frontend can render directly (via vega-lite).
 *
 * Picks chart type heuristically based on data shape; can also be
 * explicitly requested via `chart_type` parameter.
 */

/**
 * Infer a sensible chart type from data shape.
 * @param {object[]} data - array of objects
 * @returns {string} chart_type
 */
function inferChartType(data) {
  if (!Array.isArray(data) || data.length === 0) return 'bar';
  const sample = data[0];
  const keys = Object.keys(sample || {});
  const numericKeys = keys.filter(
    (k) => typeof sample[k] === 'number' || !isNaN(Number(sample[k]))
  );

  // Single categorical + single numeric → bar
  if (keys.length === 2 && numericKeys.length === 1) return 'bar';
  // Two numeric → scatter
  if (numericKeys.length >= 2 && keys.length === numericKeys.length) return 'scatter';
  // Has a timestamp/date field → line
  const hasTime = keys.some((k) => /date|time|month|year|day/i.test(k));
  if (hasTime) return 'line';
  // Many categories → bar
  return 'bar';
}

/**
 * Build a Vega-Lite spec.
 * @param {object} params
 * @param {object[]} params.data       - row objects
 * @param {string} [params.chart_type] - override auto-detect
 * @param {string} [params.x]          - x field name
 * @param {string} [params.y]          - y field name
 * @param {string} [params.title]
 * @returns {{ spec, chart_type }}
 */
function toVegaLite({ data, chart_type = null, x = null, y = null, title = null }) {
  if (!Array.isArray(data)) {
    throw new Error('chart-generator: data must be an array of objects');
  }

  const type = chart_type || inferChartType(data);
  const sample = data[0] || {};
  const keys = Object.keys(sample);

  // Auto-pick x/y if not specified
  const xField = x || keys[0];
  const yField = y || keys.find((k) => typeof sample[k] === 'number') || keys[1];

  const baseSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: title || `${type} chart`,
    data: { values: data },
    width: 400,
    height: 250,
    title,
  };

  switch (type) {
    case 'bar':
      return {
        chart_type: 'bar',
        spec: {
          ...baseSpec,
          mark: 'bar',
          encoding: {
            x: { field: xField, type: 'nominal' },
            y: { field: yField, type: 'quantitative' },
          },
        },
      };
    case 'line':
      return {
        chart_type: 'line',
        spec: {
          ...baseSpec,
          mark: 'line',
          encoding: {
            x: { field: xField, type: /date|time/i.test(xField) ? 'temporal' : 'ordinal' },
            y: { field: yField, type: 'quantitative' },
          },
        },
      };
    case 'scatter':
      return {
        chart_type: 'scatter',
        spec: {
          ...baseSpec,
          mark: 'point',
          encoding: {
            x: { field: xField, type: 'quantitative' },
            y: { field: yField, type: 'quantitative' },
          },
        },
      };
    case 'pie':
      return {
        chart_type: 'pie',
        spec: {
          ...baseSpec,
          mark: { type: 'arc' },
          encoding: {
            theta: { field: yField, type: 'quantitative' },
            color: { field: xField, type: 'nominal' },
          },
        },
      };
    case 'heatmap':
      return {
        chart_type: 'heatmap',
        spec: {
          ...baseSpec,
          mark: 'rect',
          encoding: {
            x: { field: xField, type: 'ordinal' },
            y: { field: keys[1], type: 'ordinal' },
            color: { field: yField, type: 'quantitative' },
          },
        },
      };
    default:
      return {
        chart_type: 'bar',
        spec: {
          ...baseSpec,
          mark: 'bar',
          encoding: {
            x: { field: xField, type: 'nominal' },
            y: { field: yField, type: 'quantitative' },
          },
        },
      };
  }
}

module.exports = {
  inferChartType,
  toVegaLite,
};
