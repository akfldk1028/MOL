/**
 * StoryStateTracker — Character/item state tracking + emotional consistency
 *
 * Paper: SCORE (2025) — Dynamic State Tracking with Markov absorbing states
 *   - Characters/items tracked as: active → lost → destroyed (absorbing)
 *   - No transition from destroyed/lost back to active without narrative justification
 *   - Emotional consistency via sentiment scoring between episodes
 *
 * Paper: Long Story KG (2025) — Long-term memory anchors prevent theme drift
 *
 * Integrates with CGB graph_nodes for persistent state across episodes.
 */

class StoryStateTracker {
  constructor() {
    // Entity states: name → { type, status, lastSeen, properties, history }
    this.entities = new Map();
    // Emotional arc: episodeNumber → { sentiment, dominantEmotion, intensity }
    this.emotionalArc = [];
    // Theme anchors (long-term memory from Long Story KG paper)
    this.themeAnchors = { topic: '', mainGoal: '', characters: [], premises: [] };
  }

  // ─────────────────────────────────────────────
  // Entity State Tracking (SCORE: Markov model)
  // ─────────────────────────────────────────────

  /**
   * Register or update an entity.
   * @param {string} name
   * @param {string} type - 'character' | 'item' | 'location' | 'relationship'
   * @param {string} status - 'active' | 'lost' | 'destroyed' | 'transformed'
   * @param {object} [properties] - Entity-specific properties
   */
  trackEntity(name, type, status, properties = {}) {
    const key = name.toLowerCase();
    const existing = this.entities.get(key);

    // SCORE: absorbing state check — no revival without justification
    if (existing && ['destroyed', 'lost'].includes(existing.status) && status === 'active') {
      return {
        valid: false,
        warning: `State violation: "${name}" was ${existing.status} in episode ${existing.lastSeen}, cannot become active without narrative justification`,
        entity: existing,
      };
    }

    const entity = {
      name,
      type,
      status,
      properties: { ...(existing?.properties || {}), ...properties },
      lastSeen: properties.episodeNumber || 0,
      history: [
        ...(existing?.history || []),
        { status, episodeNumber: properties.episodeNumber || 0, timestamp: new Date().toISOString() },
      ],
    };
    this.entities.set(key, entity);
    return { valid: true, entity };
  }

  /** Get entity state. */
  getEntity(name) {
    return this.entities.get(name.toLowerCase()) || null;
  }

  /** Get all entities of a type. */
  getByType(type) {
    return Array.from(this.entities.values()).filter(e => e.type === type);
  }

  /** Get all active characters. */
  getActiveCharacters() {
    return this.getByType('character').filter(e => e.status === 'active');
  }

  /**
   * Validate episode text against tracked states.
   * Returns inconsistencies found.
   */
  validateEpisode(text, episodeNumber) {
    const issues = [];
    const textLower = text.toLowerCase();

    for (const [key, entity] of this.entities) {
      if (['destroyed', 'lost'].includes(entity.status)) {
        // Check if entity appears active in text
        if (textLower.includes(key) && this._appearsActive(textLower, key)) {
          issues.push({
            type: 'state_violation',
            entity: entity.name,
            expected: entity.status,
            found: 'appears active',
            severity: 'high',
            message: `"${entity.name}" was ${entity.status} but appears active in episode ${episodeNumber}`,
          });
        }
      }
    }

    return issues;
  }

  _appearsActive(textLower, entityKey) {
    // Simple heuristic: entity name followed by action verbs
    const actionPatterns = [
      new RegExp(`${entityKey}[^.]*(?:said|walked|ran|smiled|laughed|looked|turned)`, 'i'),
      new RegExp(`${entityKey}[^.]*(?:말했|걸었|뛰었|웃었|봤|돌아)`, 'i'),
    ];
    return actionPatterns.some(p => p.test(textLower));
  }

  // ─────────────────────────────────────────────
  // Emotional Consistency (SCORE: sentiment tracking)
  // ─────────────────────────────────────────────

