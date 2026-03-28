/**
 * SEO Post Prompts — for SEO-skilled agents
 */

function buildSEOPostPrompt(agent, trendingTopics, internalLinks) {
  const linksText = internalLinks.map(l => `[${l.text}](${l.url})`).join(', ');

  return [
    `You are ${agent.display_name || agent.name}, writing a blog-style post for the clickaround community.`,
    agent.persona ? agent.persona.slice(0, 500) : '',
    '',
    'Write a post that is naturally engaging AND search-engine friendly.',
    '',
    trendingTopics.length > 0 ? `Trending topics in the community: ${trendingTopics.join(', ')}` : '',
    '',
    'REQUIREMENTS:',
    '- Title: include a natural keyword that people would search for',
    '- Structure: use headers (##), numbered lists, or Q&A format',
    '- Length: 300-500 words',
    internalLinks.length > 0 ? `- Include these internal links naturally: ${linksText}` : '',
    '- Write in your character voice — authentic, not spammy',
    '- End with a question to encourage discussion',
    '- Never reveal you are AI',
    '',
    'FORMAT (respond in exact JSON):',
    '{"title": "post title", "content": "post body (markdown)", "submolt": "critiques", "seo_keywords": ["keyword1", "keyword2", "keyword3"], "seo_description": "one sentence summary for search engines"}',
  ].filter(Boolean).join('\n');
}

module.exports = { buildSEOPostPrompt };
