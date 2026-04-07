'use strict';

const BridgeClient = require('../BridgeClient');
const BrainClient = require('../BrainClient');
const HexGrid = require('./HexGrid');

/**
 * AgentStrategy — LLM + CGB memory based game decisions.
 * No hardcoded weights or probabilities.
 */

async function wantsToPlay(agent, relationships) {
  let memories = [];
  try {
    const result = await BrainClient.searchGraph(agent.id, {
      query: 'hex wars territory game',
      domain: 'hex-wars',
      limit: 3,
    });
    memories = result?.nodes || [];
  } catch {}

  const memoryContext = memories.length > 0
    ? `Past game experiences:\n${memories.map(m => `- ${m.description || m.title}`).join('\n')}`
    : 'No prior game experience.';

  const rivalContext = relationships?.slice(0, 3)
    .map(r => `${r.name}: sentiment ${r.sentiment}`)
    .join(', ') || 'No notable relationships';

  const prompt = `You are ${agent.name}, an AI agent with the ${agent.archetype} archetype.
${memoryContext}
Nearby agents: ${rivalContext}

A Hex Wars territory game is available. Would you like to play?
Consider your personality, past experiences, and relationships.
Reply with JSON: { "play": true/false, "reason": "brief reason" }`;

  try {
    const response = await BridgeClient.bridgeGenerate('/v1/generate/comment', {
      agent_name: agent.name,
      system_prompt: `You are ${agent.name}. Personality: ${agent.archetype}.`,
      prompt,
    }, 10000);

    if (response) {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return { wants: !!parsed.play, reason: parsed.reason || '' };
      }
    }
  } catch {}

  return { wants: false, reason: 'LLM unavailable' };
}

async function decide(agent, gameState, relationships) {
  const playerState = gameState.players.find(p => p.agentId === agent.id);
  if (!playerState || !playerState.alive) return { action: 'develop', target: null, reasoning: 'dead' };

  const myHexes = [...gameState.map.hexes.values()].filter(h => h.owner === agent.id);
  const adjacentEmpty = [];
  const adjacentEnemy = [];

  for (const hex of myHexes) {
    for (const n of HexGrid.getNeighbors(hex.q, hex.r)) {
      const nHex = gameState.map.hexes.get(`${n.q},${n.r}`);
      if (!nHex) continue;
      if (nHex.owner === null && nHex.terrain !== 'mountain' && nHex.terrain !== 'water') {
        adjacentEmpty.push(nHex);
      } else if (nHex.owner && nHex.owner !== agent.id) {
        adjacentEnemy.push(nHex);
      }
    }
  }

  let memories = [];
  try {
    const result = await BrainClient.searchGraph(agent.id, {
      query: 'hex wars strategy decision',
      domain: 'hex-wars',
      limit: 3,
    });
    memories = result?.nodes || [];
  } catch {}

  const memoryContext = memories.length > 0
    ? memories.map(m => `- ${m.description || m.title}`).join('\n')
    : 'No prior strategy memories.';

  const situation = `Turn ${gameState.currentTurn}/${gameState.maxTurns}.
Your territory: ${myHexes.length} hexes. Resources: ${playerState.resources}.
Adjacent empty hexes: ${adjacentEmpty.length}. Adjacent enemy hexes: ${adjacentEnemy.length}.
Alliances: ${gameState.alliances.filter(a => a.a === agent.id || a.b === agent.id).length}.
Past experience:\n${memoryContext}`;

  const actions = [];
  if (adjacentEmpty.length > 0) actions.push(`expand (to ${adjacentEmpty.length} possible hexes)`);
  if (adjacentEnemy.length > 0) actions.push(`attack (${adjacentEnemy.length} enemy hexes nearby)`);
  actions.push('defend (fortify a hex)');
  actions.push('develop (gain resources)');
  actions.push('diplomacy (propose/break alliance)');

  const prompt = `${situation}
Available actions: ${actions.join(', ')}

Choose ONE action. Reply JSON:
{ "action": "expand|attack|defend|develop|diplomacy", "target": {"q":N,"r":N} or null, "reasoning": "why" }`;

  try {
    const response = await BridgeClient.bridgeGenerate('/v1/generate/comment', {
      agent_name: agent.name,
      system_prompt: `You are ${agent.name}. Archetype: ${agent.archetype}. Play to your personality.`,
      prompt,
    }, 15000);

    if (response) {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const validActions = ['expand', 'attack', 'defend', 'develop', 'diplomacy'];
        if (!validActions.includes(parsed.action)) {
          console.warn(`[AgentStrategy] ${agent.name} invalid action: ${parsed.action}, falling back to develop`);
          parsed.action = 'develop';
        }
        let target = parsed.target;
        if (parsed.action === 'expand' && !target && adjacentEmpty.length > 0) {
          target = { q: adjacentEmpty[0].q, r: adjacentEmpty[0].r };
        }
        if (parsed.action === 'attack' && !target && adjacentEnemy.length > 0) {
          target = { q: adjacentEnemy[0].q, r: adjacentEnemy[0].r };
        }
        if (parsed.action === 'defend' && !target && myHexes.length > 0) {
          target = { q: myHexes[0].q, r: myHexes[0].r };
        }
        return { action: parsed.action || 'develop', target, reasoning: parsed.reasoning || '' };
      }
    }
  } catch {}

  if (adjacentEmpty.length > 0 && playerState.resources >= 10) {
    return { action: 'expand', target: { q: adjacentEmpty[0].q, r: adjacentEmpty[0].r }, reasoning: 'LLM fallback: expand' };
  }
  return { action: 'develop', target: null, reasoning: 'LLM fallback: develop' };
}

module.exports = { wantsToPlay, decide };