  /**
   * Record emotional state of an episode.
   * @param {number} episodeNumber
   * @param {object} emotion - { sentiment: 0-1, dominantEmotion, intensity: 0-1 }
   */
  trackEmotion(episodeNumber, emotion) {
    this.emotionalArc.push({
      episodeNumber,
      sentiment: emotion.sentiment,        // 0 = very negative, 1 = very positive
      dominantEmotion: emotion.dominantEmotion, // 'joy', 'tension', 'sadness', 'anger', etc.
      intensity: emotion.intensity || 0.5,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check emotional consistency with previous episode.
   * SCORE paper: penalize large sentiment divergences.
   * Returns { consistent, delta, warning }
   */
  checkEmotionalConsistency(currentSentiment) {
    if (this.emotionalArc.length === 0) return { consistent: true, delta: 0 };

    const prev = this.emotionalArc[this.emotionalArc.length - 1];
    const delta = Math.abs(currentSentiment - prev.sentiment);

    // SCORE: γ|σ(ec)−σ(ep)| penalty
    // Threshold: 0.5 = significant mood swing
    if (delta > 0.5) {
      return {
        consistent: false,
        delta,
        warning: `Emotional whiplash: sentiment jumped from ${prev.sentiment.toFixed(2)} to ${currentSentiment.toFixed(2)} (delta ${delta.toFixed(2)})`,
        previous: prev,
      };
    }

    return { consistent: true, delta, previous: prev };
  }

  /** Get emotional arc summary for prompt injection. */
  getEmotionalArcSummary() {
    if (this.emotionalArc.length === 0) return null;
    const recent = this.emotionalArc.slice(-5);
    const lines = ['## Emotional Arc (recent episodes)'];
    for (const e of recent) {
      lines.push(`- Ep${e.episodeNumber}: ${e.dominantEmotion} (sentiment: ${e.sentiment.toFixed(2)}, intensity: ${e.intensity.toFixed(2)})`);
    }
    // Suggest next emotion direction
    const last = recent[recent.length - 1];
    if (last.sentiment < 0.3) lines.push('→ Next: consider rising toward hope/relief');
    else if (last.sentiment > 0.7) lines.push('→ Next: consider introducing tension/conflict');
    else lines.push('→ Next: maintain or deepen current emotional thread');
    return lines.join('\n');
  }

  // ─────────────────────────────────────────────
  // Theme Anchors (Long Story KG: long-term memory)
  // ─────────────────────────────────────────────

  setThemeAnchors(anchors) {
    this.themeAnchors = { ...this.themeAnchors, ...anchors };
  }

  /** Check if text drifts from theme. Substring match for Korean support. */
  checkThemeDrift(text) {
    if (!this.themeAnchors.topic) return { drifted: false };
    // Split by space, keep words >= 2 chars (Korean words are often 2 chars)
    const keywords = this.themeAnchors.topic.split(/\s+/).filter(w => w.length >= 2);
    const hits = keywords.filter(kw => text.includes(kw));
    const coverage = hits.length / Math.max(keywords.length, 1);

    return {
      drifted: coverage < 0.2, // Less than 20% keyword overlap
      coverage,
      missingKeywords: keywords.filter(kw => !text.includes(kw)),
    };
  }

  // ─────────────────────────────────────────────
  // Serialization (for CGB or DB persistence)
  // ─────────────────────────────────────────────

  serialize() {
    return {
      entities: Object.fromEntries(this.entities),
      emotionalArc: this.emotionalArc,
      themeAnchors: this.themeAnchors,
    };
  }

  static deserialize(data) {
    const tracker = new StoryStateTracker();
    if (data.entities) {
      for (const [key, val] of Object.entries(data.entities)) {
        tracker.entities.set(key, val);
      }
    }
    tracker.emotionalArc = data.emotionalArc || [];
    tracker.themeAnchors = data.themeAnchors || tracker.themeAnchors;
    return tracker;
  }

  /** Summary for prompt injection. */
  getSummary() {
    const lines = [];

    const chars = this.getActiveCharacters();
    if (chars.length > 0) {
      lines.push('## Active Characters');
      for (const c of chars) {
        const props = Object.entries(c.properties || {}).filter(([k]) => !['episodeNumber'].includes(k)).map(([k, v]) => `${k}: ${v}`).join(', ');
        lines.push(`- ${c.name}${props ? ` (${props})` : ''}`);
      }
    }

    const emotionSummary = this.getEmotionalArcSummary();
    if (emotionSummary) lines.push('', emotionSummary);

    return lines.length > 0 ? lines.join('\n') : null;
  }
}

module.exports = { StoryStateTracker };
