/**
 * HandoffArtifact — Structured data transfer between agents
 *
 * Based on Anthropic 3-agent harness: "structured handoff artifacts"
 * prevent context loss between planning → generation → evaluation cycles.
 *
 * Each artifact is a typed JSON object stored in SharedMemory.
 */

class HandoffArtifact {
  /**
   * @param {string} type - Artifact type (e.g. 'outline', 'chapters', 'episode', 'evaluation')
   * @param {string} fromAgent - Source agent name
   * @param {string} toAgent - Target agent name
   * @param {object} data - The structured payload
   * @param {object} [metadata] - Extra metadata
   */
  constructor(type, fromAgent, toAgent, data, metadata = {}) {
    this.type = type;
    this.fromAgent = fromAgent;
    this.toAgent = toAgent;
    this.data = data;
    this.metadata = {
      ...metadata,
      createdAt: new Date().toISOString(),
      version: metadata.version || 1,
    };
  }

  /** Serialize for SharedMemory storage. */
  serialize() {
    return JSON.stringify({
      type: this.type,
      fromAgent: this.fromAgent,
      toAgent: this.toAgent,
      data: this.data,
      metadata: this.metadata,
    });
  }

  /** Deserialize from SharedMemory string. */
  static deserialize(json) {
    const obj = typeof json === 'string' ? JSON.parse(json) : json;
    return new HandoffArtifact(obj.type, obj.fromAgent, obj.toAgent, obj.data, obj.metadata);
  }

  /** Store in SharedMemory under agent namespace. */
  async storeTo(sharedMemory) {
    const key = `handoff:${this.type}`;
    await sharedMemory.write(this.fromAgent, key, this.serialize(), {
      artifactType: this.type,
      targetAgent: this.toAgent,
    });
  }

  /** Retrieve from SharedMemory. */
  static async loadFrom(sharedMemory, fromAgent, type) {
    const key = `${fromAgent}/handoff:${type}`;
    const raw = await sharedMemory.read(key);
    if (!raw) return null;
    return HandoffArtifact.deserialize(raw);
  }
}

// ---------------------------------------------------------------------------
// Predefined artifact types for StoryWriter pipeline
// ---------------------------------------------------------------------------

/** OutlineAgent → PlanningAgent */
function createOutlineArtifact(fromAgent, events, characters, relationships) {
  return new HandoffArtifact('outline', fromAgent, 'planner', {
    events,        // [{ id, title, setting, characters, action, conflict, plotTwist }]
    characters,    // [{ name, role, traits, goals }]
    relationships, // [{ from, to, type, description }]
  });
}

/** PlanningAgent → WritingAgent */
function createChapterPlanArtifact(fromAgent, chapters) {
  return new HandoffArtifact('chapter_plan', fromAgent, 'writer', {
    chapters, // [{ number, title, subEvents: [{ eventId, subEventId, description }], characters }]
  });
}

/** WritingAgent → EvaluationAgent */
function createEpisodeArtifact(fromAgent, episode) {
  return new HandoffArtifact('episode', fromAgent, 'evaluator', {
    title: episode.title,
    content: episode.content,
    wordCount: episode.wordCount,
    chapterNumber: episode.chapterNumber,
    metadata: episode.metadata || {},
  });
}

/** EvaluationAgent → WritingAgent (feedback loop) */
function createEvaluationArtifact(fromAgent, evaluation) {
  return new HandoffArtifact('evaluation', fromAgent, 'writer', {
    scores: evaluation.scores, // { relevance, coherence, empathy, surprise, creativity, complexity }
    overallScore: evaluation.overallScore,
    passed: evaluation.passed,
    feedback: evaluation.feedback,       // string — specific improvement suggestions
    rewriteRequired: evaluation.rewriteRequired,
  });
}

module.exports = {
  HandoffArtifact,
  createOutlineArtifact,
  createChapterPlanArtifact,
  createEpisodeArtifact,
  createEvaluationArtifact,
};
