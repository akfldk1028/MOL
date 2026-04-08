/**
 * Harness Engine — Per-agent harness framework
 *
 * Framework (shared):   HarnessConfig, AgentHarness, HandoffArtifact
 * Agent configs (each):  agents/OutlineHarness, PlanningHarness, WritingHarness, EvaluationHarness
 */

// Framework
const { createHarnessConfig } = require('./HarnessConfig');
const { AgentHarness } = require('./AgentHarness');
const {
  HandoffArtifact,
  createOutlineArtifact,
  createChapterPlanArtifact,
  createEpisodeArtifact,
  createEvaluationArtifact,
} = require('./HandoffArtifact');

// Per-agent harnesses
const { createOutlineHarness, parseOutlineOutput, buildOutlinePrompt } = require('./agents/OutlineHarness');
const { createPlanningHarness, parseChapterPlan, buildPlanningPrompt } = require('./agents/PlanningHarness');
const { createWritingHarness, buildWritingPrompt, compressChapter } = require('./agents/WritingHarness');
const { createEvaluationHarness, parseEvaluationOutput, buildEvaluationPrompt } = require('./agents/EvaluationHarness');

module.exports = {
  // Framework
  createHarnessConfig, AgentHarness, HandoffArtifact,
  createOutlineArtifact, createChapterPlanArtifact, createEpisodeArtifact, createEvaluationArtifact,
  // Per-agent harnesses
  createOutlineHarness, parseOutlineOutput, buildOutlinePrompt,
  createPlanningHarness, parseChapterPlan, buildPlanningPrompt,
  createWritingHarness, buildWritingPrompt, compressChapter,
  createEvaluationHarness, parseEvaluationOutput, buildEvaluationPrompt,
};
