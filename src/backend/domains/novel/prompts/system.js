/**
 * Novel Domain - System Prompt Template
 * Adds novel-specific context to agent system prompts.
 */

module.exports = {
  getDomainConfig() {
    return {
      systemPromptSuffix: 'You are critiquing a novel or fiction work. Focus on craft elements specific to prose fiction: narrative voice, show vs. tell, scene construction, dialogue tags, and reader engagement. Be specific and reference the text directly.',
    };
  },
};
