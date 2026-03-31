# CGB Brain Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CGB를 355+ 에이전트의 중추 뇌로 연동 — brain_config DB, BrainClient, 그래프 축적, 진화 루프

**Architecture:** Express에서 BrainClient 모듈로 CGB REST API 호출. brain_config(JSONB)로 에이전트별 뇌 역할 가중치 관리. HR 평가 + 활동 경험치로 brain_config 자동 진화.

**Tech Stack:** Node.js, PostgreSQL (Supabase), CGB REST API (Vercel)

**Spec:** `docs/superpowers/specs/2026-03-31-cgb-brain-integration-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/016_brain_config.sql` | brain_config 컬럼 + 인덱스 |
| Create | `src/backend/services/BrainClient.js` | CGB REST API 래퍼 |
| Create | `src/backend/services/BrainEvolution.js` | brain_config 초기 산출 + 진화 로직 |
| Create | `scripts/init-brain-config.js` | 355명 brain_config 일괄 초기화 |
| Create | `src/backend/routes/brain.js` | 뇌 상태 조회 API |
| Create | `src/app/api/brain/status/route.ts` | Next.js 프록시 |
| Create | `e2e/brain-system.spec.ts` | E2E 테스트 |
| Modify | `src/backend/config/index.js` | CGB URL 환경변수 |
| Modify | `src/backend/routes/index.js` | brain 라우트 등록 |
| Modify | `src/backend/agent-system/hr/evaluation.js` | 평가 후 brain_config 업데이트 |
| Modify | `src/backend/services/AgentLifecycle.js` | BrainClient 호출 |
| Modify | `src/backend/services/TaskWorker.js` | BrainClient 호출 |

---

### Task 1: DB 마이그레이션 — brain_config 컬럼

**Files:**
- Create: `supabase/migrations/016_brain_config.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- 016_brain_config.sql
-- 에이전트 뇌 설정 — CGB 역할 가중치, 도구 접근, 그래프 권한

ALTER TABLE agents ADD COLUMN IF NOT EXISTS brain_config JSONB DEFAULT NULL;

-- 활동 경험치 추적
ALTER TABLE agents ADD COLUMN IF NOT EXISTS brain_activity JSONB DEFAULT '{}';

COMMENT ON COLUMN agents.brain_config IS 'CGB brain weights, temperature, max_steps, tool_access, graph_scope, write_permission';
COMMENT ON COLUMN agents.brain_activity IS 'Cumulative brain activity counts for experience-based evolution';
```

- [ ] **Step 2: Supabase MCP 또는 직접 실행으로 마이그레이션 적용**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/016_brain_config.sql
git commit -m "feat: add brain_config + brain_activity columns to agents"
```

---

### Task 2: BrainEvolution — 초기 산출 + 진화 로직

**Files:**
- Create: `src/backend/services/BrainEvolution.js`

- [ ] **Step 1: BrainEvolution 모듈 작성**

```js
/**
 * BrainEvolution — brain_config 초기 산출 + HR 평가 진화 + 활동 경험치
 */

const { queryOne, queryAll } = require('../config/database');

// Archetype → 기본 가중치 (합계 1.0)
const ARCHETYPE_WEIGHTS = {
  creator:     { researcher: 0.10, divergent: 0.40, evaluator: 0.05, validator: 0.05, director: 0.10, iterator: 0.30 },
  character:   { researcher: 0.30, divergent: 0.30, evaluator: 0.05, validator: 0.05, director: 0.10, iterator: 0.20 },
  expert:      { researcher: 0.40, divergent: 0.10, evaluator: 0.15, validator: 0.20, director: 0.05, iterator: 0.10 },
  provocateur: { researcher: 0.10, divergent: 0.35, evaluator: 0.05, validator: 0.10, director: 0.10, iterator: 0.30 },
  connector:   { researcher: 0.20, divergent: 0.15, evaluator: 0.10, validator: 0.10, director: 0.35, iterator: 0.10 },
  lurker:      { researcher: 0.35, divergent: 0.05, evaluator: 0.30, validator: 0.20, director: 0.05, iterator: 0.05 },
  critic:      { researcher: 0.10, divergent: 0.05, evaluator: 0.40, validator: 0.30, director: 0.05, iterator: 0.10 },
  utility:     { researcher: 0.15, divergent: 0.10, evaluator: 0.15, validator: 0.15, director: 0.30, iterator: 0.15 },
};

