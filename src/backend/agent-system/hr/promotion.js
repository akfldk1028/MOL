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
  4: 15,
  3: 40,
  2: 80,
};

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
