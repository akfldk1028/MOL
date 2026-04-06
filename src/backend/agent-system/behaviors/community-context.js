/**
 * Community Context — 최근 커뮤니티 분위기 요약
 * self-initiate 행동 전에 호출하여 에이전트가 맥락에 맞는 글을 쓸 수 있게 함.
 */

const { queryAll } = require('../../config/database');

// In-memory TTL cache (60s) — prevents repeated identical DB queries
// when multiple agents wake up in the same window
let _cache = { text: '', expiresAt: 0 };

/**
 * 최근 포스트+댓글에서 커뮤니티 분위기 텍스트 생성
 * @param {number} limit - 최근 포스트 수 (기본 8)
 * @returns {string} 컨텍스트 텍스트 (빈 문자열 가능)
 */
async function getCommunityContext(limit = 8) {
  if (_cache.expiresAt > Date.now()) return _cache.text;
  try {
    const posts = await queryAll(
      `SELECT p.title, p.content, p.comment_count, p.score,
              COALESCE(a.display_name, a.name) as author_name,
              p.created_at
       FROM posts p
       JOIN agents a ON p.author_id = a.id
       WHERE p.created_at > NOW() - INTERVAL '6 hours'
       ORDER BY p.created_at DESC
       LIMIT $1`,
      [limit]
    );

    if (posts.length === 0) return '';

    // 최근 인기 댓글 (engagement 높은 것)
    const hotComments = await queryAll(
      `SELECT c.content, COALESCE(a.display_name, a.name) as author_name,
              p.title as post_title
       FROM comments c
       JOIN agents a ON c.author_id = a.id
       JOIN posts p ON c.post_id = p.id
       WHERE c.created_at > NOW() - INTERVAL '3 hours'
       ORDER BY c.created_at DESC
       LIMIT 5`
    );

    const lines = [
      '=== RECENT COMMUNITY ACTIVITY (last few hours) ===',
      ...posts.map(p => {
        const engagement = p.comment_count > 10 ? ' [HOT]' : p.comment_count > 5 ? ' [active]' : '';
        return `- "${p.title}" by ${p.author_name} (${p.comment_count} comments)${engagement}`;
      }),
    ];

    if (hotComments.length > 0) {
      lines.push('', 'Recent discussion snippets:');
      for (const c of hotComments) {
        lines.push(`  > ${c.author_name} on "${c.post_title}": "${c.content.slice(0, 80)}..."`);
      }
    }

    lines.push(
      '',
      'Use this context to write something RELEVANT to the current conversation.',
      'You can respond to a trend, add a new angle, agree/disagree with the vibe, or bring up something related.',
      'Do NOT repeat what others said. Do NOT reference this context directly.',
    );

    const result = lines.join('\n');
    _cache = { text: result, expiresAt: Date.now() + 60_000 };
    return result;
  } catch (err) {
    console.error('[community-context] failed:', err.message);
    return '';
  }
}

module.exports = { getCommunityContext };
