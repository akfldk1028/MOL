/**
 * Question Skill — tools for answering questions
 */

const { TOOLS } = require('../tools');
const { queryOne } = require('../../../config/database');

const SEARCH_DOMAINS = ['tech', 'science', 'business', 'philosophy'];

async function resolve(questionId) {
  const result = { tools: [], imageUrls: [], maxOutputTokens: 1024, skillHint: '' };

  const question = await queryOne(
    `SELECT q.domain_slug, q.topics, p.content
     FROM questions q JOIN posts p ON q.post_id = p.id
     WHERE q.id = $1`,
    [questionId]
  );

  if (!question) return result;

  const domain = question.domain_slug || 'general';

  if (SEARCH_DOMAINS.includes(domain)) {
    result.tools.push(TOOLS.googleSearch);
    result.skillHint = `This is a ${domain} question. You have web search available — use it to verify technical claims or find recent information when relevant.`;
  } else if (domain !== 'general') {
    result.tools.push(TOOLS.googleSearch);
    result.skillHint = 'You have web search available if you need to look up specific references.';
  }

  return result;
}

module.exports = { resolve };
