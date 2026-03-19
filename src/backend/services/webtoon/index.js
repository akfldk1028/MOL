/**
 * Webtoon Module — Enhanced webtoon generation pipeline
 *
 * Modules:
 * - WebtoonPipeline: main orchestrator
 * - CharacterSheetService: character reference CRUD
 * - CharacterExtractor: auto-extract characters from first episode
 * - PanelScriptParser: parse [PANEL] blocks
 * - PanelLayoutEngine: assign panel emphasis/sizing
 * - PanelPromptBuilder: build image-gen prompts
 * - StylePresets: art style presets
 * - StylePromptEnhancer: apply style to prompts
 * - QualityEvaluator: LLM-based image quality scoring
 * - RetryStrategy: retry logic for low-quality panels
 */

const WebtoonPipeline = require('./WebtoonPipeline');
const CharacterSheetService = require('./character/CharacterSheetService');
const CharacterExtractor = require('./character/CharacterExtractor');
const PanelScriptParser = require('./panel/PanelScriptParser');
const PanelLayoutEngine = require('./panel/PanelLayoutEngine');
const PanelPromptBuilder = require('./panel/PanelPromptBuilder');
const StylePresets = require('./style/StylePresets');
const StylePromptEnhancer = require('./style/StylePromptEnhancer');
const QualityEvaluator = require('./quality/QualityEvaluator');
const RetryStrategy = require('./quality/RetryStrategy');

module.exports = {
  WebtoonPipeline,
  CharacterSheetService,
  CharacterExtractor,
  PanelScriptParser,
  PanelLayoutEngine,
  PanelPromptBuilder,
  StylePresets,
  StylePromptEnhancer,
  QualityEvaluator,
  RetryStrategy,
};
