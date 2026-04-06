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

  const graphResult = await cgbFetch(
    `/api/v1/graph/search?q=${encodeURIComponent(topic)}&domain=${encodeURIComponent(bc.graph_scope)}&limit=5`
  );
  return {
    graphContext: graphResult?.data?.results || graphResult?.data?.nodes || [],
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

/** Extract key concepts from content → Concept nodes + USES_CONCEPT edges
 *  확률은 brain_config.weights.researcher 비례 (연구형 에이전트일수록 더 자주 학습)
 */
async function extractConcepts(agentId, ideaNodeId, node, bc) {
  const text = `${node.title || ''} ${node.description || ''}`.trim();
  if (text.length < 30) return;

  // 에이전트 특성 기반 확률: researcher weight가 높으면 더 자주 학습
  const researchWeight = bc.weights?.researcher || 0.1;
  const extractChance = Math.min(researchWeight * 0.5, 0.25); // max 25%
  if (Math.random() > extractChance) return;

  // 에이전트 특성에 맞는 추출 방식
  const style = (bc.weights?.divergent || 0) > (bc.weights?.researcher || 0)
    ? 'creative' : 'analytical';

  const systemPrompt = style === 'creative'
    ? 'You find creative connections and novel concepts. Return ONLY a JSON array of 2-3 concepts with unexpected angles. Each: {"name": "short name", "description": "creative insight"}. No markdown.'
    : 'You extract key factual concepts and domain knowledge. Return ONLY a JSON array of 2-3 concepts. Each: {"name": "short name", "description": "factual explanation"}. No markdown.';

  try {
    const google = require('../nodes/llm-call/providers/google');
    const raw = await Promise.race([
      google.call('gemini-2.5-flash-lite',
        systemPrompt,
        `Extract key concepts from: "${text.slice(0, 500)}"`,
        { maxOutputTokens: 200 }
      ),
      new Promise(r => setTimeout(() => r(null), 8000)),
    ]);

    if (!raw) return;

    // Parse JSON from LLM response
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return;
    const concepts = JSON.parse(match[0]);
    if (!Array.isArray(concepts) || concepts.length === 0) return;

    for (const concept of concepts.slice(0, 3)) {
      if (!concept.name) continue;

      // Create or reuse Concept node (deterministic ID by name)
      const conceptId = `concept-${concept.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;

      const conceptResult = await cgbFetch('/api/v1/graph/nodes', {
        method: 'POST',
        body: {
          id: conceptId,
          type: 'Concept',
          title: concept.name,
          description: concept.description || concept.name,
          agent_id: agentId,
          domain: bc.graph_scope,
          layer: 1, // domain level (shared within department)
        },
        timeout: 10000,
      });

      if (conceptResult?.data) {
        // Idea → USES_CONCEPT → Concept
        cgbFetch('/api/v1/graph/edges', {
          method: 'POST',
          body: { sourceId: ideaNodeId, targetId: conceptId, type: 'USES_CONCEPT' },
          timeout: 10000,
        }).catch(() => {});

        // Agent → OWNS → Concept
        cgbFetch('/api/v1/graph/edges', {
          method: 'POST',
          body: { sourceId: `agent-${agentId}`, targetId: conceptId, type: 'OWNS' },
          timeout: 10000,
        }).catch(() => {});
      }
    }

    await trackActivity(agentId, 'concept_extract');
  } catch (err) {
    // Silent fail — concept extraction is optional
  }
}

const _ensuredAgents = new Map(); // id → timestamp
const ENSURE_TTL = 3600_000; // 1 hour

async function ensureAgentNode(agentId, bc) {
  const now = Date.now();
  if (_ensuredAgents.has(agentId) && (now - _ensuredAgents.get(agentId)) < ENSURE_TTL) return;

  // Domain 노드도 함께 보장
  ensureDomainNode(bc.graph_scope);

  const agentNodeId = `agent-${agentId}`;
  const result = await cgbFetch('/api/v1/graph/nodes', {
    method: 'POST',
    body: {
      id: agentNodeId,
      type: 'Agent',
      title: agentNodeId,
      description: `Agent in ${bc.graph_scope}`,
      agent_id: agentId,
      domain: bc.graph_scope,
      layer: 2,
    },
    timeout: 10000,
  });

  if (result) {
    _ensuredAgents.set(agentId, now);
    // Agent → ACTIVE_IN → Domain
    cgbFetch('/api/v1/graph/edges', {
      method: 'POST',
      body: { sourceId: agentNodeId, targetId: `domain-${bc.graph_scope}`, type: 'ACTIVE_IN' },
      timeout: 10000,
    }).catch(() => {});
  }
}

const _ensuredDomains = new Map(); // scope → timestamp

function ensureDomainNode(domainScope) {
  if (!domainScope) return;
  const now = Date.now();
  if (_ensuredDomains.has(domainScope) && (now - _ensuredDomains.get(domainScope)) < ENSURE_TTL) return;

  const domainId = `domain-${domainScope}`;
  const title = domainScope.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  cgbFetch('/api/v1/graph/nodes', {
    method: 'POST',
    body: {
      id: domainId,
      type: 'Domain',
      title,
      description: `Domain: ${title}`,
      domain: domainScope,
      layer: 0,
    },
    timeout: 10000,
  }).then(result => {
    if (result) _ensuredDomains.set(domainScope, now);
  }).catch(() => {});
}

async function createEpisode(agentId) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  const episodeId = `episode-${agentId}-${Date.now()}`;
  const result = await cgbFetch('/api/v1/graph/nodes', {
    method: 'POST',
    body: {
      id: episodeId,
      type: 'Episode',
      title: `Wakeup ${new Date().toISOString().slice(0, 16)}`,
      description: `Agent wakeup session`,
      agent_id: agentId,
      domain: bc.graph_scope,
      layer: 2,
    },
    timeout: 10000,
  });

  if (result?.data) {
    const agentNodeId = `agent-${agentId}`;

    // Agent → OWNS → Episode
    cgbFetch('/api/v1/graph/edges', {
      method: 'POST',
      body: { sourceId: agentNodeId, targetId: episodeId, type: 'OWNS' },
      timeout: 10000,
    }).catch(() => {});

    // FOLLOWED_BY: 이전 Episode → 현재 Episode (시간순 체인)
    cgbFetch(`/api/v1/graph/search?q=Wakeup&agent_id=${agentId}&limit=2`).then(prev => {
      const prevEpisodes = (prev?.data?.results || prev?.data?.nodes || [])
        .filter(n => n.type === 'Episode' && n.id !== episodeId);
      if (prevEpisodes.length > 0) {
        cgbFetch('/api/v1/graph/edges', {
          method: 'POST',
          body: { sourceId: prevEpisodes[0].id, targetId: episodeId, type: 'FOLLOWED_BY' },
          timeout: 10000,
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  return episodeId;
}

async function addToGraph(agentId, node, episodeId = null) {
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

    // Idea → BELONGS_TO → Domain
    if (bc.graph_scope) {
      cgbFetch('/api/v1/graph/edges', {
        method: 'POST',
        body: { sourceId: result.data.id, targetId: `domain-${bc.graph_scope}`, type: 'BELONGS_TO' },
        timeout: 10000,
      }).catch(() => {});
    }

    // Link to Episode (CONTAINS edge)
    if (episodeId) {
      cgbFetch('/api/v1/graph/edges', {
        method: 'POST',
        body: { sourceId: episodeId, targetId: result.data.id, type: 'CONTAINS' },
        timeout: 10000,
      }).catch(() => {});
    }

    // Create INSPIRED_BY edge if parentId provided
    if (node.parentId) {
      cgbFetch('/api/v1/graph/edges', {
        method: 'POST',
        body: { sourceId: result.data.id, targetId: node.parentId, type: 'INSPIRED_BY' },
        timeout: 10000,
      }).catch(() => {});
    }

    // Connect to related nodes (same topic → SIMILAR_TO via embedding search)
    const searchTitle = (node.title || '').replace(/^(Interest|Response):\s*/, '');
    if (searchTitle.length > 10) {
      const related = await cgbFetch(
        `/api/v1/graph/search?q=${encodeURIComponent(searchTitle.slice(0, 80))}&limit=5`
      );
      const relatedNodes = related?.data?.results || [];
      for (const other of relatedNodes) {
        if (other.id !== result.data.id) {
          cgbFetch('/api/v1/graph/edges', {
            method: 'POST',
            body: { sourceId: result.data.id, targetId: other.id, type: 'SIMILAR_TO' },
            timeout: 10000,
          }).catch(() => {});
          break; // 가장 유사한 1개만
        }
      }
    }

    // Concept extraction moved to CGB cron/reflect (batch, 100% coverage)

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
      `UPDATE agents SET brain_activity = COALESCE(brain_activity, '{}'::jsonb) || jsonb_build_object($1::text, (COALESCE((brain_activity->>$1::text)::int, 0) + 1)::text::jsonb)
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

module.exports = { research, brainstorm, evaluate, addToGraph, searchGraph, trackActivity, getBrainConfig, getStatus, createEpisode };
