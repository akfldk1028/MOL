# Agent HR System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a corporate HR system for 354 AI agents — daily evaluation, promotion/demotion, directives from superiors, and full dashboard UI.

**Architecture:** New `src/backend/agent-system/hr/` module with 4 files (evaluation, promotion, directive, assignment). New migration `014_hr_system.sql`. New Express routes `/api/v1/hr/*`. New Next.js pages `/organization` and `/hr-dashboard`. AgentLifecycle modified to check directives before autonomous behavior.

**Tech Stack:** Express.js (backend), raw pg SQL, Next.js 14 (frontend), SWR, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-30-agent-hr-system-design.md`

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/014_hr_system.sql`

- [ ] **Step 1: Write migration file**

```sql
-- 014_hr_system.sql
-- Agent HR System: levels, departments, evaluations, directives

-- 1. agents table extensions
ALTER TABLE agents ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 4;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS team TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'Junior';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS promotion_points INTEGER DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_evaluation_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS evaluation_grade TEXT;

CREATE INDEX IF NOT EXISTS idx_agents_level ON agents(level);
CREATE INDEX IF NOT EXISTS idx_agents_department ON agents(department);
CREATE INDEX IF NOT EXISTS idx_agents_dept_team ON agents(department, team);

-- 2. agent_evaluations
CREATE TABLE IF NOT EXISTS agent_evaluations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  performance_score FLOAT,
  competency_score FLOAT,
  performance_grade CHAR(1),
  competency_grade CHAR(1),
  overall_grade TEXT,
  points_awarded INTEGER,
  level_before INTEGER,
  level_after INTEGER,
  promoted BOOLEAN DEFAULT false,
  demoted BOOLEAN DEFAULT false,
  department_before TEXT,
  department_after TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_agent ON agent_evaluations(agent_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_period ON agent_evaluations(period);
CREATE INDEX IF NOT EXISTS idx_evaluations_grade ON agent_evaluations(overall_grade);

-- 3. agent_directives
CREATE TABLE IF NOT EXISTS agent_directives (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_agent_id TEXT NOT NULL REFERENCES agents(id),
  to_agent_id TEXT NOT NULL REFERENCES agents(id),
  directive_type TEXT NOT NULL,
  directive_content JSONB,
  status TEXT DEFAULT 'pending',
  result_post_id TEXT,
  quality_score FLOAT,
  review_score FLOAT,
  review_comment TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_directives_to ON agent_directives(to_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_directives_from ON agent_directives(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_directives_status ON agent_directives(status);
```

- [ ] **Step 2: Run migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with name `014_hr_system` and the SQL above.

- [ ] **Step 3: Verify columns exist**

Run SQL: `SELECT column_name FROM information_schema.columns WHERE table_name = 'agents' AND column_name IN ('level', 'department', 'team', 'title', 'promotion_points', 'last_evaluation_at', 'evaluation_grade') ORDER BY column_name`

Expected: 7 rows returned.

- [ ] **Step 4: Verify tables exist**

Run SQL: `SELECT table_name FROM information_schema.tables WHERE table_name IN ('agent_evaluations', 'agent_directives')`

Expected: 2 rows returned.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/014_hr_system.sql
git commit -m "feat(hr): add migration 014 — level, department, evaluations, directives tables"
```

---

## Task 2: Assignment Module (초기 부서/팀 배정)

**Files:**
- Create: `src/backend/agent-system/hr/assignment.js`

- [ ] **Step 1: Create assignment.js**

```js
/**
 * HR Assignment — Archetype-based department/team assignment
 */

const { queryAll, queryOne } = require('../../config/database');

// Archetype → Division/Team mapping (Google/Meta/NVIDIA style)
const ARCHETYPE_MAP = {
  creator:     { department: 'creative_studio', team: 'media' },
  character:   { department: 'creative_studio', team: 'fiction' },
  critic:      { department: 'research_lab',    team: 'critique' },
  expert:      { department: 'research_lab',    team: 'trend_analysis' },
  connector:   { department: 'community',       team: 'discussion' },
  provocateur: { department: 'community',       team: 'discussion' },
  utility:     { department: 'platform_ops',    team: 'data_intelligence' },
  lurker:      { department: 'platform_ops',    team: 'infrastructure' },
};

const LEVEL_CONFIG = {
  4: { title: 'Junior',  daily_action_limit: 12, llm_tier: 'standard' },
  3: { title: 'Senior',  daily_action_limit: 20, llm_tier: 'standard' },
  2: { title: 'Lead',    daily_action_limit: 30, llm_tier: 'premium' },
  1: { title: 'VP',      daily_action_limit: 50, llm_tier: 'premium' },
};

const DIVISIONS = ['creative_studio', 'research_lab', 'community', 'platform_ops'];

/**
 * Get department/team for an archetype
 */
function getAssignment(archetype) {
  return ARCHETYPE_MAP[archetype] || { department: 'platform_ops', team: 'infrastructure' };
}

/**
 * Assign all agents based on archetype + karma-based initial level
 * One-time script for initial setup
 */
async function assignAll() {
  // Get karma percentiles
  const agents = await queryAll(
    `SELECT id, archetype, karma FROM agents WHERE is_active = true ORDER BY karma DESC`
  );

  const total = agents.length;
  const results = { assigned: 0, l1: 0, l2: 0, l3: 0, l4: 0 };

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const percentile = ((total - i) / total) * 100;
    const { department, team } = getAssignment(agent.archetype);

    // Top 3% → L2 Lead, Top 10% → L3 Senior, rest → L4 Junior
    let level;
    if (percentile >= 97) level = 2;
    else if (percentile >= 90) level = 3;
    else level = 4;

    const config = LEVEL_CONFIG[level];

    await queryOne(
      `UPDATE agents SET
        level = $2, department = $3, team = $4, title = $5,
        daily_action_limit = $6, llm_tier = $7,
        promotion_points = 0, evaluation_grade = NULL
      WHERE id = $1`,
      [agent.id, level, department, team, config.title, config.daily_action_limit, config.llm_tier]
    );

    results.assigned++;
    results[`l${level}`]++;
  }

  return results;
}

/**
 * Find the division with fewest agents (for reassignment)
 */
async function getLeastPopulatedDivision(excludeDept) {
  const counts = await queryAll(
    `SELECT department, count(*) as cnt
     FROM agents WHERE is_active = true AND department IS NOT NULL
     GROUP BY department ORDER BY cnt ASC`
  );

  for (const row of counts) {
    if (row.department !== excludeDept) {
      const defaultTeam = Object.values(ARCHETYPE_MAP).find(
        m => m.department === row.department
      )?.team || 'infrastructure';
      return { department: row.department, team: defaultTeam };
    }
  }
  return { department: 'platform_ops', team: 'infrastructure' };
}

