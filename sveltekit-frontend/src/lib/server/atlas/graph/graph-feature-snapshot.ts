import { pool } from '$lib/server/db/client.js';
import { z } from 'zod';

export interface GraphFeatureSnapshotRowV1 {
  packetKey: string;
  graphRevision: string;
  pagerank: number | null;
  personalizedPageRank: number | null;
  communityId: string | null;
  algorithmRevisions: string[];
}

const graphFeatureSnapshotRowV1Schema = z.object({
  packetKey: z.string().min(1),
  graphRevision: z.string().min(1),
  pagerank: z.number().finite().nullable(),
  personalizedPageRank: z.number().finite().nullable(),
  communityId: z.string().min(1).nullable(),
  algorithmRevisions: z.array(z.string().min(1)),
}).strict();

export const graphFeatureSnapshotAdmissionV1Schema = z.object({
  schema: z.literal('atlas.graph-feature-snapshot-admission.v1'),
  status: z.enum(['ADMITTED', 'BLOCKED_CURRENT_GRAPH']),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  ordinalMapChecksum: z.string().min(1),
  rows: z.array(graphFeatureSnapshotRowV1Schema),
  rowCount: z.number().int().nonnegative(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  reason: z.string().min(1).nullable(),
}).strict().superRefine((admission, ctx) => {
  if (admission.rowCount !== admission.rows.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rowCount'], message: 'GRAPH_FEATURE_ROW_COUNT_MISMATCH' });
  }
  if (admission.status === 'ADMITTED' && admission.reason !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'ADMITTED_GRAPH_FEATURE_REASON_FORBIDDEN' });
  }
  if (admission.status === 'BLOCKED_CURRENT_GRAPH' && admission.reason === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'BLOCKED_GRAPH_FEATURE_REASON_REQUIRED' });
  }
});
export type GraphFeatureSnapshotAdmissionV1 = z.infer<typeof graphFeatureSnapshotAdmissionV1Schema>;

/**
 * Admit graph features only against a sealed current graph manifest. This is
 * intentionally pure: it validates an already-read projection and performs
 * no graph computation, database write, or promotion.
 */
export function admitCurrentGraphFeatureSnapshotV1(input: {
  workspaceRevision: string;
  graphRevision: string;
  ordinalMapChecksum: string;
  graphManifestStatus: 'SEALED_CURRENT' | 'UNAVAILABLE' | 'HISTORICAL';
  expectedPacketKeys: readonly string[];
  rows: readonly GraphFeatureSnapshotRowV1[];
}): GraphFeatureSnapshotAdmissionV1 {
  const expected = new Set(input.expectedPacketKeys.filter(Boolean));
  const rows = input.rows.map((row) => graphFeatureSnapshotRowV1Schema.parse(row));
  const seen = new Set<string>();
  let reason: string | null = null;

  if (input.graphManifestStatus !== 'SEALED_CURRENT') {
    reason = `GRAPH_MANIFEST_${input.graphManifestStatus}`;
  } else if (expected.size === 0) {
    reason = 'CURRENT_GRAPH_NODE_SET_EMPTY';
  } else if (rows.length !== expected.size) {
    reason = 'GRAPH_FEATURE_ROW_COUNT_MISMATCH';
  } else {
    for (const row of rows) {
      if (row.graphRevision !== input.graphRevision) {
        reason = 'GRAPH_FEATURE_REVISION_MISMATCH';
        break;
      }
      if (seen.has(row.packetKey)) {
        reason = 'GRAPH_FEATURE_DUPLICATE_PACKET_KEY';
        break;
      }
      if (!expected.has(row.packetKey)) {
        reason = 'GRAPH_FEATURE_UNKNOWN_PACKET_KEY';
        break;
      }
      seen.add(row.packetKey);
    }
    if (!reason && seen.size !== expected.size) reason = 'GRAPH_FEATURE_NODE_MISSING';
  }

  return graphFeatureSnapshotAdmissionV1Schema.parse({
    schema: 'atlas.graph-feature-snapshot-admission.v1',
    status: reason ? 'BLOCKED_CURRENT_GRAPH' : 'ADMITTED',
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision,
    ordinalMapChecksum: input.ordinalMapChecksum,
    rows,
    rowCount: rows.length,
    canonicalAuthority: false,
    writesPerformed: false,
    reason,
  });
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
