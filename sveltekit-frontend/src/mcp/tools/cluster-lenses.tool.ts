import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { clusterTensorKey } from '$lib/server/cache-keys.js';

// ── helpers ──────────────────────────────────────────────────────────────────

async function pgPool() {
  const { Pool } = await import('pg');
  return new Pool({ connectionString: ENV.DATABASE_URL, max: 2 });
}

export const clusterSummaryLensesTool = {
  name: 'clusters.get_summary_lenses',
  description: 'Get GPU cluster summary lenses: centroid members, directory coverage, authority scores, SOM grid positions, and LLM-generated summaries. Use to understand what a cluster represents before searching inside it.',
  parameters: z.object({
    clusterIds: z.array(z.number().int()).min(1).max(20).describe('GPU cluster IDs to fetch (get from topology_search hits somCluster field)'),
    includeMembers: z.boolean().default(true).optional().describe('Include top 5 member file paths per cluster'),
  }),
  execute: async (args: { clusterIds: number[]; includeMembers?: boolean }) => {
    const { createClient } = await import('redis');
    const redis = createClient({ url: ENV.REDIS_URL, password: process.env.REDIS_PASSWORD });
    await redis.connect();
    try {
      const results = await Promise.all(args.clusterIds.map(async (clusterId) => {
        // Try Redis first (graphify cluster summaries)
        const redisKey = clusterTensorKey.summary(clusterId);
        const cached = await redis.get(redisKey).catch(() => null) as string | null;
        if (cached) {
          try { return { clusterId, source: 'redis', ...JSON.parse(cached) }; } catch { /* fall through */ }
        }
        // Fall back to Postgres tensor_analysis_cache aggregate
        const { Pool } = await import('pg');
        const pool = new Pool({
          connectionString: ENV.DATABASE_URL,
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

// ── SOM cell lookup ───────────────────────────────────────────────────────────

export const somCellLookupTool = {
  name: 'clusters.som_cell_lookup',
  description: 'Look up packets in a 20×20 SOM grid cell and its Moore-neighborhood (adjacent 8 cells). Returns packet_key, source_ref, feature_id, authority scores and SOM coordinates. Use to find topically-related code by spatial grid proximity.',
  parameters: z.object({
    som_row: z.number().int().min(0).max(19).describe('SOM row index (0–19)'),
    som_col: z.number().int().min(0).max(19).describe('SOM column index (0–19)'),
    include_neighbors: z.boolean().default(true).optional().describe('Include packets from the 8 adjacent cells (Moore neighborhood)'),
    limit: z.number().int().min(1).max(200).default(50).optional().describe('Max packets to return per cell'),
  }),
  execute: async (args: { som_row: number; som_col: number; include_neighbors?: boolean; limit?: number }) => {
    const { som_row, som_col, include_neighbors = true, limit = 50 } = args;
    const pool = await pgPool();
    try {
      // Build row/col ranges: center cell only, or Moore neighborhood
      const rowMin = include_neighbors ? Math.max(0, som_row - 1) : som_row;
      const rowMax = include_neighbors ? Math.min(19, som_row + 1) : som_row;
      const colMin = include_neighbors ? Math.max(0, som_col - 1) : som_col;
      const colMax = include_neighbors ? Math.min(19, som_col + 1) : som_col;

      const { rows } = await pool.query<{
        packet_key: string;
        source_ref: string;
        feature_id: string;
        feature_label: string | null;
        som_row: number;
        som_col: number;
        authority_score: number | null;
        pagerank_score: number | null;
      }>(
        `SELECT packet_key, source_ref, feature_id, feature_label,
                som_row, som_col,
                authority_score, pagerank_score
         FROM atlas_packets
         WHERE som_row BETWEEN $1 AND $2
           AND som_col BETWEEN $3 AND $4
         ORDER BY COALESCE(authority_score, 0) DESC
         LIMIT $5`,
        [rowMin, rowMax, colMin, colMax, limit]
      );

      const centerCount = rows.filter(r => r.som_row === som_row && r.som_col === som_col).length;
      const neighborCount = rows.length - centerCount;

      return JSON.stringify({
        center: { som_row, som_col },
        include_neighbors,
        total: rows.length,
        center_count: centerCount,
        neighbor_count: neighborCount,
        packets: rows.map(r => ({
          packet_key: r.packet_key,
          source_ref: r.source_ref,
          feature_id: r.feature_id,
          feature_label: r.feature_label,
          som_row: r.som_row,
          som_col: r.som_col,
          authority: r.authority_score != null ? Number(r.authority_score) : null,
          pagerank: r.pagerank_score != null ? Number(r.pagerank_score) : null,
          is_center: r.som_row === som_row && r.som_col === som_col,
        })),
      });
    } finally {
      await pool.end().catch(() => {});
    }
  },
} as const;

// ── K-means cluster members ───────────────────────────────────────────────────

export const kmeansClusterMembersTool = {
  name: 'clusters.kmeans_members',
  description: 'List packets belonging to one or more K-means clusters (cluster IDs 0–19). Returns source refs, authority scores, and SOM grid positions. Useful for understanding the semantic neighborhood of a cluster before drilling into individual packets.',
  parameters: z.object({
    cluster_ids: z.array(z.number().int().min(0).max(99)).min(1).max(5).describe('K-means cluster IDs to fetch (from atlas_packets.som_cluster_id integer column)'),
    limit: z.number().int().min(1).max(200).default(50).optional().describe('Max packets per cluster'),
    min_authority: z.number().min(0).max(1).default(0).optional().describe('Filter to packets with authority_score ≥ this value'),
  }),
  execute: async (args: { cluster_ids: number[]; limit?: number; min_authority?: number }) => {
    const { cluster_ids, limit = 50, min_authority = 0 } = args;
    const pool = await pgPool();
    try {
      const results = await Promise.all(cluster_ids.map(async (clusterId) => {
        const { rows } = await pool.query<{
          packet_key: string;
          source_ref: string;
          feature_id: string;
          feature_label: string | null;
          som_row: number | null;
          som_col: number | null;
          authority_score: number | null;
          pagerank_score: number | null;
          total_count: string;
        }>(
          `SELECT packet_key, source_ref, feature_id, feature_label,
                  som_row, som_col,
                  authority_score, pagerank_score,
                  COUNT(*) OVER() AS total_count
           FROM atlas_packets
           WHERE som_cluster_id = $1
             AND COALESCE(authority_score, 0) >= $2
           ORDER BY COALESCE(authority_score, 0) DESC
           LIMIT $3`,
          [clusterId, min_authority, limit]
        );

        const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
        return {
          cluster_id: clusterId,
          total_in_cluster: total,
          returned: rows.length,
          packets: rows.map(r => ({
            packet_key: r.packet_key,
            source_ref: r.source_ref,
            feature_id: r.feature_id,
            feature_label: r.feature_label,
            som_row: r.som_row,
            som_col: r.som_col,
            authority: r.authority_score != null ? Number(r.authority_score) : null,
            pagerank: r.pagerank_score != null ? Number(r.pagerank_score) : null,
          })),
        };
      }));

      return JSON.stringify({ clusters: results });
    } finally {
      await pool.end().catch(() => {});
    }
  },
} as const;