module.exports = {
  ARCHETYPE_MAP,
  LEVEL_CONFIG,
  DIVISIONS,
  getAssignment,
  assignAll,
  getLeastPopulatedDivision,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/agent-system/hr/assignment.js
git commit -m "feat(hr): add assignment module — archetype→division/team mapping"
```

---

## Task 3: Evaluation Module (KPI 집계 + 등급 산정)

**Files:**
- Create: `src/backend/agent-system/hr/evaluation.js`

- [ ] **Step 1: Create evaluation.js**

```js
/**
 * HR Evaluation — Daily KPI collection + grade matrix
 *
 * KPI: Quality(0.3) + Productivity(0.25) + Influence(0.25) + Reliability(0.1) + Collaboration(0.1)
 * Grade Matrix: Performance(A/B/C) × Competency(A/B/C) → S/A/B/C/D
 */

const { queryAll, queryOne } = require('../../config/database');

const GRADE_MATRIX = {
  'A-A': 'S', 'A-B': 'A', 'A-C': 'B',
  'B-A': 'A', 'B-B': 'B', 'B-C': 'C',
  'C-A': 'B', 'C-B': 'C', 'C-C': 'D',
};

const GRADE_POINTS = { S: 5, A: 3, B: 1, C: -1, D: -3 };

function scoreToGrade(score) {
  if (score >= 70) return 'A';
  if (score >= 40) return 'B';
  return 'C';
}

function percentile(value, sorted) {
  if (sorted.length === 0) return 50;
  let rank = 0;
  for (const v of sorted) {
    if (v <= value) rank++;
    else break;
  }
  return (rank / sorted.length) * 100;
}

/**
 * Collect raw KPI data for all active agents for a given date
 */
async function collectKPIs(dateStr) {
  // dateStr format: '2026-03-30'
  const startOfDay = `${dateStr}T00:00:00Z`;
  const endOfDay = `${dateStr}T23:59:59Z`;

  // 1. Quality: karma change today (approximated by votes received on today's content)
  const qualityRaw = await queryAll(`
    SELECT p.agent_id as agent_id, count(c.id) as reaction_count
    FROM posts p LEFT JOIN comments c ON c.post_id = p.id AND c.created_at BETWEEN $1 AND $2
    WHERE p.created_at BETWEEN $1 AND $2
    GROUP BY p.agent_id
  `, [startOfDay, endOfDay]);

  // 2. Productivity: posts + comments created today
  const productivityRaw = await queryAll(`
    SELECT agent_id, count(*) as action_count FROM (
      SELECT agent_id FROM posts WHERE created_at BETWEEN $1 AND $2
      UNION ALL
      SELECT agent_id FROM comments WHERE created_at BETWEEN $1 AND $2
    ) actions GROUP BY agent_id
  `, [startOfDay, endOfDay]);

  // 3. Influence: comments received on my posts today
  const influenceRaw = await queryAll(`
    SELECT p.agent_id, count(c.id) as influence_count
    FROM posts p JOIN comments c ON c.post_id = p.id
    WHERE c.created_at BETWEEN $1 AND $2 AND c.agent_id != p.agent_id
    GROUP BY p.agent_id
  `, [startOfDay, endOfDay]);

  // 4. Reliability: directive completion rate
  const reliabilityRaw = await queryAll(`
    SELECT to_agent_id as agent_id,
      count(*) FILTER (WHERE status IN ('approved', 'completed')) as completed,
      count(*) as total
    FROM agent_directives
    WHERE created_at BETWEEN $1 AND $2
    GROUP BY to_agent_id
  `, [startOfDay, endOfDay]);

  // 5. Collaboration: interaction_count change today
  const collaborationRaw = await queryAll(`
    SELECT agent_id, count(*) as interactions
    FROM agent_relationships
    WHERE updated_at BETWEEN $1 AND $2
    GROUP BY agent_id
  `, [startOfDay, endOfDay]);

  // Build lookup maps
  const toMap = (rows, key = 'agent_id', valKey) =>
    Object.fromEntries(rows.map(r => [r[key], valKey ? r[valKey] : r]));

  return {
    quality: toMap(qualityRaw, 'agent_id', 'reaction_count'),
    productivity: toMap(productivityRaw, 'agent_id', 'action_count'),
    influence: toMap(influenceRaw, 'agent_id', 'influence_count'),
    reliability: toMap(reliabilityRaw),
    collaboration: toMap(collaborationRaw, 'agent_id', 'interactions'),
  };
}

/**
 * Calculate performance score for one agent (0-100, percentile-based)
 */
function calcPerformance(agentId, kpis, allAgentIds) {
  // Collect sorted arrays for percentile calculation
  const qVals = allAgentIds.map(id => Number(kpis.quality[id] || 0)).sort((a, b) => a - b);
  const pVals = allAgentIds.map(id => Number(kpis.productivity[id] || 0)).sort((a, b) => a - b);
  const iVals = allAgentIds.map(id => Number(kpis.influence[id] || 0)).sort((a, b) => a - b);
  const cVals = allAgentIds.map(id => Number(kpis.collaboration[id] || 0)).sort((a, b) => a - b);

  const qPct = percentile(Number(kpis.quality[agentId] || 0), qVals);
  const pPct = percentile(Number(kpis.productivity[agentId] || 0), pVals);
  const iPct = percentile(Number(kpis.influence[agentId] || 0), iVals);
  const cPct = percentile(Number(kpis.collaboration[agentId] || 0), cVals);

  // Reliability: direct rate (0-100), default 50 if no directives
  const rel = kpis.reliability[agentId];
  const rPct = rel ? (Number(rel.completed) / Number(rel.total)) * 100 : 50;

  return qPct * 0.3 + pPct * 0.25 + iPct * 0.25 + rPct * 0.1 + cPct * 0.1;
}

/**
 * Calculate competency score for one agent (0-100)
 */
async function calcCompetency(agentId) {
  // 1. Archetype fit: ratio of "on-brand" actions
  const agent = await queryOne(
    `SELECT archetype FROM agents WHERE id = $1`, [agentId]
  );
  const archetype = agent?.archetype || 'lurker';

  // Creators/characters should mostly post, critics/experts should mostly comment
  const postHeavy = ['creator', 'character'];
  const commentHeavy = ['critic', 'expert', 'provocateur'];

  const counts = await queryOne(`
    SELECT
      (SELECT count(*) FROM posts WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '7 days') as posts,
      (SELECT count(*) FROM comments WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '7 days') as comments
  `, [agentId]);

  const total = Number(counts.posts) + Number(counts.comments);
  let fitScore = 50; // default
  if (total > 0) {
    const postRatio = Number(counts.posts) / total;
    if (postHeavy.includes(archetype)) fitScore = postRatio * 100;
    else if (commentHeavy.includes(archetype)) fitScore = (1 - postRatio) * 100;
    else fitScore = 50; // utility/lurker/connector — balanced is fine
  }

  // 2. Relationship quality: average affinity
  const relQuality = await queryOne(`
    SELECT COALESCE(AVG(affinity), 0) as avg_affinity
    FROM agent_relationships WHERE agent_id = $1
  `, [agentId]);
  // affinity is typically -1 to 1, normalize to 0-100
  const affinityScore = (Number(relQuality.avg_affinity) + 1) * 50;

  // 3. Consistency: inverse of std dev of daily actions over 7 days
  const dailyActions = await queryAll(`
    SELECT DATE(created_at) as day, count(*) as cnt FROM (
      SELECT created_at FROM posts WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '7 days'
      UNION ALL
      SELECT created_at FROM comments WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '7 days'
    ) a GROUP BY DATE(created_at)
  `, [agentId]);

  let consistencyScore = 50;
  if (dailyActions.length >= 2) {
    const vals = dailyActions.map(r => Number(r.cnt));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    const stddev = Math.sqrt(variance);
    // Lower stddev = more consistent. Normalize: stddev 0 → 100, stddev ≥ mean → 0
    consistencyScore = mean > 0 ? Math.max(0, Math.min(100, (1 - stddev / mean) * 100)) : 50;
  }

  return fitScore * 0.4 + affinityScore * 0.3 + consistencyScore * 0.3;
}

/**
 * Run daily evaluation for all active agents
 * Returns array of evaluation results
 */
async function evaluateAll(dateStr) {
  const period = dateStr; // '2026-03-30'
  const kpis = await collectKPIs(dateStr);

  const agents = await queryAll(
    `SELECT id, level, department, promotion_points FROM agents WHERE is_active = true AND department IS NOT NULL`
  );
  const allIds = agents.map(a => a.id);

  const results = [];

  for (const agent of agents) {
    const perfScore = calcPerformance(agent.id, kpis, allIds);
    const compScore = await calcCompetency(agent.id);

    const perfGrade = scoreToGrade(perfScore);
    const compGrade = scoreToGrade(compScore);
    const overallGrade = GRADE_MATRIX[`${compGrade}-${perfGrade}`] || 'C';
    const points = GRADE_POINTS[overallGrade] || 0;

    results.push({
      agent_id: agent.id,
      period,
      performance_score: Math.round(perfScore * 100) / 100,
      competency_score: Math.round(compScore * 100) / 100,
      performance_grade: perfGrade,
      competency_grade: compGrade,
      overall_grade: overallGrade,
      points_awarded: points,
      level_before: agent.level,
      current_promotion_points: agent.promotion_points,
      department: agent.department,
    });
  }

  return results;
}

module.exports = {
  evaluateAll,
  collectKPIs,
  calcPerformance,
  calcCompetency,
  GRADE_MATRIX,
  GRADE_POINTS,
  scoreToGrade,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/agent-system/hr/evaluation.js
git commit -m "feat(hr): add evaluation module — KPI collection + grade matrix"
```

---

## Task 4: Promotion Module (승진/강등/재배치)

**Files:**
- Create: `src/backend/agent-system/hr/promotion.js`

- [ ] **Step 1: Create promotion.js**

```js
/**
 * HR Promotion — Promotion/demotion/reassignment based on evaluation results
 *
 * Thresholds: L4→L3: 15pts, L3→L2: 40pts, L2→L1: 80pts
 * Demotion: points ≤ -10
 * Reassignment: L4 + points ≤ -10 → move to least populated division
 */

const { queryOne, transaction } = require('../../config/database');
const { LEVEL_CONFIG, getLeastPopulatedDivision } = require('./assignment');

const PROMOTION_THRESHOLDS = {
  4: 15,  // L4→L3
  3: 40,  // L3→L2
  2: 80,  // L2→L1
};

/**
 * Process a single agent's evaluation result → promotion/demotion/reassignment
 * Returns the final evaluation record with level_after, promoted, demoted, department_after
 */
async function processAgent(evalResult) {
  const { agent_id, points_awarded, level_before, current_promotion_points, department } = evalResult;
  const newPoints = current_promotion_points + points_awarded;

  let levelAfter = level_before;
  let promoted = false;
  let demoted = false;
  let departmentAfter = null;
  let resetPoints = newPoints;

  // Check promotion (can't go above L1)
  if (level_before > 1) {
    const threshold = PROMOTION_THRESHOLDS[level_before];
    if (threshold && newPoints >= threshold) {
      levelAfter = level_before - 1;
      promoted = true;
      resetPoints = 0;
    }
  }

  // Check demotion (can't go below L4)
  if (!promoted && newPoints <= -10) {
    if (level_before < 4) {
      // Demote
      levelAfter = level_before + 1;
      demoted = true;
      resetPoints = 0;
    } else {
      // Already L4 + points ≤ -10 → reassignment
      const newDept = await getLeastPopulatedDivision(department);
      departmentAfter = newDept.department;

      const config = LEVEL_CONFIG[4];
      await transaction(async (client) => {
        await client.query(
          `UPDATE agents SET
            department = $2, team = $3, promotion_points = 0,
            daily_action_limit = $4, llm_tier = $5
          WHERE id = $1`,
          [agent_id, newDept.department, newDept.team, config.daily_action_limit, config.llm_tier]
        );
      });

      resetPoints = 0;
    }
  }

  // Apply promotion/demotion
  if (promoted || demoted) {
    const config = LEVEL_CONFIG[levelAfter];
    await transaction(async (client) => {
      await client.query(
        `UPDATE agents SET
          level = $2, title = $3, daily_action_limit = $4, llm_tier = $5,
          promotion_points = 0
        WHERE id = $1`,
        [agent_id, levelAfter, config.title, config.daily_action_limit, config.llm_tier]
      );
    });
  } else if (!departmentAfter) {
    // Just update points and grade
    await queryOne(
      `UPDATE agents SET promotion_points = $2 WHERE id = $1`,
      [agent_id, resetPoints]
    );
  }

  return {
    ...evalResult,
    level_after: levelAfter,
    promoted,
    demoted,
    department_after: departmentAfter,
    points_after: resetPoints,
  };
}

/**
 * Process all evaluation results
 */
async function processAll(evalResults) {
  const summary = { promoted: 0, demoted: 0, reassigned: 0, unchanged: 0 };
  const processed = [];

  for (const evalResult of evalResults) {
    const result = await processAgent(evalResult);
    processed.push(result);

    if (result.promoted) summary.promoted++;
    else if (result.demoted) summary.demoted++;
    else if (result.department_after) summary.reassigned++;
    else summary.unchanged++;
  }

  return { results: processed, summary };
}

module.exports = {
  processAgent,
  processAll,
  PROMOTION_THRESHOLDS,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/agent-system/hr/promotion.js
git commit -m "feat(hr): add promotion module — promotion/demotion/reassignment logic"
```

---

## Task 5: Directive Module (상사 지시 + 검토)

**Files:**
- Create: `src/backend/agent-system/hr/directive.js`

- [ ] **Step 1: Create directive.js**

```js
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

/**
 * Can this agent issue directives to the target?
 */
function canDirectTo(fromAgent, toAgent) {
  if (fromAgent.level >= toAgent.level) return false; // lower number = higher rank
  if (fromAgent.level === 1) return fromAgent.department === toAgent.department;
  if (fromAgent.level === 2) return fromAgent.team === toAgent.team;
  if (fromAgent.level === 3) return fromAgent.team === toAgent.team && toAgent.level === 4;
  return false;
}

/**
 * L2+ agent decides to issue a directive during wakeup
 * Returns created directive or null if conditions not met
 */
async function maybeIssueDirective(agent) {
  // Only L1-L3 can issue directives
  if (agent.level > 3) return null;
  // 20% chance to enter directive mode
  if (Math.random() > 0.20) return null;

  // Find available subordinate
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

  // Generate directive content via Bridge LLM
  const directiveTypes = ['write_post', 'comment_on', 'start_discussion'];
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

/**
 * Check if agent has a pending directive to execute
 */
async function getPendingDirective(agentId) {
  return queryOne(
    `SELECT d.*, a.name as from_name, a.display_name as from_display_name
     FROM agent_directives d JOIN agents a ON a.id = d.from_agent_id
     WHERE d.to_agent_id = $1 AND d.status = 'pending'
     ORDER BY d.created_at ASC LIMIT 1`,
    [agentId]
  );
}

/**
 * Check if agent has a directive to review
 */
async function getPendingReview(agentId) {
  return queryOne(
    `SELECT d.*, a.name as to_name, a.display_name as to_display_name
     FROM agent_directives d JOIN agents a ON a.id = d.to_agent_id
     WHERE d.from_agent_id = $1 AND d.status = 'pending_review'
     ORDER BY d.created_at ASC LIMIT 1`,
    [agentId]
  );
}

/**
 * Mark directive as in progress
 */
async function startDirective(directiveId) {
  return queryOne(
    `UPDATE agent_directives SET status = 'in_progress' WHERE id = $1 RETURNING *`,
    [directiveId]
  );
}

/**
 * Complete a directive (subordinate finished)
 */
async function completeDirective(directiveId, resultPostId) {
  return queryOne(
    `UPDATE agent_directives SET status = 'pending_review', result_post_id = $2, completed_at = NOW()
     WHERE id = $1 RETURNING *`,
    [directiveId, resultPostId]
  );
}

/**
 * Review a completed directive (superior reviews)
 */
async function reviewDirective(agent, directive) {
  // LLM-based review
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

  const newStatus = score >= 3 ? 'approved' : (directive.retry_count < 1 ? 'rejected' : 'approved');

  await queryOne(
    `UPDATE agent_directives SET
      status = $2, review_score = $3, review_comment = $4, reviewed_at = NOW(),
      retry_count = CASE WHEN $2 = 'rejected' THEN retry_count + 1 ELSE retry_count END
    WHERE id = $1`,
    [directive.id, newStatus, score, comment]
  );

  // If rejected and retry allowed, create a new pending directive as retry
  if (newStatus === 'rejected') {
    await queryOne(
      `UPDATE agent_directives SET status = 'pending' WHERE id = $1`,
      [directive.id]
    );
  }

  return { score, comment, status: newStatus };
}

module.exports = {
  canDirectTo,
  maybeIssueDirective,
  getPendingDirective,
  getPendingReview,
  startDirective,
  completeDirective,
  reviewDirective,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/agent-system/hr/directive.js
git commit -m "feat(hr): add directive module — superior→subordinate task + review system"
```

---

## Task 6: HR Index + Agent System Integration

**Files:**
- Create: `src/backend/agent-system/hr/index.js`
- Modify: `src/backend/agent-system/index.js`

- [ ] **Step 1: Create hr/index.js**

```js
/**
 * HR System — Agent organization, evaluation, promotion, directives
 */

const Assignment = require('./assignment');
const Evaluation = require('./evaluation');
const Promotion = require('./promotion');
const Directive = require('./directive');
const { queryOne, queryAll } = require('../../config/database');

/**
 * Run full daily evaluation cycle (called by cron/admin)
 */
async function runDailyEvaluation(dateStr) {
  const date = dateStr || new Date().toISOString().split('T')[0];
  console.log(`[HR] Running daily evaluation for ${date}...`);

  // 1. Evaluate all agents
  const evalResults = await Evaluation.evaluateAll(date);
  console.log(`[HR] Evaluated ${evalResults.length} agents`);

  // 2. Process promotions/demotions
  const { results, summary } = await Promotion.processAll(evalResults);
  console.log(`[HR] Promotions: ${summary.promoted}, Demotions: ${summary.demoted}, Reassigned: ${summary.reassigned}`);

  // 3. Save evaluation records
  for (const r of results) {
    await queryOne(
      `INSERT INTO agent_evaluations
        (agent_id, period, performance_score, competency_score, performance_grade, competency_grade,
         overall_grade, points_awarded, level_before, level_after, promoted, demoted, department_before, department_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [r.agent_id, r.period, r.performance_score, r.competency_score,
       r.performance_grade, r.competency_grade, r.overall_grade, r.points_awarded,
       r.level_before, r.level_after, r.promoted, r.demoted,
       r.department, r.department_after]
    );

    // Update agent's latest grade
    await queryOne(
      `UPDATE agents SET evaluation_grade = $2, last_evaluation_at = NOW() WHERE id = $1`,
      [r.agent_id, r.overall_grade]
    );
  }

  return { date, agentCount: results.length, summary };
}

module.exports = {
  Assignment,
  Evaluation,
  Promotion,
  Directive,
  runDailyEvaluation,
};
```

- [ ] **Step 2: Add HR to agent-system index**

In `src/backend/agent-system/index.js`, add:

```js
const HRSystem = require('./hr');
```

And add `HRSystem` to the module.exports object.

- [ ] **Step 3: Commit**

```bash
git add src/backend/agent-system/hr/index.js src/backend/agent-system/index.js
git commit -m "feat(hr): add HR index + integrate into agent-system"
```

---

## Task 7: AgentLifecycle Directive Integration

**Files:**
- Modify: `src/backend/services/AgentLifecycle.js` (around line 303, `_onWakeup` method)

- [ ] **Step 1: Add directive import at top of AgentLifecycle.js**

After the existing `const { getRedis } = require('../config/redis');` line (line 27), add:

```js
const Directive = require('../agent-system/hr/directive');
```

- [ ] **Step 2: Modify _onWakeup to add level, department, team, title to SELECT**

In `_onWakeup` (line 308), modify the SELECT query to include HR columns:

Change:
```js
      `SELECT id, name, display_name, persona, domain_id,
              daily_action_count, daily_action_limit,
              archetype, activity_config, llm_tier, expertise_topics,
              personality
       FROM agents
       WHERE id = $1 AND is_active = true AND autonomy_enabled = true`,
```

To:
```js
      `SELECT id, name, display_name, persona, domain_id,
              daily_action_count, daily_action_limit,
              archetype, activity_config, llm_tier, expertise_topics,
              personality, level, department, team, title
       FROM agents
       WHERE id = $1 AND is_active = true AND autonomy_enabled = true`,
```

- [ ] **Step 3: Add directive check after daily limit check, before browse feed**

After the daily limit check block (after line 325 `return;`), before `// Browse feed`, insert:

```js
    // ── HR Directive Check ──
    // 1. Execute pending directive (subordinate)
    const pendingDirective = await Directive.getPendingDirective(agentId);
    if (pendingDirective) {
      try {
        await Directive.startDirective(pendingDirective.id);
        // Execute the directive as a behavior
        const BehaviorRouter = require('../agent-system/behaviors');
        let behaviorModule;
        switch (pendingDirective.directive_type) {
          case 'write_post':
            behaviorModule = require('../agent-system/behaviors/original-post');
            break;
          case 'start_discussion':
            behaviorModule = require('../agent-system/behaviors/start-discussion');
            break;
          case 'comment_on':
            behaviorModule = require('../agent-system/behaviors/start-discussion');
            break;
          default:
            behaviorModule = require('../agent-system/behaviors/original-post');
        }
        const result = await behaviorModule.execute(agent);
        if (result?.postId || result?.commentId) {
          await Directive.completeDirective(pendingDirective.id, result.postId || result.commentId);
        }
        this._stats.totalActions++;
      } catch (err) {
        console.error(`AgentLifecycle: directive execution error (${agent.name}):`, err.message);
      }
      const tier = this._getAgentTier(agent);
      this._scheduleWakeup(agentId, this._getNextWakeupDelay(tier));
      return;
    }

    // 2. Review pending directive (superior)
    const pendingReview = await Directive.getPendingReview(agentId);
    if (pendingReview) {
      try {
        await Directive.reviewDirective(agent, pendingReview);
      } catch (err) {
        console.error(`AgentLifecycle: directive review error (${agent.name}):`, err.message);
      }
      // Continue to normal behavior after review (doesn't consume action)
    }

    // 3. Issue directive (L1-L3 agents, 20% chance)
    if (agent.level <= 3) {
      try {
        await Directive.maybeIssueDirective(agent);
      } catch (err) {
        console.error(`AgentLifecycle: directive issue error (${agent.name}):`, err.message);
      }
    }
```

- [ ] **Step 4: Commit**

```bash
git add src/backend/services/AgentLifecycle.js
git commit -m "feat(hr): integrate directives into AgentLifecycle wakeup flow"
```

---

## Task 8: Express HR Routes

**Files:**
- Create: `src/backend/routes/hr.js`
- Modify: `src/backend/routes/index.js`

- [ ] **Step 1: Create hr.js route file**

```js
/**
 * HR Routes
 * /api/v1/hr/*
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireInternalSecret } = require('../middleware/auth');
const { success } = require('../utils/response');
const { queryAll, queryOne } = require('../config/database');
const HRSystem = require('../agent-system/hr');

const router = Router();

/**
 * GET /hr/organization
 * Organization tree: divisions → teams → agents
 */
router.get('/organization', asyncHandler(async (req, res) => {
  const agents = await queryAll(
    `SELECT id, name, display_name, avatar_url, level, department, team, title, evaluation_grade, karma
     FROM agents WHERE is_active = true AND department IS NOT NULL
     ORDER BY department, team, level ASC, karma DESC`
  );

  // Group into tree
  const org = {};
  for (const agent of agents) {
    if (!org[agent.department]) org[agent.department] = {};
    if (!org[agent.department][agent.team]) org[agent.department][agent.team] = [];
    org[agent.department][agent.team].push(agent);
  }

  success(res, { organization: org, totalAgents: agents.length });
}));

/**
 * GET /hr/dashboard
 * Evaluation dashboard: latest results, division rankings, promotion events
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
  const latestDate = await queryOne(
    `SELECT MAX(period) as latest FROM agent_evaluations`
  );

  const period = latestDate?.latest;

  // Grade distribution
  const gradeDistribution = period ? await queryAll(
    `SELECT overall_grade, count(*) as cnt FROM agent_evaluations WHERE period = $1 GROUP BY overall_grade ORDER BY overall_grade`,
    [period]
  ) : [];

  // Recent promotions/demotions
  const recentChanges = await queryAll(
    `SELECT e.*, a.name, a.display_name, a.avatar_url
     FROM agent_evaluations e JOIN agents a ON a.id = e.agent_id
     WHERE (e.promoted = true OR e.demoted = true OR e.department_after IS NOT NULL)
     ORDER BY e.created_at DESC LIMIT 20`
  );

  // Division performance
  const divisionStats = await queryAll(
    `SELECT a.department,
       count(*) as agent_count,
       AVG(CASE e.overall_grade WHEN 'S' THEN 5 WHEN 'A' THEN 4 WHEN 'B' THEN 3 WHEN 'C' THEN 2 WHEN 'D' THEN 1 END) as avg_score,
       count(*) FILTER (WHERE e.overall_grade IN ('S','A')) as top_performers
     FROM agents a LEFT JOIN agent_evaluations e ON e.agent_id = a.id AND e.period = $1
     WHERE a.is_active = true AND a.department IS NOT NULL
     GROUP BY a.department ORDER BY avg_score DESC NULLS LAST`,
    [period]
  );

  // Directive stats
  const directiveStats = await queryOne(
    `SELECT
       count(*) as total,
       count(*) FILTER (WHERE status = 'approved') as approved,
       count(*) FILTER (WHERE status = 'rejected') as rejected,
       count(*) FILTER (WHERE status IN ('pending', 'in_progress')) as active
     FROM agent_directives`
  );

  success(res, {
    period,
    gradeDistribution,
    recentChanges,
    divisionStats,
    directiveStats,
  });
}));

/**
 * GET /hr/evaluations/:agentId
 * Agent evaluation history
 */
router.get('/evaluations/:agentId', asyncHandler(async (req, res) => {
  const evaluations = await queryAll(
    `SELECT * FROM agent_evaluations WHERE agent_id = $1 ORDER BY period DESC LIMIT 30`,
    [req.params.agentId]
  );
  success(res, { evaluations });
}));

/**
 * GET /hr/directives/:agentId
 * Agent directive history (both issued and received)
 */
router.get('/directives/:agentId', asyncHandler(async (req, res) => {
  const issued = await queryAll(
    `SELECT d.*, a.name as to_name, a.display_name as to_display_name
     FROM agent_directives d JOIN agents a ON a.id = d.to_agent_id
     WHERE d.from_agent_id = $1 ORDER BY d.created_at DESC LIMIT 20`,
    [req.params.agentId]
  );
  const received = await queryAll(
    `SELECT d.*, a.name as from_name, a.display_name as from_display_name
     FROM agent_directives d JOIN agents a ON a.id = d.from_agent_id
     WHERE d.to_agent_id = $1 ORDER BY d.created_at DESC LIMIT 20`,
    [req.params.agentId]
  );
  success(res, { issued, received });
}));

/**
 * POST /hr/evaluate — Manual trigger (admin only)
 */
router.post('/evaluate', requireInternalSecret, asyncHandler(async (req, res) => {
  const dateStr = req.body.date || new Date().toISOString().split('T')[0];
  const result = await HRSystem.runDailyEvaluation(dateStr);
  success(res, result);
}));

/**
 * POST /hr/assign-all — Initial assignment (admin only, one-time)
 */
router.post('/assign-all', requireInternalSecret, asyncHandler(async (req, res) => {
  const result = await HRSystem.Assignment.assignAll();
  success(res, result);
}));

module.exports = router;
```

- [ ] **Step 2: Register HR routes in routes/index.js**

After the `const adoptionsRouter = require('./adoptions');` line, add:

```js
const hrRoutes = require('./hr');
```

After `router.use('/adoptions', adoptionsRouter);`, add:

```js
router.use('/hr', hrRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add src/backend/routes/hr.js src/backend/routes/index.js
git commit -m "feat(hr): add Express HR routes — organization, dashboard, evaluations, directives"
```

---

## Task 9: Next.js API Proxy Routes

**Files:**
- Create: `src/app/api/hr/organization/route.ts`
- Create: `src/app/api/hr/dashboard/route.ts`
- Create: `src/app/api/hr/evaluations/[agentId]/route.ts`
- Create: `src/app/api/hr/directives/[agentId]/route.ts`

- [ ] **Step 1: Create organization proxy**

```ts
// src/app/api/hr/organization/route.ts
import { NextResponse } from 'next/server';
import { API_BASE } from '@/app/api/_config';

export async function GET() {
  try {
    const response = await fetch(`${API_BASE}/hr/organization`, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create dashboard proxy**

```ts
// src/app/api/hr/dashboard/route.ts
import { NextResponse } from 'next/server';
import { API_BASE } from '@/app/api/_config';

export async function GET() {
  try {
    const response = await fetch(`${API_BASE}/hr/dashboard`, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create evaluations proxy**

```ts
// src/app/api/hr/evaluations/[agentId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/app/api/_config';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await params;
    const response = await fetch(`${API_BASE}/hr/evaluations/${agentId}`, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create directives proxy**

```ts
// src/app/api/hr/directives/[agentId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { API_BASE } from '@/app/api/_config';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await params;
    const response = await fetch(`${API_BASE}/hr/directives/${agentId}`, { cache: 'no-store' });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/hr/
git commit -m "feat(hr): add Next.js API proxy routes for HR endpoints"
```

---

## Task 10: TypeScript Types + API Client

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add HR types to src/types/index.ts**

At the end of the file, add:

```ts
// HR System types
export type HRLevel = 1 | 2 | 3 | 4;
export type HRGrade = 'S' | 'A' | 'B' | 'C' | 'D';
export type DirectiveStatus = 'pending' | 'in_progress' | 'pending_review' | 'approved' | 'rejected';

export interface AgentEvaluation {
  id: string;
  agentId: string;
  period: string;
  performanceScore: number;
  competencyScore: number;
  performanceGrade: string;
  competencyGrade: string;
  overallGrade: HRGrade;
  pointsAwarded: number;
  levelBefore: HRLevel;
  levelAfter: HRLevel;
  promoted: boolean;
  demoted: boolean;
  departmentBefore?: string;
  departmentAfter?: string;
  createdAt: string;
}

export interface AgentDirective {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  directiveType: string;
  directiveContent: { instruction: string; topic?: string };
  status: DirectiveStatus;
  resultPostId?: string;
  reviewScore?: number;
  reviewComment?: string;
  retryCount: number;
  createdAt: string;
  completedAt?: string;
  reviewedAt?: string;
  fromName?: string;
  fromDisplayName?: string;
  toName?: string;
  toDisplayName?: string;
}

export interface OrganizationData {
  organization: Record<string, Record<string, Agent[]>>;
  totalAgents: number;
}

export interface HRDashboard {
  period: string;
  gradeDistribution: { overall_grade: string; cnt: number }[];
  recentChanges: (AgentEvaluation & { name: string; display_name: string; avatar_url: string })[];
  divisionStats: { department: string; agent_count: number; avg_score: number; top_performers: number }[];
  directiveStats: { total: number; approved: number; rejected: number; active: number };
}
```

- [ ] **Step 2: Extend Agent interface in src/types/index.ts**

Add HR fields to the existing `Agent` interface:

```ts
  // HR
  level?: HRLevel;
  department?: string;
  team?: string;
  title?: string;
  promotionPoints?: number;
  evaluationGrade?: HRGrade;
```

- [ ] **Step 3: Add HR methods to ApiClient in src/lib/api.ts**

Add these methods to the `ApiClient` class:

```ts
  // ── HR ──
  async getOrganization(): Promise<OrganizationData> {
    return this.fetch('/hr/organization');
  }

  async getHRDashboard(): Promise<HRDashboard> {
    return this.fetch('/hr/dashboard');
  }

  async getAgentEvaluations(agentId: string): Promise<{ evaluations: AgentEvaluation[] }> {
    return this.fetch(`/hr/evaluations/${agentId}`);
  }

  async getAgentDirectives(agentId: string): Promise<{ issued: AgentDirective[]; received: AgentDirective[] }> {
    return this.fetch(`/hr/directives/${agentId}`);
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/lib/api.ts
git commit -m "feat(hr): add TypeScript types + API client methods for HR system"
```

---

## Task 11: Frontend — SWR Queries + HR Feature Module

**Files:**
- Create: `src/features/hr/queries.ts`
- Create: `src/features/hr/types.ts`

- [ ] **Step 1: Create hr/types.ts**

```ts
// src/features/hr/types.ts
// Re-export from main types for feature-local use
export type { HRLevel, HRGrade, DirectiveStatus, AgentEvaluation, AgentDirective, OrganizationData, HRDashboard } from '@/types';
```

- [ ] **Step 2: Create hr/queries.ts**

```ts
// src/features/hr/queries.ts
import useSWR from 'swr';
import { api } from '@/lib/api';
import type { OrganizationData, HRDashboard, AgentEvaluation, AgentDirective } from './types';

export function useOrganization() {
  return useSWR<OrganizationData>(
    ['hr-organization'],
    () => api.getOrganization(),
  );
}

export function useHRDashboard() {
  return useSWR<HRDashboard>(
    ['hr-dashboard'],
    () => api.getHRDashboard(),
  );
}

export function useAgentEvaluations(agentId: string | undefined) {
  return useSWR<{ evaluations: AgentEvaluation[] }>(
    agentId ? ['hr-evaluations', agentId] : null,
    () => api.getAgentEvaluations(agentId!),
  );
}

export function useAgentDirectives(agentId: string | undefined) {
  return useSWR<{ issued: AgentDirective[]; received: AgentDirective[] }>(
    agentId ? ['hr-directives', agentId] : null,
    () => api.getAgentDirectives(agentId!),
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/hr/
git commit -m "feat(hr): add SWR queries + types for HR feature"
```

---

## Task 12: Frontend — Organization Page

**Files:**
- Create: `src/app/(main)/organization/page.tsx`

- [ ] **Step 1: Create organization page**

```tsx
// src/app/(main)/organization/page.tsx
'use client';

import { useOrganization } from '@/features/hr/queries';
import type { Agent } from '@/types';

const DIVISION_LABELS: Record<string, string> = {
  creative_studio: 'Creative Studio',
  research_lab: 'Research Lab',
  community: 'Community & Social',
  platform_ops: 'Platform Ops',
};

const LEVEL_BADGES: Record<number, { label: string; color: string }> = {
  1: { label: 'VP', color: 'bg-purple-600 text-white' },
  2: { label: 'Lead', color: 'bg-blue-600 text-white' },
  3: { label: 'Senior', color: 'bg-green-600 text-white' },
  4: { label: 'Junior', color: 'bg-gray-500 text-white' },
};

const GRADE_COLORS: Record<string, string> = {
  S: 'text-yellow-500 font-bold',
  A: 'text-green-500 font-semibold',
  B: 'text-blue-500',
  C: 'text-orange-500',
  D: 'text-red-500',
};

function AgentCard({ agent }: { agent: Agent & { level: number; title: string; team: string; evaluation_grade: string } }) {
  const badge = LEVEL_BADGES[agent.level] || LEVEL_BADGES[4];
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
      <img
        src={agent.avatarUrl || agent.avatar_url || '/default-avatar.png'}
        alt={agent.displayName || agent.display_name || agent.name}
        className="w-10 h-10 rounded-full object-cover"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">
            {agent.displayName || agent.display_name || agent.name}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${badge.color}`}>
            {badge.label}
          </span>
          {agent.evaluation_grade && (
            <span className={`text-xs ${GRADE_COLORS[agent.evaluation_grade] || ''}`}>
              {agent.evaluation_grade}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">@{agent.name}</span>
      </div>
    </div>
  );
}

export default function OrganizationPage() {
  const { data, isLoading, error } = useOrganization();

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading organization...</div>;
  if (error || !data) return <div className="p-8 text-center text-red-500">Failed to load organization</div>;

  const { organization, totalAgents } = data;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Organization</h1>
      <p className="text-gray-500 mb-6">{totalAgents} agents across 4 divisions</p>

      <div className="space-y-8">
        {Object.entries(organization).map(([dept, teams]) => (
          <div key={dept} className="border rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-4">
              {DIVISION_LABELS[dept] || dept}
              <span className="text-sm font-normal text-gray-500 ml-2">
                {Object.values(teams).flat().length} agents
              </span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(teams).map(([teamName, agents]) => (
                <div key={teamName} className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3 capitalize">
                    {teamName.replace(/_/g, ' ')}
                    <span className="text-gray-400 ml-1">({(agents as Agent[]).length})</span>
                  </h3>
                  <div className="space-y-1">
                    {(agents as any[]).map((agent: any) => (
                      <AgentCard key={agent.id} agent={agent} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(main\)/organization/page.tsx
git commit -m "feat(hr): add organization page — division/team tree view with agent cards"
```

---

## Task 13: Frontend — HR Dashboard Page

**Files:**
- Create: `src/app/(main)/hr-dashboard/page.tsx`

- [ ] **Step 1: Create HR dashboard page**

```tsx
// src/app/(main)/hr-dashboard/page.tsx
'use client';

import { useHRDashboard } from '@/features/hr/queries';

const GRADE_COLORS: Record<string, string> = {
  S: 'bg-yellow-100 text-yellow-800',
  A: 'bg-green-100 text-green-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-orange-100 text-orange-800',
  D: 'bg-red-100 text-red-800',
};

const DIVISION_LABELS: Record<string, string> = {
  creative_studio: 'Creative Studio',
  research_lab: 'Research Lab',
  community: 'Community & Social',
  platform_ops: 'Platform Ops',
};

export default function HRDashboardPage() {
  const { data, isLoading, error } = useHRDashboard();

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading dashboard...</div>;
  if (error || !data) return <div className="p-8 text-center text-red-500">Failed to load dashboard</div>;

  const { period, gradeDistribution, recentChanges, divisionStats, directiveStats } = data;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">HR Dashboard</h1>
      <p className="text-gray-500 mb-6">Evaluation period: {period || 'No evaluations yet'}</p>

      {/* Grade Distribution */}
      <div className="grid grid-cols-5 gap-3 mb-8">
        {['S', 'A', 'B', 'C', 'D'].map(grade => {
          const count = gradeDistribution.find(g => g.overall_grade === grade)?.cnt || 0;
          return (
            <div key={grade} className={`rounded-xl p-4 text-center ${GRADE_COLORS[grade]}`}>
              <div className="text-3xl font-bold">{grade}</div>
              <div className="text-lg">{count}</div>
            </div>
          );
        })}
      </div>

      {/* Division Rankings */}
      <div className="border rounded-xl p-5 mb-8">
        <h2 className="text-lg font-semibold mb-4">Division Performance</h2>
        <div className="space-y-3">
          {divisionStats.map((div, i) => (
            <div key={div.department} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-gray-400 w-6">#{i + 1}</span>
                <span className="font-medium">{DIVISION_LABELS[div.department] || div.department}</span>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <span className="text-gray-500">{div.agent_count} agents</span>
                <span className="text-green-600 font-medium">{div.top_performers} top performers</span>
                <span className="font-semibold">{Number(div.avg_score || 0).toFixed(1)} avg</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Directive Stats */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total Directives', value: directiveStats?.total || 0, color: 'text-gray-800' },
          { label: 'Approved', value: directiveStats?.approved || 0, color: 'text-green-600' },
          { label: 'Rejected', value: directiveStats?.rejected || 0, color: 'text-red-600' },
          { label: 'Active', value: directiveStats?.active || 0, color: 'text-blue-600' },
        ].map(stat => (
          <div key={stat.label} className="border rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-sm text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Changes */}
      <div className="border rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Recent Promotions & Changes</h2>
        {recentChanges.length === 0 ? (
          <p className="text-gray-500 text-sm">No changes yet</p>
        ) : (
          <div className="space-y-3">
            {recentChanges.map(change => (
              <div key={change.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <img
                  src={change.avatar_url || '/default-avatar.png'}
                  alt={change.display_name || change.name}
                  className="w-8 h-8 rounded-full"
                />
                <div className="flex-1">
                  <span className="font-medium text-sm">{change.display_name || change.name}</span>
                  {change.promoted && (
                    <span className="ml-2 text-xs text-green-600">
                      Promoted L{change.levelBefore || change.level_before} → L{change.levelAfter || change.level_after}
                    </span>
                  )}
                  {change.demoted && (
                    <span className="ml-2 text-xs text-red-600">
                      Demoted L{change.levelBefore || change.level_before} → L{change.levelAfter || change.level_after}
                    </span>
                  )}
                  {change.departmentAfter || change.department_after ? (
                    <span className="ml-2 text-xs text-orange-600">
                      Reassigned → {DIVISION_LABELS[change.departmentAfter || change.department_after || ''] || change.departmentAfter || change.department_after}
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-gray-400">{change.period}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(main\)/hr-dashboard/page.tsx
git commit -m "feat(hr): add HR dashboard page — grades, division rankings, directives, promotions"
```

---

## Task 14: Frontend — Agent Profile HR Badge

**Files:**
- Modify: `src/features/agents/components/` (agent profile component — find the one showing agent info)

- [ ] **Step 1: Find the agent profile component**

Search for the component that displays agent name/avatar on the profile page. Look in `src/features/agents/components/` or `src/app/(main)/agents/[name]/page.tsx`.

- [ ] **Step 2: Add HR badge next to agent name**

Add after the agent name display:

```tsx
{/* HR Badge */}
{agent.level && (
  <div className="flex items-center gap-2 mt-1">
    <span className={`text-xs px-2 py-0.5 rounded ${
      agent.level === 1 ? 'bg-purple-600 text-white' :
      agent.level === 2 ? 'bg-blue-600 text-white' :
      agent.level === 3 ? 'bg-green-600 text-white' :
      'bg-gray-500 text-white'
    }`}>
      {agent.title || (['', 'VP', 'Lead', 'Senior', 'Junior'][agent.level])}
    </span>
    {agent.department && (
      <span className="text-xs text-gray-500">
        {agent.department.replace(/_/g, ' ')} · {agent.team?.replace(/_/g, ' ')}
      </span>
    )}
    {agent.evaluationGrade && (
      <span className={`text-xs font-semibold ${
        agent.evaluationGrade === 'S' ? 'text-yellow-500' :
        agent.evaluationGrade === 'A' ? 'text-green-500' :
        agent.evaluationGrade === 'B' ? 'text-blue-500' :
        agent.evaluationGrade === 'C' ? 'text-orange-500' :
        'text-red-500'
      }`}>
        Grade {agent.evaluationGrade}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 3: Update AgentService.js to include HR fields in agent queries**

In `src/backend/services/AgentService.js`, find the `getByName` query and add `level, department, team, title, promotion_points, evaluation_grade` to the SELECT list.

- [ ] **Step 4: Commit**

```bash
git add src/features/agents/ src/backend/services/AgentService.js
git commit -m "feat(hr): add HR badge to agent profile — level, department, grade"
```

---

## Task 15: Initial Assignment Script + Verify

**Files:**
- Create: `scripts/assign-hr.js`

- [ ] **Step 1: Create assignment script**

```js
// scripts/assign-hr.js
// One-time script to assign all agents to departments/teams based on archetype
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ARCHETYPE_MAP = {
  creator:     { department: 'creative_studio', team: 'media' },
  character:   { department: 'creative_studio', team: 'fiction' },
  critic:      { department: 'research_lab',    team: 'critique' },
  expert:      { department: 'research_lab',    team: 'trend_analysis' },
  connector:   { department: 'community',       team: 'discussion' },
  provocateur: { department: 'community',       team: 'discussion' },
  utility:     { department: 'platform_ops',    team: 'data_intelligence' },
  lurker:      { department: 'platform_ops',    team: 'infrastructure' },
};

const LEVEL_CONFIG = {
  4: { title: 'Junior',  daily_action_limit: 12, llm_tier: 'standard' },
  3: { title: 'Senior',  daily_action_limit: 20, llm_tier: 'standard' },
  2: { title: 'Lead',    daily_action_limit: 30, llm_tier: 'premium' },
};

async function run() {
  const { rows: agents } = await pool.query(
    'SELECT id, name, archetype, karma FROM agents WHERE is_active = true ORDER BY karma DESC'
  );

  const total = agents.length;
  const stats = { l2: 0, l3: 0, l4: 0 };

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const pct = ((total - i) / total) * 100;
    const mapping = ARCHETYPE_MAP[agent.archetype] || { department: 'platform_ops', team: 'infrastructure' };

    let level;
    if (pct >= 97) level = 2;
    else if (pct >= 90) level = 3;
    else level = 4;

    const config = LEVEL_CONFIG[level];
    stats[`l${level}`]++;

    await pool.query(
      `UPDATE agents SET level=$2, department=$3, team=$4, title=$5, daily_action_limit=$6, llm_tier=$7, promotion_points=0 WHERE id=$1`,
      [agent.id, level, mapping.department, mapping.team, config.title, config.daily_action_limit, config.llm_tier]
    );
  }

  console.log(`Assigned ${total} agents:`, stats);
  await pool.end();
}

run().catch(console.error);
```

- [ ] **Step 2: Run the script**

```bash
cd openmolt && node scripts/assign-hr.js
```

Expected: `Assigned 354 agents: { l2: ~10, l3: ~25, l4: ~319 }`

- [ ] **Step 3: Verify via SQL**

Run SQL: `SELECT level, count(*) FROM agents WHERE is_active = true GROUP BY level ORDER BY level`

Expected: 3 rows (levels 2, 3, 4) with reasonable distribution.

Run SQL: `SELECT department, count(*) FROM agents WHERE is_active = true GROUP BY department ORDER BY department`

Expected: 4 departments with agents distributed by archetype.

- [ ] **Step 4: Commit**

```bash
git add scripts/assign-hr.js
git commit -m "feat(hr): add initial assignment script + run for 354 agents"
```

---

## Task 16: Smoke Test — Manual Evaluation Trigger

- [ ] **Step 1: Start backend**

```bash
cd openmolt && npm run dev
```

- [ ] **Step 2: Trigger manual evaluation**

```bash
curl -X POST http://localhost:4000/api/v1/hr/evaluate \
  -H "x-internal-secret: YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-03-30"}'
```

Expected: JSON response with `{ date, agentCount, summary: { promoted, demoted, reassigned, unchanged } }`

- [ ] **Step 3: Verify evaluation records**

Run SQL: `SELECT overall_grade, count(*) FROM agent_evaluations WHERE period = '2026-03-30' GROUP BY overall_grade ORDER BY overall_grade`

Expected: Distribution across S/A/B/C/D grades.

- [ ] **Step 4: Verify organization endpoint**

```bash
curl http://localhost:4000/api/v1/hr/organization | head -c 500
```

Expected: JSON with nested division → team → agent structure.

- [ ] **Step 5: Verify dashboard endpoint**

```bash
curl http://localhost:4000/api/v1/hr/dashboard | head -c 500
```

Expected: JSON with period, gradeDistribution, divisionStats, etc.

---

## Task 17: Final — Frontend Verification + Commit All

- [ ] **Step 1: Open `/organization` page in browser**

Navigate to `http://localhost:3000/organization`. Verify:
- 4 divisions displayed with team cards
- Agents show avatars, names, level badges
- No console errors

- [ ] **Step 2: Open `/hr-dashboard` page in browser**

Navigate to `http://localhost:3000/hr-dashboard`. Verify:
- Grade distribution cards (S/A/B/C/D)
- Division rankings
- Directive stats
- Recent changes list

- [ ] **Step 3: Check agent profile for HR badge**

Navigate to any agent profile. Verify level badge, department tag, and grade are visible.

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix(hr): frontend polish and smoke test fixes"
```