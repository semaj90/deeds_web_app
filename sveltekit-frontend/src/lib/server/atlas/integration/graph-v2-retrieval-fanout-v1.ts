import { pool } from '$lib/server/db/client.js';

const SHA256_REVISION = /^sha256:[0-9a-f]{64}$/i;
const MAX_SEEDS = 64;
const MAX_CANDIDATES = 64;

export interface GraphV2FanoutSeedV1 {
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
}

export interface GraphV2FanoutCandidateV1 extends GraphV2FanoutSeedV1 {
  workspaceRevision: string;
  graphRevision: string;
  relationId: string;
  relationKind: string;
}

interface GraphV2FanoutCandidateRowV1 {
  packet_key: string;
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  graph_revision: string;
  relation_id: string;
  relation_kind: string;
}

export async function readGraphV2RetrievalFanoutStrictV1(input: {
  seeds: readonly GraphV2FanoutSeedV1[];
  workspaceRevision: string;
  graphRevision: string;
  limit?: number;
}): Promise<GraphV2FanoutCandidateV1[]> {
  if (!SHA256_REVISION.test(input.workspaceRevision) || !/^[a-f0-9]{64}$/i.test(input.graphRevision)) return [];
  const seeds = input.seeds
    .filter((seed) => seed.packetKey.trim() && seed.sourceRef.trim() && SHA256_REVISION.test(seed.sourceRevision))
    .slice(0, MAX_SEEDS);
  if (seeds.length === 0) return [];
  const limit = Math.max(1, Math.min(MAX_CANDIDATES, Math.trunc(input.limit ?? MAX_CANDIDATES)));
  const result = await pool.query<GraphV2FanoutCandidateRowV1>(
    `WITH snapshot AS MATERIALIZED (
       SELECT snapshot_id, workspace_revision, graph_revision, topology_hash
       FROM atlas_graph_snapshots_v2
       WHERE status = 'VALIDATED'
         AND workspace_revision = $1
         AND graph_revision = $2
       ORDER BY finalized_at DESC NULLS LAST, created_at DESC
       LIMIT 1
     ), seed_input AS (
       SELECT * FROM unnest($3::text[], $4::text[], $5::text[])
         AS s(packet_key, source_ref, source_revision)
     ), seed_nodes AS (
       SELECT n.snapshot_id, n.node_key, n.source_ref
       FROM snapshot s
       JOIN atlas_graph_nodes_v2 n ON n.snapshot_id = s.snapshot_id
       JOIN seed_input i ON i.packet_key = n.packet_key AND i.source_ref = n.source_ref
       JOIN atlas_packets p ON p.packet_key = i.packet_key
         AND p.source_ref = i.source_ref
         AND p.source_revision = i.source_revision
         AND p.workspace_revision_key = s.workspace_revision
       WHERE n.node_type = 'packet'
         AND n.source_revision = i.source_revision
         AND n.source_revision ~ '^sha256:[0-9a-f]{64}$'
     ), related_nodes AS (
       SELECT s.snapshot_id, e.edge_key AS relation_id, e.edge_type AS relation_kind,
              CASE WHEN e.source_node_key = seed.node_key THEN e.target_node_key ELSE e.source_node_key END AS node_key
       FROM snapshot s
       JOIN seed_nodes seed ON seed.snapshot_id = s.snapshot_id
       JOIN atlas_graph_edges_v2 e ON e.snapshot_id = s.snapshot_id
         AND (e.source_node_key = seed.node_key OR e.target_node_key = seed.node_key)
       UNION ALL
       SELECT s.snapshot_id, r.relation_id, r.relation_type,
              peer.node_key
       FROM snapshot s
       JOIN seed_nodes seed ON seed.snapshot_id = s.snapshot_id
       JOIN atlas_graph_relation_participants_v2 member
         ON member.snapshot_id = s.snapshot_id AND member.node_key = seed.node_key
       JOIN atlas_graph_relation_events_v2 r
         ON r.snapshot_id = member.snapshot_id AND r.relation_id = member.relation_id
        AND r.topology_hash = s.topology_hash
        AND r.source_ref = seed.source_ref
        AND length(btrim(r.evidence_span)) > 0
       JOIN atlas_graph_relation_participants_v2 peer
         ON peer.snapshot_id = member.snapshot_id AND peer.relation_id = member.relation_id
        AND peer.node_key <> seed.node_key
     )
     SELECT DISTINCT p.packet_key, p.source_ref, p.source_revision,
            s.workspace_revision, s.graph_revision,
            related.relation_id, related.relation_kind
     FROM related_nodes related
     JOIN snapshot s ON s.snapshot_id = related.snapshot_id
     JOIN atlas_graph_nodes_v2 n ON n.snapshot_id = related.snapshot_id AND n.node_key = related.node_key
     JOIN atlas_packets p ON p.packet_key = n.packet_key
       AND p.source_ref = n.source_ref
       AND p.source_revision = n.source_revision
       AND p.workspace_revision_key = s.workspace_revision
     WHERE n.node_type = 'packet'
       AND n.packet_key IS NOT NULL
       AND n.source_ref IS NOT NULL
       AND n.source_revision ~ '^sha256:[0-9a-f]{64}$'
       AND p.source_revision ~ '^sha256:[0-9a-f]{64}$'
     ORDER BY related.relation_kind, p.packet_key
     LIMIT $6::int`,
    [
      input.workspaceRevision,
      input.graphRevision,
      seeds.map((seed) => seed.packetKey),
      seeds.map((seed) => seed.sourceRef),
      seeds.map((seed) => seed.sourceRevision),
      limit,
    ],
  );
  return result.rows.filter((row) =>
    typeof row.packet_key === 'string'
    && typeof row.source_ref === 'string'
    && typeof row.source_revision === 'string'
    && SHA256_REVISION.test(row.source_revision)
    && row.workspace_revision === input.workspaceRevision
    && row.graph_revision === input.graphRevision
    && typeof row.relation_id === 'string'
    && typeof row.relation_kind === 'string',
  ).map((row) => ({
    packetKey: row.packet_key,
    sourceRef: row.source_ref,
    sourceRevision: row.source_revision,
    workspaceRevision: row.workspace_revision,
    graphRevision: row.graph_revision,
    relationId: row.relation_id,
    relationKind: row.relation_kind,
  }));
}