// Big Five → 역할 보정 매핑
const BIG_FIVE_MODIFIERS = {
  openness:          { divergent: 0.15, researcher: 0.05 },
  conscientiousness: { evaluator: 0.10, iterator: 0.05 },
  extraversion:      { director: 0.10, divergent: 0.05 },
  agreeableness:     { validator: 0.10, director: 0.05 },
  neuroticism:       { iterator: 0.10, evaluator: 0.05 },
};

// Level → write_permission
const LEVEL_PERMISSIONS = {
  1: 'full',      // VP
  2: 'trusted',   // Lead
  3: 'auto',      // Senior
  4: 'validated',  // Junior
};

// Level → default tool access
const LEVEL_TOOLS = {
  1: ['brainstorm', 'scamper', 'triz', 'evaluate_idea', 'measure_novelty', 'graph_add_node', 'graph_add_edge', 'graph_search', 'graph_query', 'web_search', 'extract_keywords'],
  2: ['brainstorm', 'scamper', 'triz', 'evaluate_idea', 'measure_novelty', 'graph_add_node', 'graph_add_edge', 'graph_search', 'web_search', 'extract_keywords'],
  3: ['brainstorm', 'scamper', 'evaluate_idea', 'graph_add_node', 'graph_search', 'web_search', 'extract_keywords'],
  4: ['brainstorm', 'evaluate_idea', 'graph_search', 'web_search', 'extract_keywords'],
};

function normalize(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum === 0) return weights;
  const result = {};
  for (const [k, v] of Object.entries(weights)) {
    result[k] = Math.round((v / sum) * 1000) / 1000;
  }
  return result;
}

/**
 * Calculate initial brain_config from archetype + personality + level
 */
function calculateInitial(agent) {
  const archetype = agent.archetype || 'utility';
  const personality = agent.personality || {};
  const level = agent.level || 4;
  const domain = agent.department || 'general';

  // Start with archetype base
  const weights = { ...(ARCHETYPE_WEIGHTS[archetype] || ARCHETYPE_WEIGHTS.utility) };

  // Apply Big Five modifiers
  for (const [trait, mods] of Object.entries(BIG_FIVE_MODIFIERS)) {
    const value = personality[trait];
    if (typeof value !== 'number') continue;
    // Scale modifier by trait value (0-1)
    for (const [role, mod] of Object.entries(mods)) {
      weights[role] = (weights[role] || 0) + mod * value;
    }
  }

  // Determine temperature from dominant role
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const tempMap = { divergent: 0.9, researcher: 0.7, evaluator: 0.3, validator: 0.4, director: 0.5, iterator: 0.8 };
  const temperature = tempMap[dominant] || 0.7;

  // Max steps based on level
  const maxStepsBase = { 1: 15, 2: 12, 3: 10, 4: 8 };

  return {
    weights: normalize(weights),
    temperature: Math.round(temperature * 100) / 100,
    max_steps: maxStepsBase[level] || 8,
    tool_access: LEVEL_TOOLS[level] || LEVEL_TOOLS[4],
    graph_scope: domain.replace(/_/g, '-'),
    write_permission: LEVEL_PERMISSIONS[level] || 'validated',
  };
}

/**
 * Apply HR evaluation result to brain_config
 */
function applyHREvaluation(currentConfig, grade) {
  if (!currentConfig) return currentConfig;
  const config = JSON.parse(JSON.stringify(currentConfig));
  const weights = config.weights;

  // Find strongest and weakest roles
  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const strongest = sorted[0][0];
  const weakest = sorted[sorted.length - 1][0];

  switch (grade) {
    case 'S':
      weights[strongest] = (weights[strongest] || 0) + 0.05;
      config.max_steps = Math.min(20, (config.max_steps || 8) + 2);
      break;
    case 'A':
      weights[strongest] = (weights[strongest] || 0) + 0.03;
      config.max_steps = Math.min(20, (config.max_steps || 8) + 1);
      break;
    case 'B':
      // No change
      break;
    case 'C':
      weights[weakest] = Math.max(0, (weights[weakest] || 0) - 0.02);
      config.max_steps = Math.max(4, (config.max_steps || 8) - 1);
      break;
    case 'D':
      weights[weakest] = Math.max(0, (weights[weakest] || 0) - 0.03);
      config.max_steps = Math.max(4, (config.max_steps || 8) - 2);
      break;
  }

  config.weights = normalize(weights);
  return config;
}

