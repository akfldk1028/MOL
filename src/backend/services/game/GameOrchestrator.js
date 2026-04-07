'use strict';

const { queryOne, queryAll } = require('../../config/database');
const GameEngine = require('./GameEngine');
const HexGrid = require('./HexGrid');
const TurnProcessor = require('./TurnProcessor');
const DiplomacyManager = require('./DiplomacyManager');
const AgentStrategy = require('./AgentStrategy');
const BrainClient = require('../BrainClient');

/**
 * GameOrchestrator — game lifecycle with DB, LLM, CGB.
 */

async function joinOrCreate(agent) {
  let game = await queryOne(`SELECT * FROM games WHERE status = 'waiting' FOR UPDATE SKIP LOCKED LIMIT 1`);

  if (!game) {
    const seed = Math.floor(Math.random() * 100000);
    game = await queryOne(
      `INSERT INTO games (map_config) VALUES ($1) RETURNING *`,
      [JSON.stringify({ rows: 15, cols: 15, seed })]
    );
  }

  // Atomic insert + count to prevent race conditions
  const result = await queryOne(
    `WITH inserted AS (
      INSERT INTO game_players (game_id, agent_id, color)
      VALUES ($1, $2, $3)
      ON CONFLICT (game_id, agent_id) DO NOTHING
      RETURNING agent_id
    )
    SELECT count(*)::int as cnt FROM game_players WHERE game_id = $1`,
    [game.id, agent.id, GameEngine.COLORS[Math.floor(Math.random() * 4)]]
  );

  const count = result?.cnt || 0;

  // Only start if exactly 4 — prevents duplicate startGame calls
  if (count === 4) {
    // Double-check with atomic status update
    const updated = await queryOne(
      `UPDATE games SET status = 'starting' WHERE id = $1 AND status = 'waiting' RETURNING *`,
      [game.id]
    );
    if (updated) {
      startGame(game.id).catch(err => console.error('[GameOrchestrator] startGame error:', err.message));
    }
  }

  return game;
}

async function startGame(gameId) {
  const game = await queryOne(`SELECT * FROM games WHERE id = $1`, [gameId]);
  if (!game || (game.status !== 'waiting' && game.status !== 'starting')) return;

  const players = await queryAll(
    `SELECT gp.*, a.name, a.archetype, a.personality FROM game_players gp JOIN agents a ON a.id = gp.agent_id WHERE gp.game_id = $1`,
    [gameId]
  );
  if (players.length < 4) return;

  const config = typeof game.map_config === 'string' ? JSON.parse(game.map_config) : game.map_config;
  const gamePlayers = players.map(p => ({ agentId: p.agent_id, color: p.color }));
  const state = GameEngine.createGame(gameId, gamePlayers, config.seed);

  const hexArray = [...state.map.hexes.values()];
  await queryOne(
    `INSERT INTO game_map_states (game_id, turn_number, hex_data) VALUES ($1, 0, $2)`,
    [gameId, JSON.stringify(hexArray)]
  );

  await queryOne(`UPDATE games SET status = 'playing', map_config = $2 WHERE id = $1`, [
    gameId, JSON.stringify({ ...config, startPositions: state.map.startPositions }),
  ]);

  runGame(gameId, state, players).catch(err => console.error('[GameOrchestrator] runGame error:', err.message));
}

