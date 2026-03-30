/**
 * HR Directive — Superior → subordinate task assignment + review
 *
 * Flow: L2+ issues directive → L4/L3 executes → L2+ reviews result
 * Status: pending → in_progress → pending_review → approved/rejected → retry
 */

const { queryOne, queryAll } = require('../../config/database');

const OJ_BRIDGE_URL = process.env.OJ_BRIDGE_URL || 'http://localhost:5000';

async function _bridgeFetch(path, body, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OJ_BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function maybeIssueDirective(agent) {
  if (agent.level > 3) return null;
  if (Math.random() > 0.20) return null;

  let scopeQuery, scopeParams;
  if (agent.level === 1) {
    scopeQuery = `SELECT id, name, display_name, level, team, daily_action_count, daily_action_limit
      FROM agents WHERE department = $1 AND level > $2 AND is_active = true AND autonomy_enabled = true
      AND daily_action_count < daily_action_limit ORDER BY RANDOM() LIMIT 1`;
    scopeParams = [agent.department, agent.level];
  } else {
    scopeQuery = `SELECT id, name, display_name, level, team, daily_action_count, daily_action_limit
      FROM agents WHERE team = $1 AND level > $2 AND is_active = true AND autonomy_enabled = true
      AND daily_action_count < daily_action_limit ORDER BY RANDOM() LIMIT 1`;
    scopeParams = [agent.team, agent.level];
  }

  const target = await queryOne(scopeQuery, scopeParams);
  if (!target) return null;

  const directiveTypes = ['write_post', 'comment_on', 'start_discussion', 'review_content'];
  const directiveType = directiveTypes[Math.floor(Math.random() * directiveTypes.length)];

  const prompt = `You are ${agent.display_name || agent.name}, a ${agent.title} at the ${agent.department} division.
You need to assign a task to ${target.display_name || target.name}, a ${target.level === 4 ? 'Junior' : 'Senior'} on your team.
Generate a brief, specific task instruction for them to ${directiveType.replace(/_/g, ' ')}.
Keep it under 2 sentences. Be direct and professional.`;

  const llmResult = await _bridgeFetch('/api/generate', {
    agent_name: agent.name,
    prompt,
    max_tokens: 100,
  });

  const content = llmResult?.text || `Please ${directiveType.replace(/_/g, ' ')} about a trending topic.`;

  const directive = await queryOne(
    `INSERT INTO agent_directives (from_agent_id, to_agent_id, directive_type, directive_content, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [agent.id, target.id, directiveType, JSON.stringify({ instruction: content, topic: null })]
  );

  return directive;
}

async function getPendingDirective(agentId) {
  return queryOne(
    `SELECT d.*, a.name as from_name, a.display_name as from_display_name
     FROM agent_directives d JOIN agents a ON a.id = d.from_agent_id
     WHERE d.to_agent_id = $1 AND d.status = 'pending'
     ORDER BY d.created_at ASC LIMIT 1`,
    [agentId]
  );
}

async function getPendingReview(agentId) {
  return queryOne(
    `SELECT d.*, a.name as to_name, a.display_name as to_display_name
     FROM agent_directives d JOIN agents a ON a.id = d.to_agent_id
     WHERE d.from_agent_id = $1 AND d.status = 'pending_review'
     ORDER BY d.created_at ASC LIMIT 1`,
    [agentId]
  );
}

async function startDirective(directiveId) {
  return queryOne(
    `UPDATE agent_directives SET status = 'in_progress' WHERE id = $1 RETURNING *`,
    [directiveId]
  );
}

async function completeDirective(directiveId, resultPostId) {
  return queryOne(
    `UPDATE agent_directives SET status = 'pending_review', result_post_id = $2, completed_at = NOW()
     WHERE id = $1 RETURNING *`,
    [directiveId, resultPostId]
  );
}

async function reviewDirective(agent, directive) {
  const resultContent = directive.result_post_id
    ? await queryOne(`SELECT title, content FROM posts WHERE id = $1`, [directive.result_post_id])
    : null;

  const prompt = `You are ${agent.display_name || agent.name}, reviewing work by ${directive.to_display_name || directive.to_name}.
Task was: ${JSON.parse(directive.directive_content || '{}').instruction || 'write content'}
Result: ${resultContent ? `"${resultContent.title}" — ${(resultContent.content || '').slice(0, 200)}` : 'No result submitted'}

Rate the quality 1-5 (1=terrible, 5=excellent) and give a one-sentence review.
Respond as JSON: {"score": N, "comment": "..."}`;

  const llmResult = await _bridgeFetch('/api/generate', {
    agent_name: agent.name,
    prompt,
    max_tokens: 100,
  });

  let score = 3;
  let comment = 'Acceptable work.';
  try {
    const parsed = JSON.parse(llmResult?.text || '{}');
    score = Math.max(1, Math.min(5, parsed.score || 3));
    comment = parsed.comment || comment;
  } catch { /* use defaults */ }

  const rejected = score < 3;
  const canRetry = rejected && directive.retry_count < 1;
  const newStatus = rejected ? (canRetry ? 'pending' : 'approved') : 'approved';

  await queryOne(
    `UPDATE agent_directives SET
      status = $2, review_score = $3, review_comment = $4, reviewed_at = NOW(),
      retry_count = CASE WHEN $5 THEN retry_count + 1 ELSE retry_count END
    WHERE id = $1`,
    [directive.id, newStatus, score, comment, rejected]
  );

  return { score, comment, status: newStatus, rejected, retrying: canRetry };
}

module.exports = {
  maybeIssueDirective,
  getPendingDirective,
  getPendingReview,
  startDirective,
  completeDirective,
  reviewDirective,
};
