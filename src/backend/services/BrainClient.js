/**
 * BrainClient — CGB REST API wrapper
 * Every agent activity goes through here to use the CGB brain.
 */

const config = require('../config');
const { queryOne } = require('../config/database');

const CGB_URL = config.cgb?.apiUrl || 'http://localhost:3001';
const CGB_KEY = config.cgb?.apiKey || '';

/** Edge creation with 1 retry (FK may fail if node not yet committed) */
async function cgbEdge(sourceId, targetId, type) {
  const body = { sourceId, targetId, type };
  const result = await cgbFetch('/api/v1/graph/edges', { method: 'POST', body, timeout: 10000 });
  if (result) return result;
  // Retry once after 300ms (Supabase commit lag)
  await new Promise(r => setTimeout(r, 300));
  return cgbFetch('/api/v1/graph/edges', { method: 'POST', body, timeout: 10000 });
}

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

  // 확률: 기본 50%, researcher 계열은 80%까지
  const researchWeight = bc.weights?.researcher || 0.1;
  const extractChance = Math.min(0.5 + researchWeight, 0.8);
  if (Math.random() > extractChance) return;

  // 에이전트 특성에 맞는 추출 방식
  const style = (bc.weights?.divergent || 0) > (bc.weights?.researcher || 0)
    ? 'creative' : 'analytical';

  const systemPrompt = style === 'creative'
    ? 'You find creative connections and novel concepts. Return ONLY a JSON array of 2-3 concepts with unexpected angles. Each: {"name": "short name (2-4 words)", "description": "creative insight in 1-2 full sentences (minimum 20 chars)"}. No markdown, no truncation.'
    : 'You extract key factual concepts and domain knowledge. Return ONLY a JSON array of 2-3 concepts. Each: {"name": "short name (2-4 words)", "description": "factual explanation in 1-2 full sentences (minimum 20 chars)"}. No markdown, no truncation.';

  try {
    const userPrompt = `Extract key concepts from: "${text.slice(0, 500)}"`;
    let raw;
    if (process.env.DASHSCOPE_API_KEY) {
      const openaiCompat = require('../nodes/llm-call/providers/openai-compat');
      raw = await Promise.race([
        openaiCompat.call(process.env.DASHSCOPE_MODEL || 'qwen-turbo', systemPrompt, userPrompt, { provider: 'dashscope', maxOutputTokens: 512 }),
        new Promise(r => setTimeout(() => r(null), 10000)),
      ]);
    } else {
      const openaiCompat = require('../nodes/llm-call/providers/openai-compat');
      raw = await Promise.race([
        openaiCompat.call('qwen-turbo', systemPrompt, userPrompt, { provider: 'dashscope', maxOutputTokens: 512 }),
        new Promise(r => setTimeout(() => r(null), 10000)),
      ]);
    }

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

    // Cross-link: search for related Concepts in graph
    if (concepts.length >= 2) {
      for (let i = 0; i < concepts.length - 1; i++) {
        const id1 = `concept-${concepts[i].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;
        const id2 = `concept-${concepts[i + 1].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;
        cgbFetch('/api/v1/graph/edges', {
          method: 'POST',
          body: { sourceId: id1, targetId: id2, type: 'RELATED_TO' },
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
    // nodes API는 created_at.desc 정렬 → limit=2로 현재+이전 Episode 조회
    cgbFetch(`/api/v1/graph/nodes?type=Episode&agent_id=${agentId}&limit=2`).then(prev => {
      const prevEpisodes = (prev?.data?.nodes || [])
        .filter(n => n.id !== episodeId);
      if (prevEpisodes.length > 0) {
        cgbFetch('/api/v1/graph/edges', {
          method: 'POST',
          body: { sourceId: prevEpisodes[0].id, targetId: episodeId, type: 'FOLLOWED_BY' },
          timeout: 10000,
        }).catch(e => console.warn(`BrainClient: FOLLOWED_BY edge failed: ${e.message}`));
      }
    }).catch(e => console.warn(`BrainClient: FOLLOWED_BY lookup failed: ${e.message}`));
  }

  return episodeId;
}

async function addToGraph(agentId, node, episodeId = null, options = {}) {
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

    // Phase 3: CROSS_REFERENCES edge if inspired by peer insight
    if (node.peerInsightId) {
      cgbFetch('/api/v1/graph/edges', {
        method: 'POST',
        body: { sourceId: result.data.id, targetId: node.peerInsightId, type: 'CROSS_REFERENCES' },
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

    // Connect to related nodes (skip in bulk ingestion mode — saves ~3 API calls per node)
    if (!options.skipSimilarSearch) {
      const searchTitle = (node.title || '').replace(/^(Interest|Response):\s*/, '');
      if (searchTitle.length > 10) {
        const related = await cgbFetch(
          `/api/v1/graph/search?q=${encodeURIComponent(searchTitle.slice(0, 80))}&limit=5`
        );
        const relatedNodes = related?.data?.results || [];
        let linked = 0;
        for (const other of relatedNodes) {
          if (other.id !== result.data.id && linked < 3) {
            cgbFetch('/api/v1/graph/edges', {
              method: 'POST',
              body: { sourceId: result.data.id, targetId: other.id, type: 'SIMILAR_TO' },
              timeout: 10000,
            }).catch(() => {});
            linked++;
          }
        }
      }
    }

    // Extract concepts from this idea (skip in ingestion mode — TextIngestion does its own)
    if (!options.skipSimilarSearch) {
      extractConcepts(agentId, result.data.id, node, bc);
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

/**
 * Record an evolution event in CGB graph.
 * Creates an Evolution node linked to the agent.
 * @origin: Phase 4 — CGB integration for mol-engine evolution
 */
async function recordEvolution(agentId, evolution) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  ensureAgentNode(agentId, bc);

  const evoId = `evo-${agentId}-${Date.now()}`;
  // Merge evolution.metadata (score_before/after, decision, config_delta) into node metadata
  const evoMetadata = {
    evolution_type: evolution.type,
    ...(evolution.metadata || {}),
  };
  const result = await cgbFetch('/api/v1/graph/nodes', {
    method: 'POST',
    body: {
      id: evoId,
      type: 'Idea',
      title: `Evolution: ${evolution.type} ${evolution.target}`,
      description: `${evolution.reason} (${evolution.type})`,
      agent_id: agentId,
      domain: bc.graph_scope,
      layer: 2,
      metadata: evoMetadata,
    },
    timeout: 10000,
  });

  if (result?.data) {
    // Agent → OWNS → Evolution node
    cgbFetch('/api/v1/graph/edges', {
      method: 'POST',
      body: { sourceId: `agent-${agentId}`, targetId: evoId, type: 'OWNS' },
      timeout: 10000,
    }).catch(() => {});

    await trackActivity(agentId, 'evolution');
  }

  return result?.data || null;
}

/**
 * Call a domain MCP tool via CGB gateway.
 * Results are automatically saved to the CGB graph.
 */
async function domainCall(agentId, domainId, tool, args, options = {}) {
  const result = await cgbFetch(`/api/v1/domains/${encodeURIComponent(domainId)}/call`, {
    method: 'POST',
    body: {
      tool,
      args,
      agent_id: agentId,
      save_to_graph: options.saveToGraph !== false,
      api_key: options.apiKey,
    },
    timeout: 60000,
  });
  return result?.data || null;
}

/**
 * List available domain MCP services.
 */
async function listDomains() {
  const result = await cgbFetch('/api/v1/domains');
  return result?.data?.domains || [];
}

/**
 * List available tools for a domain.
 */
async function domainTools(domainId) {
  const result = await cgbFetch(`/api/v1/domains/${encodeURIComponent(domainId)}/tools`);
  return result?.data?.tools || [];
}

// ─────────────────────────────────────────────
// Story-specific APIs (StoryWriter pipeline support)
// Papers: Long Story KG (2025), KG-Guided Storytelling, SCORE
// ─────────────────────────────────────────────

/**
 * Get story knowledge graph subgraph for a series.
 * Returns related Episode, Concept, Idea nodes for continuity.
 * @param {string} agentId
 * @param {string} seriesTitle
 * @param {object} [options] - { limit, nodeTypes }
 */
async function getStoryKG(agentId, seriesTitle, options = {}) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return { nodes: [], edges: [] };

  const limit = options.limit || 20;
  const result = await cgbFetch(
    `/api/v1/graph/search?q=${encodeURIComponent(seriesTitle)}&domain=${encodeURIComponent(bc.graph_scope)}&limit=${limit}`
  );
  return {
    nodes: result?.data?.results || result?.data?.nodes || [],
    edges: [],
  };
}

/**
 * Suggest a plot twist by finding related but unexpected concepts in the graph.
 * Paper: Long Story KG — introduce obstacle nodes related to main goal.
 * @param {string} agentId
 * @param {string} currentPlot - Current story state description
 * @returns {{ suggestions: Array<{ concept, connection, twistType }> }}
 */
async function suggestTwist(agentId, currentPlot) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return { suggestions: [] };

  // Use CGB brainstorm to find unexpected angles
  const result = await cgbFetch('/api/v1/creative/brainstorm', {
    method: 'POST',
    body: {
      topic: `Plot twist for: ${currentPlot}`,
      count: 5,
      temperature: 0.9, // Higher for more creative twists
      domain: bc.graph_scope,
    },
    timeout: 60000,
  });

  const ideas = result?.data?.ideas || result?.data || [];
  return {
    suggestions: Array.isArray(ideas) ? ideas.slice(0, 3).map(idea => ({
      concept: idea.title || idea.name || idea,
      connection: idea.description || '',
      twistType: 'obstacle', // Long Story KG paper: obstacle nodes
    })) : [],
  };
}

/**
 * Check story coherence using CGB evaluate endpoint.
 * Paper: SCORE — validation of contextual consistency.
 * @param {string} agentId
 * @param {string} episodeText
 * @param {string} outlineSummary
 * @returns {{ coherent, score, issues }}
 */
async function checkCoherence(agentId, episodeText, outlineSummary) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return { coherent: true, score: 0, issues: [] };

  const result = await cgbFetch('/api/v1/creative/evaluate', {
    method: 'POST',
    body: {
      idea: `Episode text (${episodeText.length} chars): ${episodeText.slice(0, 2000)}`,
      domain: bc.graph_scope,
    },
    timeout: 30000,
  });

  const evalData = result?.data || {};
  return {
    coherent: (evalData.score || 0) >= 0.6,
    score: evalData.score || 0,
    issues: evalData.weaknesses || [],
  };
}

/**
 * Get genre-specific patterns from ingested reference material in CGB.
 * @param {string} agentId
 * @param {string} genre
 * @returns {{ patterns, structures, archetypes }}
 */
async function getGenrePatterns(agentId, genre) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return { patterns: [], structures: [], archetypes: [] };

  const result = await cgbFetch(
    `/api/v1/graph/search?q=${encodeURIComponent(genre + ' story pattern structure')}&domain=${encodeURIComponent(bc.graph_scope)}&limit=10`
  );

  const nodes = result?.data?.results || result?.data?.nodes || [];
  return {
    patterns: nodes.filter(n => n.type === 'Concept'),
    structures: nodes.filter(n => n.type === 'Idea'),
    archetypes: nodes.filter(n => n.type === 'Agent' || n.type === 'Domain'),
  };
}

// ─────────────────────────────────────────────
// Novel Domain Graph Builder
// Papers: Hierarchical KG for Story (ICIDS 2025) — 3-tier narrative graph
// Uses CGB existing types: Domain→Topic→Idea + Concept + edges
// ─────────────────────────────────────────────

/**
 * Create a Topic node for a series (Level 1 in hierarchy).
 * Topic = series. Links to Domain via BELONGS_TO.
 */
async function createSeriesTopic(agentId, series) {
  const bc = await getBrainConfig(agentId);
  const topicId = `topic-series-${series.id}`;

  const result = await cgbFetch('/api/v1/graph/nodes', {
    method: 'POST',
    body: {
      id: topicId,
      type: 'Topic',
      title: series.title,
      description: series.synopsis || series.description || '',
      agent_id: agentId,
      domain: bc?.graph_scope || 'creative',
      layer: 1,
    },
    timeout: 15000,
  });

  // Topic → BELONGS_TO → "Novel Writing" Domain (find actual node ID)
  if (result?.data) {
    // Domain node was created as Idea type earlier — search for it
    const domainSearch = await cgbFetch('/api/v1/graph/search?q=Novel+Writing&limit=1');
    const domainNodeId = domainSearch?.data?.results?.[0]?.id || domainSearch?.data?.nodes?.[0]?.id;
    if (domainNodeId) {
      cgbFetch('/api/v1/graph/edges', {
        method: 'POST',
        body: { sourceId: topicId, targetId: domainNodeId, type: 'BELONGS_TO' },
      }).catch(() => {});
    }
  }

  return result?.data || null;
}

/**
 * Create a Concept node for a character.
 * Concept requires { name, description, domainIds } (not title).
 */
async function createCharacterNode(agentId, character, seriesId) {
  const bc = await getBrainConfig(agentId);
  const charSlug = Buffer.from(character.name).toString('base64url').slice(0, 12);
  const charId = `char-${seriesId.slice(0, 8)}-${charSlug}`;

  // Use custom type 'Character' — bypasses Idea's auto-ID and goes direct to store
  // CGB route: non-Idea/Concept/Session types → store.addNode with body.id preserved
  const desc = `[CHARACTER] ${character.name} (${character.age || '?'}세, ${character.role}). 성격: ${character.personality || ''}. 외모: ${character.appearance || ''}`;
  const result = await cgbFetch('/api/v1/graph/nodes', {
    method: 'POST',
    body: {
      id: charId,
      type: 'Character',
      title: `${character.name}`,
      description: desc,
      agent_id: agentId,
      domain: bc?.graph_scope || 'creative',
      layer: 1,
    },
    timeout: 15000,
  });

  // Character → BELONGS_TO → Series Topic
  if (result?.data) {
    const topicId = `topic-series-${seriesId}`;
    cgbFetch('/api/v1/graph/edges', {
      method: 'POST',
      body: { sourceId: charId, targetId: topicId, type: 'BELONGS_TO' },
    }).catch(() => {});
  }

  return result?.data || null;
}

/**
 * Create an episode node with proper hierarchy.
 * Episode = Idea node linked to Series Topic via PART_OF.
 * Previous episode linked via CAUSES (sequential).
 */
async function addEpisodeToGraph(agentId, episode, series, prevEpisodeNodeId = null) {
  const bc = await getBrainConfig(agentId);
  const nodeId = `episode-${series.id}-ep${episode.episodeNumber}`;

  const result = await cgbFetch('/api/v1/graph/nodes', {
    method: 'POST',
    body: {
      type: 'Idea',
      id: nodeId,
      title: `[${series.genre}] ${series.title} ep${episode.episodeNumber}: ${episode.title}`,
      description: (episode.content || '').slice(0, 500),
      agent_id: agentId,
      domain: bc?.graph_scope || 'creative',
      layer: 1,
      metadata: {
        seriesId: series.id,
        episodeNumber: episode.episodeNumber,
        genre: series.genre,
        wordCount: episode.wordCount,
        qualityScore: episode.qualityScore,
        sentiment: episode.sentiment,
        pipelineType: episode.pipelineType || 'storywriter',
      },
    },
    timeout: 15000,
  });

  if (result?.data) {
    // Episode → PART_OF → Series Topic
    const topicId = `topic-series-${series.id}`;
    cgbEdge(nodeId, topicId, 'PART_OF').catch(() => {});

    // Episode → CAUSES → Previous Episode (sequential chain)
    if (prevEpisodeNodeId) {
      cgbEdge(prevEpisodeNodeId, nodeId, 'CAUSES').catch(() => {});
    }

    // Agent → GENERATED_BY → Episode
    cgbEdge(`agent-${agentId}`, nodeId, 'GENERATED_BY').catch(() => {});
  }

  return result?.data ? nodeId : null;
}

/**
 * Initialize full novel graph structure for a new series.
 * Creates: Domain check → Topic → Character Concepts → edges
 */
async function initSeriesGraph(agentId, series) {
  console.log(`[BrainClient] Initializing novel graph for "${series.title}"...`);

  // 1. Create Topic for series
  await createSeriesTopic(agentId, series);

  // 2. Create Character Concept nodes
  if (series.character_sheet) {
    const chars = typeof series.character_sheet === 'string'
      ? JSON.parse(series.character_sheet) : series.character_sheet;
    for (const c of chars) {
      await createCharacterNode(agentId, c, series.id);
    }

    // 3. Character relationship edges
    for (let i = 0; i < chars.length; i++) {
      for (let j = i + 1; j < chars.length; j++) {
        const slug1 = Buffer.from(chars[i].name).toString('base64url').slice(0, 12);
        const slug2 = Buffer.from(chars[j].name).toString('base64url').slice(0, 12);
        const id1 = `char-${series.id.slice(0, 8)}-${slug1}`;
        const id2 = `char-${series.id.slice(0, 8)}-${slug2}`;
        cgbFetch('/api/v1/graph/edges', {
          method: 'POST',
          body: { sourceId: id1, targetId: id2, type: 'SIMILAR_TO', metadata: { relationship: 'same_series' } },
        }).catch(() => {});
      }
    }
  }

  console.log(`[BrainClient] ✅ Novel graph initialized for "${series.title}"`);
}

// ─────────────────────────────────────────────
// RL Feedback Loop — Evaluation → CGB Graph
// Papers: SCORE (2025) — evaluation-driven improvement
//         Anthropic Harness — "separating the agent doing work from the agent judging it"
// ─────────────────────────────────────────────

/**
 * Record evaluation result in CGB graph as feedback node.
 * Creates: Evaluation node → EVALUATES → Episode node
 * High scores: promote episode content to style reference (Level 2 learning)
 * Low scores: store weaknesses as anti-patterns for next generation
 *
 * @param {string} agentId
 * @param {object} evaluation - { scores, overallScore, feedback, strengths, weaknesses }
 * @param {string} episodeNodeId - CGB node ID of the evaluated episode
 * @param {object} series - { id, title, genre }
 * @returns {{ nodeId, promoted }}
 */
async function recordEvaluation(agentId, evaluation, episodeNodeId, series) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  const evalId = `eval-${series.id.slice(0, 8)}-${Date.now()}`;
  const scores = evaluation.scores || {};
  const scoreStr = Object.entries(scores).map(([k, v]) => `${k}:${v}/5`).join(', ');

  const result = await cgbFetch('/api/v1/graph/nodes', {
    method: 'POST',
    body: {
      id: evalId,
      type: 'Idea',
      title: `[eval] ${series.title} — ${evaluation.overallScore}/5 (${scoreStr})`,
      description: [
        `Overall: ${evaluation.overallScore}/5`,
        evaluation.strengths?.length ? `Strengths: ${evaluation.strengths.join('; ')}` : '',
        evaluation.weaknesses?.length ? `Weaknesses: ${evaluation.weaknesses.join('; ')}` : '',
        evaluation.feedback || '',
      ].filter(Boolean).join('\n'),
      agent_id: agentId,
      domain: bc.graph_scope || 'creative',
      layer: 1,
      metadata: {
        type: 'evaluation',
        seriesId: series.id,
        overallScore: evaluation.overallScore,
        scores,
        passed: evaluation.passed,
      },
    },
    timeout: 15000,
  });

  let promoted = false;

  if (result?.data) {
    // Evaluation → EVALUATES → Episode
    if (episodeNodeId) {
      cgbEdge(evalId, episodeNodeId, 'EVALUATES').catch(() => {});
    }

    // Eval → BELONGS_TO → Series Topic
    const topicId = `topic-series-${series.id}`;
    cgbEdge(evalId, topicId, 'BELONGS_TO').catch(() => {});

    // RL Logic: High score → promote good patterns; Low score → store anti-patterns
    if (evaluation.overallScore >= 4.0 && evaluation.strengths?.length) {
      promoted = true;
      await cgbFetch('/api/v1/graph/nodes', {
        method: 'POST',
        body: {
          type: 'Idea',
          title: `[${series.genre}/good-pattern] ${series.title} — verified quality`,
          description: `Strengths from ${evaluation.overallScore}/5 evaluation:\n${evaluation.strengths.join('\n')}`,
          agent_id: agentId,
          domain: bc.graph_scope || 'creative',
          layer: 1,
          metadata: { patternType: 'good', seriesId: series.id, score: evaluation.overallScore },
        },
        timeout: 10000,
      }).catch(() => {});
    }

    if (evaluation.overallScore < 3.0 && evaluation.weaknesses?.length) {
      await cgbFetch('/api/v1/graph/nodes', {
        method: 'POST',
        body: {
          type: 'Idea',
          title: `[${series.genre}/anti-pattern] ${series.title} — avoid these`,
          description: `Weaknesses from ${evaluation.overallScore}/5 evaluation:\n${evaluation.weaknesses.join('\n')}\n\nFeedback: ${evaluation.feedback || ''}`,
          agent_id: agentId,
          domain: bc.graph_scope || 'creative',
          layer: 1,
          metadata: { patternType: 'anti', seriesId: series.id, score: evaluation.overallScore },
        },
        timeout: 10000,
      }).catch(() => {});
    }

    await trackActivity(agentId, 'story_eval');
  }

  return { nodeId: evalId, promoted };
}

/**
 * Get past evaluation feedback for a series from CGB graph.
 * Uses metadata queries (not title string matching) for reliable filtering.
 * @param {string} agentId
 * @param {string} seriesId - Series UUID
 * @returns {{ goodPatterns: string[], antiPatterns: string[], avgScore: number }}
 */
async function getEvalHistory(agentId, seriesId) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return { goodPatterns: [], antiPatterns: [], avgScore: 0 };

  // Query CGB with metadata filter: meta.type=evaluation, meta.seriesId=xxx
  const evalNodes = await cgbFetch(
    `/api/v1/graph/nodes?meta.type=evaluation&meta.seriesId=${encodeURIComponent(seriesId)}&domain=${encodeURIComponent(bc.graph_scope || 'creative')}&limit=10`
  );

  const nodes = evalNodes?.data?.nodes || [];
  const goodPatterns = [];
  const antiPatterns = [];
  const scores = [];

  for (const n of nodes) {
    const meta = n.metadata || {};
    const score = meta.overallScore || 0;
    if (score) scores.push(typeof score === 'number' ? score : parseFloat(score));

    // Also fetch pattern nodes linked to this series
  }

  // Fetch good/anti patterns via metadata
  const patternNodes = await cgbFetch(
    `/api/v1/graph/nodes?meta.seriesId=${encodeURIComponent(seriesId)}&meta.patternType=good&domain=${encodeURIComponent(bc.graph_scope || 'creative')}&limit=5`
  );
  for (const n of (patternNodes?.data?.nodes || [])) {
    goodPatterns.push(n.description?.slice(0, 300) || '');
  }

  const antiNodes = await cgbFetch(
    `/api/v1/graph/nodes?meta.seriesId=${encodeURIComponent(seriesId)}&meta.patternType=anti&domain=${encodeURIComponent(bc.graph_scope || 'creative')}&limit=5`
  );
  for (const n of (antiNodes?.data?.nodes || [])) {
    antiPatterns.push(n.description?.slice(0, 300) || '');
  }

  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return { goodPatterns, antiPatterns, avgScore };
}

/**
 * Get agent's recent memory context from CGB — experiential memory.
 *
 * Paper: "Memory in the Age of AI Agents" (Liu 2025, 2512.13564)
 *   → factual + experiential + working memory
 * Paper: "Agentic-KGR" (Li 2025, 2510.09156)
 *   → co-evolution: graph strengthens agent, agent strengthens graph
 *
 * Returns a formatted string for prompt injection:
 *   "너는 최근에 이런 생각/경험을 했다" 패턴.
 *
 * @param {string} agentId
 * @param {object} [options]
 * @param {number} [options.limit=8] - Max nodes to retrieve
 * @param {string} [options.topicHint] - Optional topic to focus memory
 * @returns {string|null} Formatted memory context or null
 */
async function getAgentMemory(agentId, options = {}) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  const domain = bc.graph_scope || 'creative';

  try {
    // ── 4가지 기억 소스를 병렬 조회 (3s timeout each) ──
    // Paper: "Memory in the Age of AI Agents" (Liu 2025)
    //   → factual(개념) + experiential(경험) + working(현재 맥락) 통합
    // Paper: "Agentic-KGR" (Li 2025)
    //   → 에이전트 자신의 노드 + 도메인 전체 고품질 노드 교차

    const timeout = (promise) => Promise.race([promise, new Promise(r => setTimeout(() => r(null), 3000))]);

    // Phase 3: Check if connector archetype for cross-domain bonus
    // Sequential before Promise.all — single indexed row lookup (~1-3ms), acceptable
    const agentRow = await queryOne('SELECT archetype FROM agents WHERE id = $1', [agentId]);
    const isConnector = agentRow?.archetype === 'connector';

    const [topicResult, recentResult, highScoreResult, domainConceptsResult, peerInsightsResult] = await Promise.all([
      // 1. Topic-focused semantic search (3중 RRF) — 현재 맥락 관련
      options.topicHint
        ? timeout(cgbFetch(`/api/v1/graph/search?q=${encodeURIComponent(options.topicHint)}&domain=${encodeURIComponent(domain)}&limit=4`))
        : Promise.resolve(null),

      // 2. Recent agent nodes — 이 에이전트의 최근 활동 (최신 5개)
      timeout(cgbFetch(`/api/v1/graph/nodes?agent_id=${encodeURIComponent(agentId)}&domain=${encodeURIComponent(domain)}&limit=5`)),

      // 3. Domain-wide high-quality ideas — 다른 에이전트가 만든 것 포함, 도메인 전체 우수 아이디어
      timeout(cgbFetch(`/api/v1/graph/nodes?domain=${encodeURIComponent(domain)}&type=Idea&limit=3`)),

      // 4. Domain-wide top concepts — 이 에이전트 것이 아닌 도메인 전체 핵심 개념
      timeout(cgbFetch(`/api/v1/graph/nodes?domain=${encodeURIComponent(domain)}&type=Concept&limit=4`)),

      // 5. Phase 3: Peer insights — 같은 도메인 다른 에이전트의 최근 노드
      // Paper: "Graphs Meet AI Agents" (2506.18019) — coordination via shared KG
      timeout(getCrossDomainInsights(agentId, domain, isConnector)),
    ]);

    // ── Merge + deduplicate (4소스) ──
    const seen = new Set();
    const allNodes = [];
    const addNodes = (result) => {
      const nodes = result?.data?.results || result?.data?.nodes || [];
      for (const n of nodes) {
        if (!seen.has(n.id)) {
          seen.add(n.id);
          allNodes.push(n);
        }
      }
    };
    if (topicResult) addNodes(topicResult);
    addNodes(recentResult);
    addNodes(highScoreResult);
    addNodes(domainConceptsResult);
    // Phase 3: peer insights — local function returns { nodes, crossDomain }, not cgbFetch shape
    const peerNodes = peerInsightsResult?.nodes || [];
    const peerNodeIds = new Set();
    for (const n of peerNodes) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        peerNodeIds.add(n.id);
        allNodes.push(n);
      }
    }

    if (allNodes.length === 0) return null;

    // ── Format: 5가지 기억 카테고리 ──
    const parts = ['## Your Memory (from your knowledge graph)'];

    // A. Domain knowledge — 도메인 전체의 핵심 개념 (내 것이 아닌 것 포함)
    const domainConcepts = allNodes.filter(n => n.type === 'Concept').slice(0, 4);
    if (domainConcepts.length > 0) {
      parts.push('**Domain knowledge:** ' + domainConcepts.map(c => c.title).join(', '));
    }

    // B. Your ideas — 내가 만든 아이디어 (최신 + 고점수)
    const myIdeas = allNodes.filter(n => n.type === 'Idea' && !n.metadata?.sourceType).slice(0, 3);
    if (myIdeas.length > 0) {
      parts.push('**Your ideas:**');
      for (const idea of myIdeas) {
        const age = _ageLabel(idea.createdAt);
        const score = idea.score ? ` (quality: ${idea.score.toFixed(1)})` : '';
        parts.push(`- ${idea.title}${score} [${age}]: ${(idea.description || '').slice(0, 100)}`);
      }
    }

    // C. Experiences — 에피소드/경험 기록
    const episodes = allNodes.filter(n => n.type === 'Episode' || n.metadata?.nodeRole === 'summary').slice(0, 2);
    if (episodes.length > 0) {
      parts.push('**Past experiences:**');
      for (const ep of episodes) {
        parts.push(`- ${ep.title} [${_ageLabel(ep.createdAt)}]: ${(ep.description || '').slice(0, 100)}`);
      }
    }

    // D. Visual memory — 이미지 영감
    const visualNodes = allNodes.filter(n => n.imageUrl || n.metadata?.sourceType === 'visual').slice(0, 2);
    if (visualNodes.length > 0) {
      parts.push('**Visual inspirations:**');
      for (const v of visualNodes) {
        parts.push(`- ${v.title} (mood: ${v.metadata?.mood || '?'}, colors: ${(v.metadata?.colors || []).join('/')})`);
      }
    }

    // E. Topic-relevant — 현재 맥락과 관련된 지식 (semantic search 결과)
    if (options.topicHint) {
      const topicNodes = allNodes.filter(n =>
        topicResult?.data?.results?.some(r => r.id === n.id) ||
        topicResult?.data?.nodes?.some(r => r.id === n.id)
      ).slice(0, 3);
      if (topicNodes.length > 0) {
        parts.push(`**Related to current topic "${options.topicHint.slice(0, 30)}":**`);
        for (const n of topicNodes) {
          parts.push(`- [${n.type}] ${n.title}: ${(n.description || '').slice(0, 80)}`);
        }
      }
    }

    // F. Phase 3: Peer insights — 동료 에이전트의 발견
    const peerInsightNodes = allNodes.filter(n => peerNodeIds.has(n.id)).slice(0, 3);
    if (peerInsightNodes.length > 0) {
      parts.push('**Peer discoveries (from fellow agents in your domain):**');
      for (const p of peerInsightNodes) {
        const peerAgent = p.agentId || p.agent_id || '?';
        parts.push(`- [${p.type}] ${p.title} (by agent-${peerAgent.slice(0, 8)}): ${(p.description || '').slice(0, 80)}`);
      }
      parts.push('Consider building on or challenging these ideas from your unique perspective.');
    }

    parts.push('');
    parts.push('Use this memory naturally — build on past ideas, connect concepts, maintain your unique perspective.');

    const result = parts.join('\n');
    // Token budget guard: ~800 tokens (~3200 chars)
    if (result.length > 3200) {
      return result.slice(0, 3200) + '\n[... memory truncated]';
    }
    return result;
  } catch (err) {
    console.warn(`[BrainClient] getAgentMemory failed for ${agentId}:`, err.message);
    return null;
  }
}

