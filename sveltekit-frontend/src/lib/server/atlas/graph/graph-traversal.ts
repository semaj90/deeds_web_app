import { randomUUID } from 'node:crypto';
import { pool } from '$lib/server/db/client.js';
import type {
  GraphTraverseRequestV1,
  GraphTraversalDirection,
  GraphViewEdgeV1,
  GraphViewNodeV1,
  GraphViewPacketV1,
} from './graph-runtime-contracts.js';

const MAX_HOPS = 5;
const MAX_NODES = 2_000;
const MAX_SEEDS = 64;
const MAX_EDGE_TYPES = 32;

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value as number)));
}

function normalizeDirection(value: GraphTraversalDirection | undefined): GraphTraversalDirection {
  return value === 'inbound' || value === 'both' ? value : 'outbound';
}

export async function traverseGraphV1(input: GraphTraverseRequestV1): Promise<GraphViewPacketV1> {
  if (!input.snapshotId?.trim()) throw new Error('snapshotId is required');

  const seedNodeKeys = [...new Set(input.seedNodeKeys?.filter(Boolean) ?? [])].slice(0, MAX_SEEDS);
  if (seedNodeKeys.length === 0) throw new Error('at least one seedNodeKey is required');

  const maxHops = clampInt(input.maxHops, 2, 0, MAX_HOPS);
  const maxNodes = clampInt(input.maxNodes, 512, 1, MAX_NODES);
  const direction = normalizeDirection(input.direction);
  const edgeTypes = [...new Set(input.edgeTypes?.filter(Boolean) ?? [])].slice(0, MAX_EDGE_TYPES);

  const result = await pool.query<{
    node_key: string;
    node_type: string;
    packet_key: string | null;
    source_ref: string | null;
    properties: Record<string, unknown> | null;
    hop: number;
  }>(
    `WITH RECURSIVE walk(node_key, hop, path) AS (
       SELECT seed.node_key, 0, ARRAY[seed.node_key]::text[]
       FROM unnest($2::text[]) AS seed(node_key)

       UNION ALL

       SELECT
         CASE
           WHEN $5::text = 'inbound' THEN e.source_node_key
           WHEN $5::text = 'outbound' THEN e.target_node_key
           WHEN e.source_node_key = w.node_key THEN e.target_node_key
           ELSE e.source_node_key
         END AS node_key,
         w.hop + 1,
         w.path || CASE
           WHEN $5::text = 'inbound' THEN e.source_node_key
           WHEN $5::text = 'outbound' THEN e.target_node_key
           WHEN e.source_node_key = w.node_key THEN e.target_node_key
           ELSE e.source_node_key
         END
       FROM walk w
       JOIN atlas_graph_edges_v2 e
         ON e.snapshot_id = $1::uuid
        AND (
          ($5::text = 'outbound' AND e.source_node_key = w.node_key) OR
          ($5::text = 'inbound' AND e.target_node_key = w.node_key) OR
          ($5::text = 'both' AND (e.source_node_key = w.node_key OR e.target_node_key = w.node_key))
        )
       WHERE w.hop < $3::int
         AND (cardinality($4::text[]) = 0 OR e.edge_type = ANY($4::text[]))
         AND NOT (
           CASE
             WHEN $5::text = 'inbound' THEN e.source_node_key
             WHEN $5::text = 'outbound' THEN e.target_node_key
             WHEN e.source_node_key = w.node_key THEN e.target_node_key
             ELSE e.source_node_key
           END = ANY(w.path)
         )
     ), ranked AS (
       SELECT node_key, MIN(hop) AS hop
       FROM walk
       GROUP BY node_key
       ORDER BY MIN(hop), node_key
       LIMIT $6::int
     )
     SELECT n.node_key, n.node_type, n.packet_key, n.source_ref, n.properties, r.hop
     FROM ranked r
     JOIN atlas_graph_nodes_v2 n
       ON n.snapshot_id = $1::uuid
      AND n.node_key = r.node_key
     ORDER BY r.hop, n.node_key`,
    [input.snapshotId, seedNodeKeys, maxHops, edgeTypes, direction, maxNodes + 1],
  );

  const truncated = result.rows.length > maxNodes;
  const nodeRows = result.rows.slice(0, maxNodes);
  const nodeKeys = nodeRows.map((row) => row.node_key);

  const edgeResult = nodeKeys.length === 0
    ? { rows: [] as Array<{
        edge_key: string;
        source_node_key: string;
        target_node_key: string;
        edge_type: string;
        weight: number;
        confidence: number;
        hop: number;
      }> }
    : await pool.query<{
        edge_key: string;
        source_node_key: string;
        target_node_key: string;
        edge_type: string;
        weight: number;
        confidence: number;
        hop: number;
      }>(
        `SELECT e.edge_key, e.source_node_key, e.target_node_key, e.edge_type,
                e.weight, e.confidence,
                GREATEST(src.hop, dst.hop) AS hop
         FROM atlas_graph_edges_v2 e
         JOIN (
           SELECT * FROM unnest($2::text[], $3::int[]) AS t(node_key, hop)
         ) src ON src.node_key = e.source_node_key
         JOIN (
           SELECT * FROM unnest($2::text[], $3::int[]) AS t(node_key, hop)
         ) dst ON dst.node_key = e.target_node_key
         WHERE e.snapshot_id = $1::uuid
           AND (cardinality($4::text[]) = 0 OR e.edge_type = ANY($4::text[]))
         ORDER BY hop, e.edge_key`,
        [input.snapshotId, nodeKeys, nodeRows.map((row) => row.hop), edgeTypes],
      );

  const nodes: GraphViewNodeV1[] = nodeRows.map((row) => ({
    id: row.node_key,
    type: row.node_type,
    label: row.node_key,
    packetKey: row.packet_key,
    sourceRef: row.source_ref,
    hop: row.hop,
    properties: row.properties ?? {},
  }));

  const edges: GraphViewEdgeV1[] = edgeResult.rows.map((row) => ({
    id: row.edge_key,
    source: row.source_node_key,
    target: row.target_node_key,
    type: row.edge_type,
    weight: Number(row.weight),
    confidence: Number(row.confidence),
    hop: Number(row.hop),
  }));

  return {
    schema: 'atlas.graph-view.v1',
    snapshotId: input.snapshotId,
    queryId: randomUUID(),
    executor: 'postgres',
    nodes,
    edges,
    truncated,
    maxHops,
    maxNodes,
  };
}
