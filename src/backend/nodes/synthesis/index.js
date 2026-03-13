/**
 * Node: synthesis
 * Generates a final synthesis of all debate responses using the synthesizer agent.
 */

const generalFormat = require('./formats/general');
const medicalFormat = require('./formats/medical');
const legalFormat = require('./formats/legal');
const investmentFormat = require('./formats/investment');
const techFormat = require('./formats/tech');
const critiqueFormat = require('./formats/critique');
const critiqueNovelFormat = require('./formats/critique-novel');
const critiqueWebtoonFormat = require('./formats/critique-webtoon');
const analysisFormat = require('./formats/analysis');
const finalReportFormat = require('./formats/final-report');
const llmCallNode = require('../llm-call');
const OrchestratorService = require('../../services/OrchestratorService');

const formats = {
  general: generalFormat,
  medical: medicalFormat,
  legal: legalFormat,
  investment: investmentFormat,
  tech: techFormat,
  critique: critiqueFormat,
  'critique-novel': critiqueNovelFormat,
  'critique-webtoon': critiqueWebtoonFormat,
  analysis: analysisFormat,
  'final-report': finalReportFormat,
};

module.exports = {
  type: 'synthesis',
  name: 'Synthesis',
  description: 'Generate a final synthesis of all debate responses',

  /**
   * @param {import('../../engine/WorkflowContext')} ctx
   * @param {Object} config
   * @param {string} [config.format='general']
   */
  async execute(ctx, config = {}) {
    const formatName = config.format || ctx.workflowConfig.synthesisFormat || 'general';
    const format = formats[formatName];
    if (!format) throw new Error(`Unknown synthesis format: "${formatName}"`);

    const synthesizer = ctx.agents.find(a => a.role === 'synthesizer') || ctx.agents.find(a => a.name === 'synthesizer');
    if (!synthesizer) {
      console.warn('No synthesizer agent found — skipping synthesis');
      return { content: null };
    }

    const channelId = ctx.creationId || ctx.questionId;
    OrchestratorService.emit(channelId, 'agent_thinking', { agent: synthesizer.name, round: 'synthesis' });

    const { systemPrompt, userPrompt } = format.buildPrompts(ctx);

    const { content } = await llmCallNode.execute(ctx, {
      agent: synthesizer,
      systemPrompt,
      userPrompt,
    });

    const prefix = formatName === 'analysis' ? '## Analysis'
      : formatName === 'final-report' ? '## Final Report'
      : '## Synthesis';
    const fullContent = `${prefix}\n\n${content}`;

    if (formatName === 'final-report') {
      ctx.finalReportContent = fullContent;
      ctx.workflowPhase = 'report';
      OrchestratorService.emit(channelId, 'phase_change', { phase: 'report' });
    } else {
      ctx.synthesisContent = fullContent;
    }

    return { content: fullContent };
  },

  registerFormat(name, format) {
    formats[name] = format;
  },
};