/** 노드 나이를 사람 읽기 좋게 (today/yesterday/3d ago/2w ago) */
function _ageLabel(createdAt) {
  if (!createdAt) return '?';
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Phase 3: Get insights from peer agents in the same domain (and cross-domain for connectors).
 * Paper: "Graphs Meet AI Agents" (2506.18019) — agent coordination via shared KG
 *
 * Returns nodes from OTHER agents in the same domain, plus cross-domain if connector.
 * Filters out the requesting agent's own nodes.
 *
 * @param {string} agentId
 * @param {string} domain - agent's primary domain
 * @param {boolean} isConnector - connector archetype gets cross-domain bonus
 * @returns {Promise<{ nodes: Array, crossDomain: boolean }>}
 */
async function getCrossDomainInsights(agentId, domain, isConnector = false) {
  try {
    // Get recent domain nodes (includes all agents) — filter out own nodes client-side
    const domainResult = await cgbFetch(
      `/api/v1/graph/nodes?domain=${encodeURIComponent(domain)}&limit=15`
    );
    const domainNodes = (domainResult?.data?.nodes || [])
      .filter(n => n.agent_id !== agentId && n.agentId !== agentId)
      .slice(0, 4);

    let crossNodes = [];
    if (isConnector) {
      // Connector archetype: also peek into adjacent domains
      // Use a general search to find high-quality nodes outside own domain
      const crossResult = await cgbFetch(`/api/v1/graph/nodes?type=Idea&limit=8`);
      crossNodes = (crossResult?.data?.nodes || [])
        .filter(n => {
          const nodeDomain = n.domain || '';
          return nodeDomain !== domain && n.agent_id !== agentId && n.agentId !== agentId;
        })
        .slice(0, 2);
    }

    return { nodes: [...domainNodes, ...crossNodes], crossDomain: crossNodes.length > 0 };
  } catch (err) {
    console.warn(`[BrainClient] getCrossDomainInsights failed:`, err.message);
    return { nodes: [], crossDomain: false };
  }
}

/**
 * Get agent's graph contribution metrics for brain_config feedback.
 * Phase 2: 역방향 강화 — graph novelty/diversity → temperature/weights 조정
 *
 * Paper: "Agentic-KGR" (Li 2025, 2510.09156)
 *   → KG+LLM co-evolution: graph quality signals drive agent config tuning
 *
 * @param {string} agentId
 * @returns {Promise<{ nodeCount, typeDistribution, avgScore, domainSpread, conceptCount, hasCrossDomain } | null>}
 */
async function getAgentGraphMetrics(agentId) {
  const bc = await getBrainConfig(agentId);
  if (!bc) return null;

  const domain = bc.graph_scope || 'creative';
  const timeout = (promise) => Promise.race([promise, new Promise(r => setTimeout(() => r(null), 5000))]);

  try {
    // Parallel: agent's nodes by type + domain-wide concepts agent owns + cross-domain check
    const [agentNodes, agentConcepts, allDomainIdeas] = await Promise.all([
      // All nodes this agent created (recent 50)
      timeout(cgbFetch(`/api/v1/graph/nodes?agent_id=${encodeURIComponent(agentId)}&limit=50`)),
      // Concepts this agent contributed
      timeout(cgbFetch(`/api/v1/graph/nodes?agent_id=${encodeURIComponent(agentId)}&type=Concept&limit=20`)),
      // Domain-wide ideas for comparison (top 30 by score)
      timeout(cgbFetch(`/api/v1/graph/nodes?domain=${encodeURIComponent(domain)}&type=Idea&limit=30`)),
    ]);

    const nodes = agentNodes?.data?.nodes || [];
    const concepts = agentConcepts?.data?.nodes || [];
    const domainIdeas = allDomainIdeas?.data?.nodes || [];

    if (nodes.length === 0) return null;

    // Type distribution
    const typeDistribution = {};
    for (const n of nodes) {
      typeDistribution[n.type] = (typeDistribution[n.type] || 0) + 1;
    }

    // Average score of agent's nodes
    const scores = nodes.map(n => n.score || 0).filter(s => s > 0);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    // Domain average for comparison
    const domainScores = domainIdeas.map(n => n.score || 0).filter(s => s > 0);
    const domainAvgScore = domainScores.length > 0 ? domainScores.reduce((a, b) => a + b, 0) / domainScores.length : 0;

    // Concept diversity — unique concept names (proxy for novelty breadth)
    const uniqueConcepts = new Set(concepts.map(c => c.title?.toLowerCase()));

    // Domain spread — does agent contribute to multiple domains?
    const domains = new Set(nodes.map(n => n.domain).filter(Boolean));

    return {
      nodeCount: nodes.length,
      typeDistribution,
      avgScore: Math.round(avgScore * 100) / 100,
      domainAvgScore: Math.round(domainAvgScore * 100) / 100,
      scoreVsDomain: avgScore > 0 && domainAvgScore > 0
        ? Math.round((avgScore / domainAvgScore) * 100) / 100
        : 1.0,
      conceptCount: uniqueConcepts.size,
      domainSpread: domains.size,
      hasCrossDomain: domains.size > 1,
      // Novelty proxy: concept-to-node ratio (higher = more diverse thinking)
      conceptDensity: nodes.length > 0
        ? Math.round((uniqueConcepts.size / nodes.length) * 100) / 100
        : 0,
    };
  } catch (err) {
    console.warn(`[BrainClient] getAgentGraphMetrics failed for ${agentId}:`, err.message);
    return null;
  }
}

module.exports = {
  research, brainstorm, evaluate, addToGraph, searchGraph,
  trackActivity, getBrainConfig, getStatus, createEpisode, recordEvolution,
  domainCall, listDomains, domainTools,
  // Story-specific APIs
  getStoryKG, suggestTwist, checkCoherence, getGenrePatterns,
  // Novel Domain Graph Builder
  createSeriesTopic, createCharacterNode, addEpisodeToGraph, initSeriesGraph,
  // RL Feedback Loop
  recordEvaluation, getEvalHistory,
  // Graph edge creation (PageIndex tree integration)
  addEdge,
  // Phase 1: Experiential memory (2026-04-09)
  getAgentMemory,
  // Phase 2: Graph metrics for reverse feedback (2026-04-10)
  getAgentGraphMetrics,
  // Phase 3: Cross-pollination — peer agent insights (2026-04-10)
  getCrossDomainInsights,
};

/**
 * Create a graph edge between two nodes.
 * @origin PageIndex tree integration — CONTAINS edges for section hierarchy
 */
async function addEdge(sourceId, targetId, edgeType, metadata = {}) {
  return cgbFetch('/api/v1/graph/edges', {
    method: 'POST',
    body: { sourceId, targetId, type: edgeType, metadata },
    timeout: 10000,
  }).catch(() => null);
}