/**
 * Apply activity-based experience to brain_config
 * activityCounts: { brainstorm: N, evaluate: N, graph_add: N, scamper: N, cross_domain: N }
 */
function applyExperience(currentConfig, activityCounts) {
  if (!currentConfig) return currentConfig;
  const config = JSON.parse(JSON.stringify(currentConfig));
  const weights = config.weights;

  const thresholds = {
    brainstorm: { count: 100, role: 'divergent', boost: 0.02 },
    evaluate: { count: 50, role: 'evaluator', boost: 0.02 },
    graph_add: { count: 50, role: 'researcher', boost: 0.02 },
    scamper: { count: 30, role: 'iterator', boost: 0.02 },
    cross_domain: { count: 10, role: 'director', boost: 0.02 },
  };

  for (const [activity, { count, role, boost }] of Object.entries(thresholds)) {
    const current = activityCounts[activity] || 0;
    // Apply boost for every threshold reached
    const times = Math.floor(current / count);
    if (times > 0) {
      weights[role] = (weights[role] || 0) + boost * times;
    }
  }

  config.weights = normalize(weights);
  return config;
}

/**
 * Initialize brain_config for all agents without one
 */
async function initializeAll() {
  const agents = await queryAll(
    `SELECT id, archetype, personality, level, department
     FROM agents WHERE is_active = true AND brain_config IS NULL`
  );

  let count = 0;
  for (const agent of agents) {
    const config = calculateInitial(agent);
    await queryOne(
      `UPDATE agents SET brain_config = $1 WHERE id = $2`,
      [JSON.stringify(config), agent.id]
    );
    count++;
  }
  return count;
}

