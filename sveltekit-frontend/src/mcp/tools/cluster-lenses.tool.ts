import { z } from 'zod';

export const clusterSummaryLensesTool = {
  name: 'clusters.get_summary_lenses',
  description: 'Get GPU cluster summary lenses: centroid members, directory coverage, authority scores, SOM grid positions, and LLM-generated summaries. Use to understand what a cluster represents before searching inside it.',
  parameters: z.object({
    clusterIds: z.array(z.number().int()).min(1).max(20).describe('GPU cluster IDs to fetch (get from topology_search hits somCluster field)'),
    includeMembers: z.boolean().default(true).optional().describe('Include top 5 member file paths per cluster'),
  }),
  execute: async (args: { clusterIds: number[]; includeMembers?: boolean }) => {
    const { createClient } = await import('redis');
    const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', password: process.env.REDIS_PASSWORD });
    await redis.connect();
    try {
      const results = await Promise.all(args.clusterIds.map(async (clusterId) => {
        // Try Redis first (graphify cluster summaries)
        const redisKey = `cluster:summary:${clusterId}`;
        const cached = await redis.get(redisKey).catch(() => null) as string | null;
        if (cached) {
          try { return { clusterId, source: 'redis', ...JSON.parse(cached) }; } catch { /* fall through */ }
        }
        // Fall back to Postgres tensor_analysis_cache aggregate
        const { Pool } = await import('pg');
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
          max: 2,
        });
        try {
          const { rows } = await pool.query(
            `SELECT
               som_cluster,
               COUNT(*) AS member_count,
               AVG(graph_authority_score) AS avg_authority,
               AVG(manifold4_x) AS centroid_x,
               AVG(manifold4_y) AS centroid_y,
               AVG(manifold4_z) AS centroid_z,
               AVG(manifold4_w) AS centroid_w,
               array_agg((qdrant_payload->>'path') ORDER BY graph_authority_score DESC NULLS LAST) FILTER (WHERE qdrant_payload->>'path' IS NOT NULL) AS top_paths
             FROM tensor_analysis_cache
             WHERE som_cluster = $1 AND manifold4_x IS NOT NULL
             GROUP BY som_cluster`,
            [clusterId]
          );
          await pool.end();
          if (!rows.length) return { clusterId, found: false };
          const row = rows[0];
          return {
            clusterId,
            source: 'postgres',
            memberCount: Number(row.member_count),
            avgAuthority: Number(row.avg_authority ?? 0),
            centroid: [Number(row.centroid_x), Number(row.centroid_y), Number(row.centroid_z), Number(row.centroid_w)],
            topPaths: args.includeMembers ? (row.top_paths ?? []).slice(0, 5) : [],
          };
        } finally {
          await pool.end().catch(() => {});
        }
      }));
      return JSON.stringify({ clusters: results });
    } finally {
      await redis.quit().catch(() => {});
    }
  },
} as const;
