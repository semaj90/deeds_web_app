import { pool } from '$lib/server/db/client.js';

const SHA256_REVISION = /^sha256:[0-9a-f]{64}$/i;
const MAX_SEEDS = 64;
const MAX_CANDIDATES = 64;
const CODE_RELATION_TYPES = new Set([
  'CALLS', 'IMPORTS', 'EXPORTS', 'REFERENCES', 'IMPLEMENTS', 'EXTENDS', 'DEPENDS_ON',
  'TESTS', 'RUNE_DEPENDENCY', 'EVENT_DISPATCH', 'API_CONTRACT_OBSERVED', 'USES_CONCEPT',
]);

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
  relationConfidence: number;
}

interface GraphV2FanoutCandidateRowV1 {
  packet_key: string;
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  graph_revision: string;
  relation_id: string;
  relation_kind: string;
  relation_confidence: number | string;
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
       SELECT snapshot_id,
              source_manifest->>'workspaceRevision' AS workspace_revision,
              topology_hash AS graph_revision,
              topology_hash
       FROM atlas_graph_snapshots_v2
       WHERE status = 'VALIDATED'
         AND source_manifest->>'workspaceRevision' = $1
         AND topology_hash = $2
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
         AND n.properties->>'workspaceRevision' = s.workspace_revision
         AND n.properties->>'sourceRevision' = i.source_revision
         AND n.properties->>'sourceRevision' ~ '^sha256:[0-9a-f]{64}$'
     ), qualified_relations AS MATERIALIZED (
       SELECT r.snapshot_id, r.relation_id, r.relation_type, r.source_ref,
              r.evidence_span, r.confidence, r.topology_hash
       FROM snapshot s
       JOIN atlas_graph_relation_events_v2 r ON r.snapshot_id = s.snapshot_id
         AND r.topology_hash = s.topology_hash
         AND length(btrim(r.evidence_span)) > 0
       JOIN atlas_graph_relation_participants_v2 participant
         ON participant.snapshot_id = r.snapshot_id AND participant.relation_id = r.relation_id
       JOIN atlas_graph_nodes_v2 participant_node
         ON participant_node.snapshot_id = participant.snapshot_id
        AND participant_node.node_key = participant.node_key
       WHERE participant_node.properties->>'workspaceRevision' = s.workspace_revision
         AND participant_node.properties->>'sourceRevision' ~ '^sha256:[0-9a-f]{64}$'
         AND EXISTS (
           SELECT 1
           FROM atlas_packets participant_packet
           WHERE participant_packet.source_ref = participant_node.source_ref
             AND participant_packet.source_revision = participant_node.properties->>'sourceRevision'
             AND participant_packet.workspace_revision_key = s.workspace_revision
             AND (participant_node.packet_key IS NULL OR participant_packet.packet_key = participant_node.packet_key)
         )
       GROUP BY r.snapshot_id, r.relation_id, r.relation_type, r.source_ref,
                r.evidence_span, r.confidence, r.topology_hash
       HAVING COUNT(DISTINCT participant.node_key) >= 3
          AND BOOL_OR(participant_node.source_ref = r.source_ref)
     ), related_nodes AS (
       SELECT s.snapshot_id, e.edge_key AS relation_id, e.edge_type AS relation_kind,
              e.confidence AS relation_confidence,
              CASE WHEN e.source_node_key = seed.node_key THEN e.target_node_key ELSE e.source_node_key END AS node_key
       FROM snapshot s
       JOIN seed_nodes seed ON seed.snapshot_id = s.snapshot_id
       JOIN atlas_graph_edges_v2 e ON e.snapshot_id = s.snapshot_id
         AND (e.source_node_key = seed.node_key OR e.target_node_key = seed.node_key)
         AND e.edge_type IN ('CALLS', 'IMPORTS', 'REFERENCES', 'DEPENDS_ON', 'IMPLEMENTS', 'USES_CONCEPT')
       UNION ALL
       SELECT s.snapshot_id, r.relation_id, r.relation_type, r.confidence,
              peer.node_key
       FROM snapshot s
       JOIN seed_nodes seed ON seed.snapshot_id = s.snapshot_id
       JOIN atlas_graph_relation_participants_v2 member
         ON member.snapshot_id = s.snapshot_id AND member.node_key = seed.node_key
       JOIN qualified_relations r
         ON r.snapshot_id = member.snapshot_id AND r.relation_id = member.relation_id
        AND r.topology_hash = s.topology_hash
       JOIN atlas_graph_relation_participants_v2 peer
         ON peer.snapshot_id = member.snapshot_id AND peer.relation_id = member.relation_id
        AND peer.node_key <> seed.node_key
       WHERE r.relation_type IN (
         'CALLS', 'IMPORTS', 'EXPORTS', 'REFERENCES', 'IMPLEMENTS', 'EXTENDS',
         'DEPENDS_ON', 'TESTS', 'RUNE_DEPENDENCY', 'EVENT_DISPATCH', 'API_CONTRACT_OBSERVED'
       )
     )
     SELECT DISTINCT p.packet_key, p.source_ref, p.source_revision,
            s.workspace_revision, s.graph_revision,
            related.relation_id, related.relation_kind, related.relation_confidence
     FROM related_nodes related
     JOIN snapshot s ON s.snapshot_id = related.snapshot_id
     JOIN atlas_graph_nodes_v2 n ON n.snapshot_id = related.snapshot_id AND n.node_key = related.node_key
     JOIN atlas_packets p ON p.packet_key = n.packet_key
       AND p.source_ref = n.source_ref
       AND p.source_revision = n.properties->>'sourceRevision'
       AND p.workspace_revision_key = s.workspace_revision
     WHERE n.node_type = 'packet'
       AND n.packet_key IS NOT NULL
       AND n.source_ref IS NOT NULL
       AND n.properties->>'workspaceRevision' = s.workspace_revision
       AND n.properties->>'sourceRevision' ~ '^sha256:[0-9a-f]{64}$'
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
    && typeof row.relation_kind === 'string'
    && CODE_RELATION_TYPES.has(row.relation_kind)
    && Number.isFinite(Number(row.relation_confidence))
    && Number(row.relation_confidence) >= 0
    && Number(row.relation_confidence) <= 1,
  ).map((row) => ({
    packetKey: row.packet_key,
    sourceRef: row.source_ref,
    sourceRevision: row.source_revision,
    workspaceRevision: row.workspace_revision,
    graphRevision: row.graph_revision,
    relationId: row.relation_id,
    relationKind: row.relation_kind,
    relationConfidence: Number(row.relation_confidence),
  }));
}