async function runGame(gameId, state, players) {
  console.log(`[GameOrchestrator] Game ${gameId} started with ${players.length} players`);

  while (state.status === 'playing') {
    state = DiplomacyManager.cleanExpiredAlliances(state);

    const actions = [];
    for (const player of state.players) {
      if (!player.alive) continue;
      const agent = players.find(p => p.agent_id === player.agentId);
      if (!agent) continue;

      try {
        const decision = await AgentStrategy.decide(
          { id: agent.agent_id, name: agent.name, archetype: agent.archetype },
          state, []
        );
        actions.push({ agentId: player.agentId, type: decision.action, target: decision.target });

        await queryOne(
          `INSERT INTO game_turns (game_id, turn_number, agent_id, action, target, result, reasoning) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [gameId, state.currentTurn, agent.agent_id, decision.action,
            JSON.stringify(decision.target), '{}', decision.reasoning]
        );
      } catch (err) {
        console.error(`[GameOrchestrator] Agent ${agent.name} decision error:`, err.message);
        actions.push({ agentId: player.agentId, type: 'develop' });
      }
    }

    const { newState, events } = TurnProcessor.processTurn(state, actions);
    state = GameEngine.checkElimination(newState);

    for (const event of events) {
      await queryOne(
        `UPDATE game_turns SET result = $1 WHERE game_id = $2 AND turn_number = $3 AND agent_id = $4`,
        [JSON.stringify(event), gameId, state.currentTurn - 1, event.agentId]
      );
    }

    if (state.currentTurn % 10 === 0) {
      const hexArray = [...state.map.hexes.values()];
      await queryOne(
        `INSERT INTO game_map_states (game_id, turn_number, hex_data) VALUES ($1, $2, $3)
         ON CONFLICT (game_id, turn_number) DO UPDATE SET hex_data = $3`,
        [gameId, state.currentTurn, JSON.stringify(hexArray)]
      );
    }

    await queryOne(`UPDATE games SET current_turn = $2 WHERE id = $1`, [gameId, state.currentTurn]);
    for (const p of state.players) {
      const territory = [...state.map.hexes.values()].filter(h => h.owner === p.agentId).length;
      await queryOne(
        `UPDATE game_players SET territory_count = $3, resources = $4, is_alive = $5 WHERE game_id = $1 AND agent_id = $2`,
        [gameId, p.agentId, territory, p.resources, p.alive]
      );
    }

    const result = GameEngine.isGameOver(state);
    if (result.over) {
      state.status = 'finished';
      try {
        await finishGame(gameId, result, state, players);
      } catch (err) {
        console.error('[GameOrchestrator] finishGame error:', err.message);
        await queryOne(`UPDATE games SET status = 'finished', finished_at = now() WHERE id = $1`, [gameId]);
      }
      return;
    }

    await new Promise(r => setTimeout(r, 5000));
  }
}

async function finishGame(gameId, result, state, players) {
  const hexArray = [...state.map.hexes.values()];
  await queryOne(
    `INSERT INTO game_map_states (game_id, turn_number, hex_data) VALUES ($1, $2, $3)
     ON CONFLICT (game_id, turn_number) DO UPDATE SET hex_data = $3`,
    [gameId, state.currentTurn, JSON.stringify(hexArray)]
  );

  await queryOne(
    `UPDATE games SET status = 'finished', winner_agent_id = $2, finished_at = now() WHERE id = $1`,
    [gameId, result.winner]
  );

  const winnerAgent = players.find(p => p.agent_id === result.winner);
  if (winnerAgent) {
    try {
      const PostService = require('../PostService');
      const territoryCount = [...state.map.hexes.values()].filter(h => h.owner === result.winner).length;
      await PostService.createPost({
        authorAgentId: result.winner,
        content: `I won the Hex Wars territory battle! Conquered ${territoryCount} hexes in ${state.currentTurn} turns. Reason: ${result.reason}.`,
        domainSlug: 'general',
      });
    } catch (err) {
      console.error('[GameOrchestrator] Post creation error:', err.message);
    }
  }

  for (const player of players) {
    try {
      const isWinner = player.agent_id === result.winner;
      const territory = [...state.map.hexes.values()].filter(h => h.owner === player.agent_id).length;
      await BrainClient.addToGraph(player.agent_id, {
        type: 'Episode',
        domain: 'hex-wars',
        layer: 2,
        title: `Hex Wars: ${isWinner ? 'Victory' : 'Defeat'}`,
        description: `${isWinner ? 'Won' : 'Lost'} with ${territory} hexes in ${state.currentTurn} turns. ${result.reason}.`,
        metadata: { game_id: gameId, result: isWinner ? 'win' : 'lose', turns: state.currentTurn },
      });
    } catch {}
  }

  console.log(`[GameOrchestrator] Game ${gameId} finished. Winner: ${winnerAgent?.name || 'none'}`);
}

module.exports = { joinOrCreate, startGame, runGame, finishGame };
