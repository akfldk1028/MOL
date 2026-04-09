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

// Per-agent harnesses — Story
const { createOutlineHarness, parseOutlineOutput, buildOutlinePrompt } = require('./agents/OutlineHarness');
const { createPlanningHarness, parseChapterPlan, buildPlanningPrompt } = require('./agents/PlanningHarness');
const { createWritingHarness, buildWritingPrompt, compressChapter } = require('./agents/WritingHarness');
const { createEvaluationHarness, parseEvaluationOutput, buildEvaluationPrompt } = require('./agents/EvaluationHarness');
// Per-agent harnesses — Critique (all 8 domains)
const { createCritiqueHarness, buildCritiquePrompt, getDomainSynthesisConfig, DOMAIN_SYNTHESIS } = require('./agents/CritiqueHarness');

module.exports = {
  // Framework
  createHarnessConfig, AgentHarness, HandoffArtifact,
  createOutlineArtifact, createChapterPlanArtifact, createEpisodeArtifact, createEvaluationArtifact,
  // Per-agent harnesses — Story
  createOutlineHarness, parseOutlineOutput, buildOutlinePrompt,
  createPlanningHarness, parseChapterPlan, buildPlanningPrompt,
  createWritingHarness, buildWritingPrompt, compressChapter,
  createEvaluationHarness, parseEvaluationOutput, buildEvaluationPrompt,
  // Per-agent harnesses — Critique
  createCritiqueHarness, buildCritiquePrompt, getDomainSynthesisConfig, DOMAIN_SYNTHESIS,
};
