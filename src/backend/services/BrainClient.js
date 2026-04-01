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
  if (CGB_KEY) headers['Authorization'] = `Bearer ${CGB_KEY}`;

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

  const BrainEvolution = require('./BrainEvolution');
  const bc = BrainEvolution.calculateInitial(agent);
  await queryOne(`UPDATE agents SET brain_config = $1 WHERE id = $2`, [JSON.stringify(bc), agentId]);
  return bc;
}

async function research(agentId, topic) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  const graphResult = await cgbFetch(`/api/v1/graph/search?q=${encodeURIComponent(topic)}`);
  return {
    graphContext: graphResult?.data?.nodes || [],
    brainConfig: bc,
  };
}

async function brainstorm(agentId, topic, options = {}) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  const result = await cgbFetch('/api/v1/creative/brainstorm', {
    method: 'POST',
    body: { topic, count: options.count || 5, temperature: bc.temperature, domain: bc.graph_scope },
    timeout: 60000,
  });

  await trackActivity(agentId, 'brainstorm');
  return result?.data || null;
}

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

async function ensureAgentNode(agentId, bc) {
  const agentNodeId = `agent-${agentId}`;
  // Fire-and-forget: create Agent node in CGB if not exists
  cgbFetch('/api/v1/graph/nodes', {
    method: 'POST',
    body: {
      type: 'Agent',
      title: agentNodeId,
      description: `Agent in ${bc.graph_scope}`,
      agent_id: agentId,
      domain: bc.graph_scope,
      layer: 2,
    },
    timeout: 10000,
  }).catch(() => {});
}

async function addToGraph(agentId, node) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  // Ensure Agent node exists in CGB
  ensureAgentNode(agentId, bc);

  const enrichedNode = { ...node, agent_id: agentId, domain: bc.graph_scope, layer: 2 };

  const result = await cgbFetch('/api/v1/graph/nodes', {
    method: 'POST',
    body: enrichedNode,
    timeout: 15000,
  });

  if (result?.data) {
    await trackActivity(agentId, 'graph_add');

    // Create OWNS edge (Agent → Idea)
    const agentNodeId = `agent-${agentId}`;
    cgbFetch('/api/v1/graph/edges', {
      method: 'POST',
      body: { sourceId: agentNodeId, targetId: result.data.id, type: 'OWNS' },
      timeout: 10000,
    }).catch(() => {});

    // Create INSPIRED_BY edge if parentId provided
    if (node.parentId) {
      cgbFetch('/api/v1/graph/edges', {
        method: 'POST',
        body: { sourceId: result.data.id, targetId: node.parentId, type: 'INSPIRED_BY' },
        timeout: 10000,
      }).catch(() => {});
    }

    // Promote to domain layer if score >= 40
    const score = result.data.score || 0;
    if ((bc.write_permission === 'full' || bc.write_permission === 'trusted' || bc.write_permission === 'auto') && score >= 40) {
      cgbFetch('/api/v1/graph/nodes', {
        method: 'POST',
        body: { ...enrichedNode, layer: 1 },
        timeout: 10000,
      }).catch(() => {});
    }
  }

  return result?.data || null;
}

async function searchGraph(agentId, query) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return [];

  const result = await cgbFetch(
    `/api/v1/graph/search?q=${encodeURIComponent(query)}&domain=${bc.graph_scope}`
  );
  return result?.data?.nodes || [];
}

async function trackActivity(agentId, type) {
  try {
    await queryOne(
      `UPDATE agents SET brain_activity = COALESCE(brain_activity, '{}'::jsonb) || jsonb_build_object($1, COALESCE((brain_activity->>$1)::int, 0) + 1)
       WHERE id = $2`,
      [type, agentId]
    );
  } catch (err) {
    console.warn(`[BrainClient] trackActivity error:`, err.message);
  }
}

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
  };
}

module.exports = { research, brainstorm, evaluate, addToGraph, searchGraph, trackActivity, getBrainConfig, getStatus };
