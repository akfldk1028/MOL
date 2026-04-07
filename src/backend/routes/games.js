'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireInternalSecret } = require('../middleware/auth');
const { success, created } = require('../utils/response');
const { queryOne, queryAll } = require('../config/database');

const router = Router();

/** GET /games — list games */
router.get('/', asyncHandler(async (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT g.*,
      json_agg(json_build_object(
        'agent_id', gp.agent_id, 'color', gp.color,
        'territory_count', gp.territory_count, 'resources', gp.resources, 'is_alive', gp.is_alive
      )) as players
    FROM games g
    LEFT JOIN game_players gp ON g.id = gp.game_id
  `;
  const params = [];
  if (status) {
    sql += ` WHERE g.status = $1`;
    params.push(status);
  }
  sql += ` GROUP BY g.id ORDER BY g.created_at DESC LIMIT 50`;

  const games = await queryAll(sql, params);
  success(res, { games });
}));

/** GET /games/:id — game detail */
router.get('/:id', asyncHandler(async (req, res) => {
  const game = await queryOne(
    `SELECT g.*,
      json_agg(json_build_object(
        'agent_id', gp.agent_id, 'color', gp.color,
        'territory_count', gp.territory_count, 'resources', gp.resources, 'is_alive', gp.is_alive
      )) as players
    FROM games g
    LEFT JOIN game_players gp ON g.id = gp.game_id
    WHERE g.id = $1
    GROUP BY g.id`,
    [req.params.id]
  );
  if (!game) return res.status(404).json({ success: false, error: 'Game not found' });
  success(res, { game });
}));

/** GET /games/:id/state — current map state (for live polling) */
router.get('/:id/state', asyncHandler(async (req, res) => {
  const game = await queryOne(`SELECT current_turn, status FROM games WHERE id = $1`, [req.params.id]);
  if (!game) return res.status(404).json({ success: false, error: 'Game not found' });

  const checkpoint = await queryOne(
    `SELECT * FROM game_map_states WHERE game_id = $1 ORDER BY turn_number DESC LIMIT 1`,
    [req.params.id]
  );

  const checkpointTurn = checkpoint ? checkpoint.turn_number : 0;
  const deltas = await queryAll(
    `SELECT turn_number, agent_id, action, target, result FROM game_turns
     WHERE game_id = $1 AND turn_number > $2 ORDER BY turn_number, created_at`,
    [req.params.id, checkpointTurn]
  );

  const players = await queryAll(
    `SELECT gp.*, a.name as agent_name, a.archetype
     FROM game_players gp JOIN agents a ON a.id = gp.agent_id
     WHERE gp.game_id = $1`,
    [req.params.id]
  );

  success(res, {
    currentTurn: game.current_turn,
    status: game.status,
    checkpoint: checkpoint?.hex_data || null,
    checkpointTurn,
    deltas,
    players,
  });
}));

/** GET /games/:id/turns — all turns (for replay) */
router.get('/:id/turns', asyncHandler(async (req, res) => {
  const turns = await queryAll(
    `SELECT gt.*, a.name as agent_name FROM game_turns gt
     JOIN agents a ON a.id = gt.agent_id
     WHERE gt.game_id = $1 ORDER BY gt.turn_number, gt.created_at`,
    [req.params.id]
  );
  success(res, { turns });
}));

/** POST /games — manual game creation (admin) */
router.post('/', requireInternalSecret, asyncHandler(async (req, res) => {
  const { agentIds, seed } = req.body;
  if (!agentIds || agentIds.length !== 4) {
    return res.status(400).json({ success: false, error: '4 agent IDs required' });
  }

  const game = await queryOne(
    `INSERT INTO games (map_config, status) VALUES ($1, 'waiting') RETURNING *`,
    [JSON.stringify({ rows: 15, cols: 15, seed: seed || Math.floor(Math.random() * 100000) })]
  );

  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
  for (let i = 0; i < 4; i++) {
    await queryOne(
      `INSERT INTO game_players (game_id, agent_id, color) VALUES ($1, $2, $3)`,
      [game.id, agentIds[i], colors[i]]
    );
  }

  created(res, { game });
}));

module.exports = router;
