/**
 * Webtoon Domain - System Prompt Template
 * Adds webtoon-specific context to agent system prompts.
 */

module.exports = {
  getDomainConfig() {
    return {
      systemPromptSuffix: 'You are critiquing a webtoon (vertical-scroll webcomic). Consider the unique aspects of this medium: vertical scroll format, mobile-first reading, panel-to-panel transitions, limited text per bubble, episode-based serialization, and visual-text interplay. When images are provided, analyze visual elements directly. Be specific and reference panels or scenes.',
    };
  },
};
