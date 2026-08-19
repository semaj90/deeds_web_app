import { pool } from '$lib/server/db/client.js';

export interface GraphFeatureSnapshotRowV1 {
  packetKey: string;
  graphRevision: string;
  pagerank: number | null;
  personalizedPageRank: number | null;
  communityId: string | null;
  algorithmRevisions: string[];
}

/**
 * Load only persisted, revision-qualified graph analysis. This never computes
 * graph metrics at query time and never falls back to unrevisioned enrichment.
 */
export async function loadGraphFeatureSnapshotV1(
  packetKeys: string[],
  graphRevision: string,
): Promise<Map<string, GraphFeatureSnapshotRowV1>> {
  if (packetKeys.length === 0) return new Map();
  const uniqueKeys = [...new Set(packetKeys.filter(Boolean))].slice(0, 512);
  if (uniqueKeys.length === 0) return new Map();

  const metricResult = await pool.query<{
    packet_key: string;
    metric_name: string;
    metric_value: number;
    algorithm_revision: string;
  }>(
    `
      SELECT DISTINCT ON (packet_key, metric_name)
        packet_key,
        metric_name,
        metric_value,
        algorithm_revision
      FROM graph_node_metrics
      WHERE graph_revision = $1
        AND packet_key = ANY($2::text[])
        AND metric_name IN ('pagerank', 'personalized_pagerank')
      ORDER BY packet_key, metric_name, created_at DESC
    `,
    [graphRevision, uniqueKeys],
  );

  const communityResult = await pool.query<{
    packet_key: string;
    community_id: string;
  }>(
    `
      SELECT DISTINCT ON (packet_key)
        packet_key,
        community_id
      FROM graph_community_assignments
      WHERE graph_revision = $1
        AND packet_key = ANY($2::text[])
      ORDER BY packet_key, created_at DESC
    `,
    [graphRevision, uniqueKeys],
  );

  const rows = new Map<string, GraphFeatureSnapshotRowV1>();
  for (const packetKey of uniqueKeys) {
    rows.set(packetKey, {
      packetKey,
      graphRevision,
      pagerank: null,
      personalizedPageRank: null,
      communityId: null,
      algorithmRevisions: [],
    });
  }

  for (const metric of metricResult.rows) {
    const row = rows.get(metric.packet_key);
    if (!row) continue;
    if (metric.metric_name === 'pagerank') row.pagerank = Number(metric.metric_value);
    if (metric.metric_name === 'personalized_pagerank') {
      row.personalizedPageRank = Number(metric.metric_value);
    }
    if (!row.algorithmRevisions.includes(metric.algorithm_revision)) {
      row.algorithmRevisions.push(metric.algorithm_revision);
    }
  }

  for (const community of communityResult.rows) {
    const row = rows.get(community.packet_key);
    if (row) row.communityId = community.community_id;
  }

  return rows;
}
