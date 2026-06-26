/**
 * GET /api/admin/retrieval/clusters
 *
 * List all SOM clusters with pagination.
 * Each cluster contains metadata: id, label, packetCount, centroid, authority score.
 *
 * Query params:
 *   limit?: number (default 20, max 100)
 *   offset?: number (default 0)
 *   sortBy?: 'authority' | 'packetCount' | 'label' (default 'authority')
 *   order?: 'asc' | 'desc' (default 'desc')
 *
 * Response:
 * {
 *   "clusters": [{id, label, packetCount, authority, ...}],
 *   "total": number,
 *   "offset": number,
 *   "limit": number,
 *   "hasMore": boolean
 * }
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';

export interface ClusterSummary {
  id: string;
  label: string;
  packetCount: number;
  authority: number;
  durationMs: number;
}

export const GET: RequestHandler = async ({ url }) => {
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);
  const sortBy = url.searchParams.get('sortBy') ?? 'authority';
  const order = url.searchParams.get('order') ?? 'desc';

  const startMs = performance.now();

  try {
    // Fetch cluster summary from Postgres
    const orderClause =
      sortBy === 'packetCount'
        ? order === 'desc'
          ? 'packet_count DESC'
          : 'packet_count ASC'
        : sortBy === 'label'
          ? order === 'desc'
            ? 'top_labels DESC'
            : 'top_labels ASC'
          : order === 'desc'
            ? 'avg_authority DESC'
            : 'avg_authority ASC';

    const clusterStatsRaw = await db.execute(sql`
      SELECT
        COALESCE(atlas_packets.som_cluster, 'unclassified') as cluster_id,
        COUNT(*) as packet_count,
        AVG(COALESCE(atlas_packets.karpathy_authority, 0)) as avg_authority,
        STRING_AGG(DISTINCT atlas_packets.feature_label, ', ' ORDER BY atlas_packets.feature_label LIMIT 3) as top_labels
      FROM atlas_packets
      WHERE atlas_packets.packet_key IS NOT NULL
      GROUP BY COALESCE(atlas_packets.som_cluster, 'unclassified')
      ORDER BY ${sql.raw(orderClause)}
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    // Fetch total count
    const countResult = await db.execute(sql`
      SELECT COUNT(DISTINCT COALESCE(atlas_packets.som_cluster, 'unclassified')) as total
      FROM atlas_packets
      WHERE atlas_packets.packet_key IS NOT NULL
    `);

    const total = (countResult.rows[0] as Record<string, number>).total ?? 0;

    // Transform raw query results to cluster summaries
    const clusters: ClusterSummary[] = (clusterStatsRaw.rows as Record<string, unknown>[]).map((row) => {
      const clusterId = (row.cluster_id as string) ?? 'unclassified';
      const packetCount = (row.packet_count as number) ?? 0;
      const authority = Math.min(1, Math.max(0, (row.avg_authority as number) ?? 0));
      const topLabels = (row.top_labels as string) ?? 'Uncategorized';

      return {
        id: clusterId,
        label: topLabels || clusterId,
        packetCount,
        authority,
        durationMs: 0
      };
    });

    const durationMs = Math.round(performance.now() - startMs);

    clusters.forEach((c) => {
      c.durationMs = durationMs;
    });

    return json(
      {
        clusters,
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
        durationMs
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[admin-retrieval-clusters] error:', err);
    return json(
      {
        clusters: [],
        total: 0,
        offset,
        limit,
        hasMore: false,
        error: err instanceof Error ? err.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
};