module.exports = {
  calculateInitial,
  applyHREvaluation,
  applyExperience,
  initializeAll,
  normalize,
  ARCHETYPE_WEIGHTS,
  LEVEL_PERMISSIONS,
  LEVEL_TOOLS,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/services/BrainEvolution.js
git commit -m "feat: add BrainEvolution — brain_config calculation + HR evolution + experience"
```

---

### Task 3: BrainClient — CGB REST API 래퍼

**Files:**
- Create: `src/backend/services/BrainClient.js`
- Modify: `src/backend/config/index.js`

- [ ] **Step 1: config에 CGB URL 추가**

In `src/backend/config/index.js`, add after `autonomy` block:

```js
  // CGB Brain
  cgb: {
    apiUrl: process.env.CGB_API_URL || 'http://localhost:3001',
    apiKey: process.env.CGB_API_KEY || '',
  },
```

- [ ] **Step 2: BrainClient 작성**

```js
/**
 * BrainClient — CGB REST API wrapper
 * Every agent activity goes through here to use the CGB brain.
 */

const config = require('../config');
const { queryOne } = require('../config/database');

const CGB_URL = config.cgb?.apiUrl || 'http://localhost:3001';
const CGB_KEY = config.cgb?.apiKey || '';

async function cgbFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (CGB_KEY) headers['x-api-key'] = CGB_KEY;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 30000);

  try {
    const res = await fetch(`${CGB_URL}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn(`[BrainClient] ${path} failed: ${res.status}`, err.error?.message || '');
      return null;
    }
    return res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`[BrainClient] ${path} timeout`);
    } else {
      console.warn(`[BrainClient] ${path} error:`, err.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getBrainConfig(agentId) {
  const agent = await queryOne(
    `SELECT brain_config, archetype, personality, level, department FROM agents WHERE id = $1`,
    [agentId]
  );
  if (!agent) return null;
  if (agent.brain_config) return agent.brain_config;

  // Lazy init: calculate and save if missing
  const BrainEvolution = require('./BrainEvolution');
  const config = BrainEvolution.calculateInitial(agent);
  await queryOne(`UPDATE agents SET brain_config = $1 WHERE id = $2`, [JSON.stringify(config), agentId]);
  return config;
}

/**
 * Research — gather domain knowledge via graph search + web search
 */
async function research(agentId, topic) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  const graphResult = await cgbFetch(`/api/v1/graph/search?q=${encodeURIComponent(topic)}`);
  return {
    graphContext: graphResult?.data?.nodes || [],
    brainConfig: bc,
  };
}

/**
 * Brainstorm — generate ideas using CGB creative engine
 */
async function brainstorm(agentId, topic, options = {}) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  const result = await cgbFetch('/api/v1/creative/brainstorm', {
    method: 'POST',
    body: {
      topic,
      count: options.count || 5,
      temperature: bc.temperature,
      domain: bc.graph_scope,
    },
    timeout: 60000,
  });

  // Track activity
  await trackActivity(agentId, 'brainstorm');
  return result?.data || null;
}

/**
 * Evaluate — score an idea using CGB 6-dimensional evaluation
 */
async function evaluate(agentId, idea) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  const result = await cgbFetch('/api/v1/creative/evaluate', {
    method: 'POST',
    body: { idea, domain: bc.graph_scope },
    timeout: 30000,
  });

  await trackActivity(agentId, 'evaluate');
  return result?.data || null;
}

/**
 * Add to graph — with quality gate (layer routing)
 */
async function addToGraph(agentId, node) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  // Add metadata
  const enrichedNode = {
    ...node,
    agent_id: agentId,
    domain: bc.graph_scope,
    layer: 2, // Always starts at L2 (personal)
  };

  const result = await cgbFetch('/api/v1/graph/nodes', {
    method: 'POST',
    body: enrichedNode,
    timeout: 15000,
  });

  if (result?.data) {
    await trackActivity(agentId, 'graph_add');

    // Quality gate: check if eligible for L1 promotion
    const score = result.data.score || 0;
    if (bc.write_permission === 'full' || bc.write_permission === 'trusted') {
      // VP/Lead: auto-promote to L1 if score >= 40
      if (score >= 40) {
        await cgbFetch('/api/v1/graph/nodes', {
          method: 'POST',
          body: { ...enrichedNode, layer: 1 },
          timeout: 10000,
        });
      }
    } else if (bc.write_permission === 'auto' && score >= 40) {
      // Senior: auto-promote to L1
      await cgbFetch('/api/v1/graph/nodes', {
        method: 'POST',
        body: { ...enrichedNode, layer: 1 },
        timeout: 10000,
      });
    }
    // L0 promotion: score > 70 handled by CGB events.ts or cron
  }

  return result?.data || null;
}

/**
 * Search graph — layer-aware search
 */
async function searchGraph(agentId, query) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  // Search personal (L2) + domain (L1) + global (L0)
  const result = await cgbFetch(
    `/api/v1/graph/search?q=${encodeURIComponent(query)}&domain=${bc.graph_scope}&agent_id=${agentId}`
  );
  return result?.data?.nodes || [];
}

/**
 * Analyze image — extract visual concepts
 */
async function analyzeImage(agentId, imageUrl) {
  const bc = await getBrainConfig(agentId);
  if (!bc || !bc.tool_access.includes('analyze_image')) return null;

  const result = await cgbFetch('/api/v1/creative/brainstorm', {
    method: 'POST',
    body: {
      topic: `Analyze this image and extract creative concepts`,
      imageUrl,
      domain: bc.graph_scope,
    },
    timeout: 30000,
  });

  return result?.data || null;
}

/**
 * Track brain activity for experience-based evolution
 */
async function trackActivity(agentId, type) {
  try {
    await queryOne(
      `UPDATE agents SET brain_activity = brain_activity || jsonb_build_object($1, COALESCE((brain_activity->>$1)::int, 0) + 1)
       WHERE id = $2`,
      [type, agentId]
    );
  } catch (err) {
    // Non-fatal
    console.warn(`[BrainClient] trackActivity error:`, err.message);
  }
}

/**
 * Get brain status for an agent (API endpoint use)
 */
async function getStatus(agentId) {
  const agent = await queryOne(
    `SELECT brain_config, brain_activity, archetype, level, department, evaluation_grade
     FROM agents WHERE id = $1`,
    [agentId]
  );
  if (!agent) return null;

  return {
    agentId,
    brainConfig: agent.brain_config,
    activity: agent.brain_activity || {},
    archetype: agent.archetype,
    level: agent.level,
    department: agent.department,
    evaluationGrade: agent.evaluation_grade,
    cgbUrl: CGB_URL,
    cgbReachable: !!(await cgbFetch('/api/health')),
  };
}

module.exports = {
  research,
  brainstorm,
  evaluate,
  addToGraph,
  searchGraph,
  analyzeImage,
  trackActivity,
  getBrainConfig,
  getStatus,
};
```

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/BrainClient.js src/backend/config/index.js
git commit -m "feat: add BrainClient — CGB REST API wrapper with quality gates"
```

---

### Task 4: Brain 초기화 스크립트

**Files:**
- Create: `scripts/init-brain-config.js`

- [ ] **Step 1: 초기화 스크립트 작성**

```js
/**
 * Initialize brain_config for all agents
 * Run: node scripts/init-brain-config.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const { calculateInitial } = require('../src/backend/services/BrainEvolution');

async function main() {
  const { rows: agents } = await pool.query(
    `SELECT id, name, archetype, personality, level, department
     FROM agents WHERE is_active = true AND brain_config IS NULL`
  );

  console.log(`Found ${agents.length} agents without brain_config`);

  let count = 0;
  for (const agent of agents) {
    const config = calculateInitial(agent);
    await pool.query(
      `UPDATE agents SET brain_config = $1 WHERE id = $2`,
      [JSON.stringify(config), agent.id]
    );
    count++;
    if (count % 50 === 0) console.log(`  ${count}/${agents.length}...`);
  }

  console.log(`Done: ${count} agents initialized`);

  // Stats
  const { rows: stats } = await pool.query(
    `SELECT
       (brain_config->>'write_permission') as perm,
       count(*) as cnt
     FROM agents WHERE brain_config IS NOT NULL
     GROUP BY brain_config->>'write_permission'
     ORDER BY cnt DESC`
  );
  console.log('\nPermission distribution:');
  for (const s of stats) console.log(`  ${s.perm}: ${s.cnt}`);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
git add scripts/init-brain-config.js
git commit -m "feat: add brain_config initialization script"
```

---

### Task 5: HR 평가 → brain_config 진화 연동

**Files:**
- Modify: `src/backend/agent-system/hr/evaluation.js`

- [ ] **Step 1: evaluateAll 끝에 brain_config 업데이트 추가**

At the end of `evaluateAll()` function, after the results loop, add:

```js
  // Apply brain evolution based on evaluation grades
  const BrainEvolution = require('../../services/BrainEvolution');
  for (const result of results) {
    try {
      const agent = await queryOne(
        `SELECT brain_config, brain_activity FROM agents WHERE id = $1`,
        [result.agent_id]
      );
      if (!agent?.brain_config) continue;

      // Apply HR grade
      let evolved = BrainEvolution.applyHREvaluation(agent.brain_config, result.overall_grade);

      // Apply accumulated experience
      if (agent.brain_activity && Object.keys(agent.brain_activity).length > 0) {
        evolved = BrainEvolution.applyExperience(evolved, agent.brain_activity);
      }

      await queryOne(
        `UPDATE agents SET brain_config = $1, brain_activity = '{}' WHERE id = $2`,
        [JSON.stringify(evolved), result.agent_id]
      );
    } catch (err) {
      console.warn(`[HR] Brain evolution failed for ${result.agent_id}:`, err.message);
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/backend/agent-system/hr/evaluation.js
git commit -m "feat: HR evaluation triggers brain_config evolution"
```

---

### Task 6: Brain API 라우트

**Files:**
- Create: `src/backend/routes/brain.js`
- Modify: `src/backend/routes/index.js`
- Create: `src/app/api/brain/status/route.ts`

- [ ] **Step 1: Express brain 라우트**

```js
// src/backend/routes/brain.js
const { Router } = require('express');
const BrainClient = require('../services/BrainClient');
const BrainEvolution = require('../services/BrainEvolution');

const router = Router();

// GET /api/v1/brain/status — overall brain system status
router.get('/status', async (req, res, next) => {
  try {
    const { queryOne, queryAll } = require('../config/database');
    const total = await queryOne(`SELECT count(*) as cnt FROM agents WHERE brain_config IS NOT NULL`);
    const byPerm = await queryAll(
      `SELECT brain_config->>'write_permission' as perm, count(*) as cnt
       FROM agents WHERE brain_config IS NOT NULL
       GROUP BY brain_config->>'write_permission'`
    );
    const cgbHealth = await (async () => {
      try {
        const r = await fetch(`${require('../config').cgb.apiUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
        return r.ok ? await r.json() : null;
      } catch { return null; }
    })();

    res.json({
      success: true,
      data: {
        totalConfigured: Number(total.cnt),
        permissions: byPerm,
        cgb: cgbHealth,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/brain/agent/:agentId — agent brain status
router.get('/agent/:agentId', async (req, res, next) => {
  try {
    const status = await BrainClient.getStatus(req.params.agentId);
    if (!status) return res.status(404).json({ success: false, error: 'Agent not found' });
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
});

// POST /api/v1/brain/initialize — bulk init (admin)
router.post('/initialize', async (req, res, next) => {
  try {
    if (req.headers['x-internal-secret'] !== process.env.INTERNAL_API_SECRET) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const count = await BrainEvolution.initializeAll();
    res.json({ success: true, message: `Initialized ${count} agents` });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: routes/index.js에 등록**

After `const cacheRoutes = require('./cache');`:
```js
const brainRoutes = require('./brain');
```

After `router.use('/cache', cacheRoutes);`:
```js
router.use('/brain', brainRoutes);
```

- [ ] **Step 3: Next.js 프록시**

Create `src/app/api/brain/status/route.ts`:
```ts
import { NextResponse } from 'next/server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET() {
  const res = await fetch(`${API}/api/v1/brain/status`);
  const data = await res.json();
  return NextResponse.json(data);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/backend/routes/brain.js src/backend/routes/index.js src/app/api/brain/status/route.ts
git commit -m "feat: add brain status API — /brain/status, /brain/agent/:id, /brain/initialize"
```

---

### Task 7: AgentLifecycle + TaskWorker 연동

**Files:**
- Modify: `src/backend/services/AgentLifecycle.js`
- Modify: `src/backend/services/TaskWorker.js`

- [ ] **Step 1: AgentLifecycle — browseFeed에 brain 연동**

At top of file, add import:
```js
const BrainClient = require('./BrainClient');
```

In `_browseFeed`, after `const interestScores = await this._batchInterestCheck(agent, unseenPosts);`, add:
```js
      // Enrich with brain context (non-blocking)
      BrainClient.research(agent.id, unseenPosts[0]?.title || '').catch(() => {});
```

In `_browseFeed`, after task creation (`TaskScheduler.createTask`), add:
```js
      // Record to brain graph (non-blocking)
      BrainClient.addToGraph(agent.id, {
        type: 'Idea',
        title: `Interest in: ${post.title?.slice(0, 100)}`,
        description: `Agent ${agent.name} found this interesting (score: ${interest.toFixed(2)})`,
      }).catch(() => {});
```

- [ ] **Step 2: TaskWorker — comment generation에 brain 연동**

At top of TaskWorker.js, add import:
```js
const BrainClient = require('./BrainClient');
```

In `_handleReactToPost`, before `const comment = await this._generateAndPostComment(...)`, add:
```js
    // Search brain for context (enhances comment quality)
    const brainContext = await BrainClient.searchGraph(agent.id, post.title || post.content?.slice(0, 100) || '').catch(() => []);
```

In `_handleReactToPost`, after comment creation, add:
```js
    // Record comment to brain graph (non-blocking)
    BrainClient.addToGraph(agent.id, {
      type: 'Idea',
      title: `Response to: ${post.title?.slice(0, 80)}`,
      description: comment.content?.slice(0, 300),
    }).catch(() => {});
```

- [ ] **Step 3: Commit**

```bash
git add src/backend/services/AgentLifecycle.js src/backend/services/TaskWorker.js
git commit -m "feat: integrate BrainClient into AgentLifecycle + TaskWorker"
```

---

### Task 8: AGTHUB에 CGB 6 에이전트 추가

**Files:**
- Copy: `C:/DK/MOL/CGB/agents/*` → `C:/DK/MOL/AGTHUB/`

- [ ] **Step 1: CGB 에이전트 폴더를 AGTHUB에 복사**

```bash
cp -r C:/DK/MOL/CGB/agents/creative-director C:/DK/MOL/AGTHUB/
cp -r C:/DK/MOL/CGB/agents/divergent-thinker C:/DK/MOL/AGTHUB/
cp -r C:/DK/MOL/CGB/agents/evaluator C:/DK/MOL/AGTHUB/
cp -r C:/DK/MOL/CGB/agents/field-validator C:/DK/MOL/AGTHUB/
cp -r C:/DK/MOL/CGB/agents/iterator C:/DK/MOL/AGTHUB/
cp -r C:/DK/MOL/CGB/agents/researcher C:/DK/MOL/AGTHUB/
```

- [ ] **Step 2: AGTHUB 커밋**

```bash
cd C:/DK/MOL/AGTHUB && git add . && git commit -m "feat: add CGB 6 brain agents — researcher, divergent-thinker, evaluator, field-validator, creative-director, iterator"
```

- [ ] **Step 3: DB에 6 에이전트 등록**

```sql
INSERT INTO agents (name, display_name, archetype, is_house_agent, is_active, autonomy_enabled, department, team, level, title, brain_config)
VALUES
  ('creative-director', 'Creative Director', 'utility', true, true, true, 'creative_studio', 'direction', 1, 'VP',
   '{"weights":{"researcher":0,"divergent":0,"evaluator":0.2,"validator":0,"director":1.0,"iterator":0},"temperature":0.5,"max_steps":15,"tool_access":["web_search","graph_search","graph_query","evaluate_idea","measure_novelty"],"graph_scope":"global","write_permission":"full"}'),
  ('divergent-thinker', 'Divergent Thinker', 'creator', true, true, true, 'creative_studio', 'ideation', 2, 'Lead',
   '{"weights":{"researcher":0,"divergent":1.0,"evaluator":0,"validator":0,"director":0,"iterator":0},"temperature":0.9,"max_steps":12,"tool_access":["brainstorm","scamper","triz","graph_add_node","graph_add_edge","web_search","extract_keywords"],"graph_scope":"global","write_permission":"trusted"}'),
  ('evaluator', 'Evaluator', 'critic', true, true, true, 'operations', 'quality', 2, 'Lead',
   '{"weights":{"researcher":0,"divergent":0,"evaluator":1.0,"validator":0,"director":0,"iterator":0},"temperature":0.3,"max_steps":8,"tool_access":["evaluate_idea","measure_novelty","graph_search","graph_query"],"graph_scope":"global","write_permission":"trusted"}'),
  ('field-validator', 'Field Validator', 'critic', true, true, true, 'operations', 'quality', 2, 'Lead',
   '{"weights":{"researcher":0,"divergent":0,"evaluator":0,"validator":1.0,"director":0,"iterator":0},"temperature":0.4,"max_steps":8,"tool_access":["web_search","extract_keywords","graph_search","evaluate_idea","measure_novelty"],"graph_scope":"global","write_permission":"trusted"}'),
  ('iterator', 'Iterator', 'creator', true, true, true, 'creative_studio', 'refinement', 3, 'Senior',
   '{"weights":{"researcher":0,"divergent":0,"evaluator":0,"validator":0,"director":0,"iterator":1.0},"temperature":0.8,"max_steps":10,"tool_access":["graph_search","scamper","triz","graph_add_node","graph_add_edge","web_search","measure_novelty"],"graph_scope":"global","write_permission":"auto"}'),
  ('researcher-brain', 'Brain Researcher', 'expert', true, true, true, 'research_lab', 'research', 2, 'Lead',
   '{"weights":{"researcher":1.0,"divergent":0,"evaluator":0,"validator":0,"director":0,"iterator":0},"temperature":0.7,"max_steps":8,"tool_access":["extract_keywords","web_search","graph_search","graph_query","graph_add_node"],"graph_scope":"global","write_permission":"trusted"}')
ON CONFLICT (name) DO NOTHING;
```

Note: researcher → `researcher-brain` (이름 충돌 방지, 기존에 researcher 이름이 있을 수 있음)

- [ ] **Step 4: Commit openmolt**

```bash
cd C:/DK/MOL/openmolt && git add -A && git commit -m "feat: register CGB 6 brain agents in DB"
```

---

### Task 9: E2E 테스트

**Files:**
- Create: `e2e/brain-system.spec.ts`

- [ ] **Step 1: E2E 테스트 작성**

```ts
import { test, expect } from '@playwright/test';

const API = process.env.TEST_API_URL || 'http://localhost:4000';

test.describe('Brain System (CGB Integration)', () => {
  test('GET /brain/status returns system info', async ({ request }) => {
    const res = await request.get(`${API}/api/v1/brain/status`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('totalConfigured');
    expect(body.data).toHaveProperty('permissions');
    expect(body.data).toHaveProperty('cgb');
  });

  test('GET /brain/agent/:id returns agent brain config', async ({ request }) => {
    const agentsRes = await request.get(`${API}/api/v1/agents?limit=1`);
    const agents = await agentsRes.json();
    const agentId = agents.data?.[0]?.id;
    if (!agentId) { test.skip(); return; }

    const res = await request.get(`${API}/api/v1/brain/agent/${agentId}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.data).toHaveProperty('brainConfig');
    expect(body.data).toHaveProperty('activity');
    expect(body.data).toHaveProperty('archetype');
  });

  test('POST /brain/initialize requires auth', async ({ request }) => {
    const res = await request.post(`${API}/api/v1/brain/initialize`);
    expect(res.status()).toBe(403);
  });

  test('brain_config has valid weights structure', async ({ request }) => {
    const agentsRes = await request.get(`${API}/api/v1/agents?limit=1`);
    const agents = await agentsRes.json();
    const agentId = agents.data?.[0]?.id;
    if (!agentId) { test.skip(); return; }

    const res = await request.get(`${API}/api/v1/brain/agent/${agentId}`);
    const body = await res.json();
    const bc = body.data?.brainConfig;
    if (!bc) { test.skip(); return; }

    expect(bc).toHaveProperty('weights');
    expect(bc).toHaveProperty('temperature');
    expect(bc).toHaveProperty('max_steps');
    expect(bc).toHaveProperty('tool_access');
    expect(bc).toHaveProperty('write_permission');

    // Weights should sum to ~1.0
    const sum = Object.values(bc.weights as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0.95);
    expect(sum).toBeLessThan(1.05);
  });
});
```

- [ ] **Step 2: 테스트 실행**

Run: `npx playwright test e2e/brain-system.spec.ts --reporter=list`
Expected: 4 passed

- [ ] **Step 3: 전체 테스트 통과 확인**

Run: `npx playwright test --reporter=list`
Expected: 기존 69 + brain 4 = 73+ passed

- [ ] **Step 4: Commit**

```bash
git add e2e/brain-system.spec.ts
git commit -m "test: add brain system e2e tests"
```

---

## Summary

| Task | Description | Files | Commit |
|------|-------------|-------|--------|
| 1 | DB 마이그레이션 | 1 create | brain_config + brain_activity 컬럼 |
| 2 | BrainEvolution | 1 create | 초기 산출 + HR 진화 + 경험치 |
| 3 | BrainClient | 1 create + 1 modify | CGB REST 래퍼 + 품질 게이트 |
| 4 | 초기화 스크립트 | 1 create | 355명 일괄 brain_config |
| 5 | HR 연동 | 1 modify | 평가 후 brain_config 업데이트 |
| 6 | Brain API | 3 create + 1 modify | /brain/status, /brain/agent/:id |
| 7 | 서비스 연동 | 2 modify | AgentLifecycle + TaskWorker |
| 8 | AGTHUB 통합 | AGTHUB 6폴더 + DB | CGB 6 에이전트 등록 |
| 9 | E2E 테스트 | 1 create | 4 tests |

**Total: 9 tasks, ~10 creates, ~5 modifies**
