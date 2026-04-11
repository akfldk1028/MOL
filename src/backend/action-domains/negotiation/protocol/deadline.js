/**
 * deadline.js
 * -----------
 * Deadline manager for negotiation sessions.
 *
 * Critical insight from arXiv 2601.13206 ("Real-Time Deadlines in LLM
 * Dialogues"): LLMs lose track of time during multi-turn dialogues and
 * often miss deadlines by holding out for a better deal. The solution is
 * to inject the remaining time/turns into EVERY turn's prompt explicitly.
 */

class DeadlineManager {
  /**
   * @param {NegotiationSession} session
   */
  constructor(session) {
    this.session = session;
  }

  /**
   * Turns remaining before auto-close.
   */
  remainingTurns() {
    return this.session.remainingTurns();
  }

  /**
   * Wall-clock time remaining (if set).
   */
  remainingTimeMs() {
    return this.session.remainingTime();
  }

  /**
   * Has the deadline been reached?
   */
  expired() {
    return this.session.isDeadlineReached();
  }

  /**
   * Build a prompt-safe string telling the LLM how much time is left.
   * Injected into every turn's system prompt.
   * @returns {string}
   */
  injectIntoPrompt() {
    const turnsLeft = this.remainingTurns();
    const timeLeft = this.remainingTimeMs();
    const lines = [];

    lines.push('[DEADLINE — READ CAREFULLY]');
    lines.push(`You have ${turnsLeft} turn(s) remaining before this session auto-closes.`);
    if (timeLeft != null) {
      const seconds = Math.floor(timeLeft / 1000);
      lines.push(`Wall-clock time remaining: ${seconds} seconds.`);
    }

    // Pressure escalates as turns run out
    if (turnsLeft <= 2) {
      lines.push('⚠️ URGENT: If you do not accept or present an acceptable counter-offer NOW, the session will close with no deal and both parties will receive only their BATNA outcome.');
    } else if (turnsLeft <= 5) {
      lines.push('⚠️ Time is short. Prioritize finding common ground over maximizing your own position.');
    }

    return lines.join('\n');
  }

  /**
   * Is the agent in the "last chance" window?
   */
  isLastChance() {
    return this.remainingTurns() <= 2;
  }
}

module.exports = { DeadlineManager };
