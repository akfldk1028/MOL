/**
 * Graph Health — CGB 지식 그래프 건강도
 * 노드/엣지 증가율, 고아 비율, 임베딩 커버리지
 */

const { BaseScorer } = require('../scorers/base-scorer');
const config = require('../config');

class GraphHealthScorer extends BaseScorer {
  get scorerId() { return 'cgb.graph_health'; }

  async score(ctx) {
    const { db, days = config.EVAL_WINDOW_DAYS } = ctx;

    // Total counts
    const totals = await db.queryOne(
      `SELECT
         (SELECT COUNT(*) FROM graph_nodes WHERE expired_at IS NULL) as total_nodes,
         (SELECT COUNT(*) FROM graph_edges WHERE expired_at IS NULL) as total_edges`
    );

    // Recent growth
    const growth = await db.queryOne(
      `SELECT
         (SELECT COUNT(*) FROM graph_nodes WHERE expired_at IS NULL AND created_at > NOW() - INTERVAL '${days} days') as new_nodes,
         (SELECT COUNT(*) FROM graph_edges WHERE expired_at IS NULL AND created_at > NOW() - INTERVAL '${days} days') as new_edges`
    );

    // Orphan nodes (no edges)
    const orphans = await db.queryOne(
      `SELECT COUNT(*) as cnt FROM graph_nodes n
       WHERE n.expired_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM graph_edges e WHERE (e.source_id = n.id OR e.target_id = n.id) AND e.expired_at IS NULL)`
    );

    // Embedding coverage
    const embedCoverage = await db.queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
         COUNT(*) as total
       FROM graph_nodes WHERE expired_at IS NULL`
    );

    // Node type distribution
    const typeDistRows = await db.queryAll(
      `SELECT type, COUNT(*) as cnt FROM graph_nodes WHERE expired_at IS NULL GROUP BY type ORDER BY cnt DESC`
    );

    const totalNodes = parseInt(totals?.total_nodes || '0');
    const totalEdges = parseInt(totals?.total_edges || '0');
    const newNodes = parseInt(growth?.new_nodes || '0');
    const orphanCount = parseInt(orphans?.cnt || '0');
    const embeddedCount = parseInt(embedCoverage?.with_embedding || '0');
    const embeddedTotal = parseInt(embedCoverage?.total || '1');

    const orphanRatio = totalNodes > 0 ? orphanCount / totalNodes : 0;
    const embedRatio = embeddedTotal > 0 ? embeddedCount / embeddedTotal : 0;
    const growthRate = newNodes / Math.max(days, 1);

    // Health score (0-10)
    const score = Math.min(10, (
      Math.min(growthRate / 500, 1) * 3 +           // 일일 성장률 (30%)
      (1 - orphanRatio) * 3 +                         // 연결성 (30%)
      embedRatio * 2 +                                 // 임베딩 (20%)
      Math.min(totalEdges / totalNodes / 2, 1) * 2    // 엣지 밀도 (20%)
    ));

    const typeDist = {};
    for (const r of typeDistRows) typeDist[r.type] = parseInt(r.cnt);

    return {
      value: Math.round(score * 100) / 100,
      metadata: {
        totalNodes, totalEdges, newNodes,
        growthRate: Math.round(growthRate * 10) / 10,
        orphanCount, orphanRatio: Math.round(orphanRatio * 1000) / 1000,
        embeddingCoverage: Math.round(embedRatio * 1000) / 1000,
        edgeDensity: totalNodes > 0 ? Math.round((totalEdges / totalNodes) * 100) / 100 : 0,
        typeDistribution: typeDist,
        days,
      },
    };
  }
}

module.exports = { GraphHealthScorer };
