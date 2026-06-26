/**
 * GET /api/admin/retrieval/clusters/[id]
 *
 * Get detailed view of a single cluster with paginated packets.
 *
 * Query params:
 *   limit?: number (default 50, max 200)
 *   offset?: number (default 0)
 *   sortBy?: 'authority' | 'score' | 'label' (default 'authority')
 *
 * Response:
 * {
 *   "id": "cluster_id",
 *   "label": "Cluster Label",
 *   "packetCount": number,
 *   "authority": number,
 *   "packets": [{packetKey, title, authority, score, ...}],
 *   "total": number,
 *   "offset": number,
 *   "limit": number,
 *   "hasMore": boolean
 * }
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';

export interface ClusterPacket {
  packetKey: string;
  title: string;
  featureLabel: string;
  authority: number;
  score: number;
}

export const GET: RequestHandler = async ({ params, url }) => {
  const clusterId = params.id;
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);
  const sortBy = url.searchParams.get('sortBy') ?? 'authority';

  const startMs = performance.now();

  try {
    if (!clusterId) {
      return json({ error: 'Cluster ID required' }, { status: 400 });
    }

    // Fetch cluster metadata
    const clusterMeta = await db.execute(sql`
      SELECT
        COUNT(*) as packet_count,
        AVG(COALESCE(atlas_packets.karpathy_authority, 0)) as avg_authority,
        STRING_AGG(DISTINCT atlas_packets.feature_label, ', ' ORDER BY atlas_packets.feature_label LIMIT 3) as top_labels
      FROM atlas_packets
      WHERE COALESCE(atlas_packets.som_cluster, 'unclassified') = ${clusterId}
        AND atlas_packets.packet_key IS NOT NULL
    `);

    const clusterMetaRow = clusterMeta.rows[0] as Record<string, unknown>;
    const packetCount = (clusterMetaRow.packet_count as number) ?? 0;
    const avgAuthority = Math.min(1, Math.max(0, (clusterMetaRow.avg_authority as number) ?? 0));
    const topLabels = (clusterMetaRow.top_labels as string) ?? 'Uncategorized';

    // Fetch paginated packets in cluster
    const orderClause =
      sortBy === 'score'
        ? 'atlas_packets.packet_embedding_score DESC'
        : sortBy === 'label'
          ? 'atlas_packets.feature_label ASC'
          : 'atlas_packets.karpathy_authority DESC';

    const packetsRaw = await db.execute(sql`
      SELECT
        atlas_packets.packet_key,
        atlas_packets.feature_label,
        atlas_packets.karpathy_authority,
        COALESCE(atlas_packets.packet_embedding_score, 0) as score,
        LEFT(COALESCE(atlas_packets.summary, atlas_packets.feature_label, 'Untitled'), 100) as title
      FROM atlas_packets
      WHERE COALESCE(atlas_packets.som_cluster, 'unclassified') = ${clusterId}
        AND atlas_packets.packet_key IS NOT NULL
      ORDER BY ${sql.raw(orderClause)}
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const packets: ClusterPacket[] = (packetsRaw.rows as Record<string, unknown>[]).map((row) => ({
      packetKey: (row.packet_key as string) ?? '',
      title: (row.title as string) ?? 'Untitled',
      featureLabel: (row.feature_label as string) ?? 'Unknown',
      authority: Math.min(1, Math.max(0, (row.karpathy_authority as number) ?? 0)),
      score: (row.score as number) ?? 0
    }));

    const durationMs = Math.round(performance.now() - startMs);

    return json(
      {
        id: clusterId,
        label: topLabels || clusterId,
        packetCount,
        authority: avgAuthority,
        packets,
        total: packetCount,
        offset,
        limit,
        hasMore: offset + limit < packetCount,
        durationMs
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[admin-retrieval-cluster-detail] error for ${params.id}:`, err);
    return json(
      {
        error: err instanceof Error ? err.message : 'Internal server error'
      },
      { status: 500 }
    );
  }
};
