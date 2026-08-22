#!/usr/bin/env tsx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { CODEBASE_COLLECTION_PRIORITY } from '../../src/lib/server/retrieval/collection-aliases.js';
import { evaluateFanoutAdmissionV1 } from '../../src/lib/server/atlas/graph/fanout-admission-v1.js';
import { verifyGraphSnapshotRevisionV1 } from '../../src/lib/server/atlas/graph/graph-snapshot-revision-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const DATABASE_URL = process.env.DATABASE_URL;
const QDRANT_URL = String(process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const QDRANT_API_KEY = String(process.env.QDRANT_API_KEY ?? '').trim();
const COLLECTION = CODEBASE_COLLECTION_PRIORITY[0];
const PRODUCER_REVISION = 'atlas.fanout-admission-readonly-proof.2026-08-22.v2';
const REQUESTED_SNAPSHOT = process.argv.find((arg) => arg.startsWith('--snapshot='))?.slice('--snapshot='.length) ?? null;
const OUTPUT = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_FANOUT_ADMISSION_OUT ?? 'docs/reports/fanout-admission-readonly.json',
);

if (!DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
if (COLLECTION !== 'codebase_chunks_768_v2') throw new Error(`CANONICAL_QDRANT_COLLECTION_UNEXPECTED:${COLLECTION}`);

const REQUIRED_SNAPSHOT_COLUMNS = [
  'workspace_revision',
  'source_inventory_revision',
  'graph_revision',
  'identity_contract_version',
  'parser_contract_version',
  'revision_checksum',
] as const;

function pointIdForJson(value: string): string | number {
  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) return numeric;
  }
  return value;
}

async function qdrantRetrieve(pointId: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(COLLECTION)}/points`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}),
    },
    body: JSON.stringify({
      ids: [pointIdForJson(pointId)],
      with_payload: true,
      with_vector: false,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`QDRANT_RETRIEVE_FAILED:${response.status}:${body.slice(0, 300)}`);
  const parsed = JSON.parse(body) as { result?: Array<{ payload?: Record<string, unknown> | null }> };
  const points = parsed.result ?? [];
  if (points.length === 0) return null;
  if (points.length !== 1) throw new Error(`QDRANT_POINT_ID_AMBIGUOUS:${pointId}:${points.length}`);
  return points[0]?.payload ?? null;
}

async function emit(status: string, detail: Record<string, unknown>, exitCode = 0): Promise<void> {
  const receipt = {
    schema: 'atlas.fanout-admission-readonly-proof.v2',
    status,
    readOnly: true,
    postgresWritesAttempted: false,
    qdrantWritesAttempted: false,
    qdrantVectorsRead: false,
    neo4jWritesAttempted: false,
    canonicalWritesAttempted: false,
    collection: COLLECTION,
    producerRevision: PRODUCER_REVISION,
    ...detail,
  };
  await mkdir(path.dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
  if (exitCode) process.exitCode = exitCode;
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1, connectionTimeoutMillis: 5_000, statement_timeout: 15_000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');

    const columns = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'atlas_graph_snapshots_v2' AND column_name = ANY($1::text[]))
            OR (table_name = 'atlas_graph_nodes_v2' AND column_name = 'source_revision')
          )`,
      [REQUIRED_SNAPSHOT_COLUMNS],
    );
    const snapshotColumns = new Set(
      columns.rows.filter((row) => row.table_name === 'atlas_graph_snapshots_v2').map((row) => row.column_name),
    );
    const missingSnapshotColumns = REQUIRED_SNAPSHOT_COLUMNS.filter((column) => !snapshotColumns.has(column));
    const nodeSourceRevisionColumn = columns.rows.some(
      (row) => row.table_name === 'atlas_graph_nodes_v2' && row.column_name === 'source_revision',
    );
    if (missingSnapshotColumns.length || !nodeSourceRevisionColumn) {
      await emit('GRAPH_REVISION_SCHEMA_MISSING', {
        missingSnapshotColumns,
        nodeSourceRevisionColumn,
        migration: 'sveltekit-frontend/drizzle/manual/20260822_graph_snapshot_revision_owner_v1.sql',
      }, 2);
      return;
    }

    const snapshotResult = REQUESTED_SNAPSHOT
      ? await client.query(
          `SELECT snapshot_id, source_manifest, source_hash, topology_hash, policy_hash,
                  workspace_revision, source_inventory_revision, graph_revision,
                  identity_contract_version, parser_contract_version, revision_checksum
             FROM atlas_graph_snapshots_v2
            WHERE snapshot_id = $1 AND status = 'VALIDATED'`,
          [REQUESTED_SNAPSHOT],
        )
      : await client.query(
          `SELECT snapshot_id, source_manifest, source_hash, topology_hash, policy_hash,
                  workspace_revision, source_inventory_revision, graph_revision,
                  identity_contract_version, parser_contract_version, revision_checksum
             FROM atlas_graph_snapshots_v2
            WHERE status = 'VALIDATED'
              AND workspace_revision IS NOT NULL
              AND source_inventory_revision IS NOT NULL
              AND graph_revision IS NOT NULL
              AND revision_checksum IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 1`,
        );

    if (snapshotResult.rowCount !== 1) {
      await emit('NO_REVISION_AWARE_VALIDATED_GRAPH_SNAPSHOT', { requestedSnapshot: REQUESTED_SNAPSHOT }, 3);
      return;
    }

    const snapshotRow = snapshotResult.rows[0] as any;
    const manifest = snapshotRow.source_manifest ?? {};
    let snapshotRevision;
    try {
      snapshotRevision = verifyGraphSnapshotRevisionV1({
        schema: 'atlas.graph-snapshot-revision.v1',
        snapshotId: snapshotRow.snapshot_id,
        workspaceRevision: snapshotRow.workspace_revision,
        sourceInventoryRevision: snapshotRow.source_inventory_revision,
        graphRevision: snapshotRow.graph_revision,
        identityContractVersion: snapshotRow.identity_contract_version,
        parserContractVersion: snapshotRow.parser_contract_version,
        sourceInventoryHash: snapshotRow.source_hash,
        topologyHash: snapshotRow.topology_hash,
        policyHash: snapshotRow.policy_hash,
        producerRevision: String(manifest.revisionProducer ?? manifest.materializer ?? 'unknown'),
        revisionChecksum: snapshotRow.revision_checksum,
      });
    } catch (error) {
      await emit('GRAPH_SNAPSHOT_REVISION_READBACK_REJECTED', {
        snapshotId: snapshotRow.snapshot_id,
        error: error instanceof Error ? error.message : String(error),
      }, 4);
      return;
    }

    const boundNode = await client.query<{
      node_key: string;
      packet_key: string;
      tree_node_id: string | null;
      source_ref: string;
      source_revision: string;
      edge_key: string;
      source_node_key: string;
      target_node_key: string;
    }>(
      `SELECT n.node_key, n.packet_key, n.tree_node_id::text, n.source_ref, n.source_revision,
              e.edge_key, e.source_node_key, e.target_node_key
         FROM atlas_graph_nodes_v2 n
         JOIN atlas_graph_edges_v2 e
           ON e.snapshot_id = n.snapshot_id
          AND (e.source_node_key = n.node_key OR e.target_node_key = n.node_key)
        WHERE n.snapshot_id = $1
          AND n.packet_key IS NOT NULL AND length(btrim(n.packet_key)) > 0
          AND n.source_revision IS NOT NULL AND n.source_revision ~ '^sha256:[a-f0-9]{64}$'
          AND n.source_ref IS NOT NULL AND length(btrim(n.source_ref)) > 0
        ORDER BY n.node_key, e.edge_key
        LIMIT 1`,
      [snapshotRevision.snapshotId],
    );

    if (boundNode.rowCount !== 1) {
      await emit('SOURCE_BINDING_GAP', {
        snapshotId: snapshotRevision.snapshotId,
        workspaceWorldRevision: snapshotRevision.workspaceRevision,
        graphRevision: snapshotRevision.graphRevision,
        reason: 'NO_SOURCE_REVISION_QUALIFIED_EDGE_BOUND_NODE',
      }, 5);
      return;
    }

    const node = boundNode.rows[0]!;
    const endpointKeys = [...new Set([node.source_node_key, node.target_node_key])];
    const endpointBinding = await client.query<{ node_key: string }>(
      `SELECT node_key
         FROM atlas_graph_nodes_v2
        WHERE snapshot_id = $1 AND node_key = ANY($2::text[])
        ORDER BY node_key`,
      [snapshotRevision.snapshotId, endpointKeys],
    );
    if (endpointBinding.rows.length !== endpointKeys.length) {
      await emit('EDGE_SNAPSHOT_BINDING_REJECTED', {
        snapshotId: snapshotRevision.snapshotId,
        edgeKey: node.edge_key,
        endpointKeys,
        observedEndpointKeys: endpointBinding.rows.map((row) => row.node_key),
      }, 6);
      return;
    }

    const packetResult = await client.query<{
      packet_key: string;
      qdrant_point_id: string;
      representation_revision: number;
      source_representation_id: string | null;
      qdrant_collection: string | null;
      qdrant_vector_dim: number | null;
    }>(
      `SELECT packet_key, qdrant_point_id, representation_revision,
              source_representation_id, qdrant_collection, qdrant_vector_dim
         FROM atlas_packets
        WHERE packet_key = $1
          AND qdrant_point_id IS NOT NULL
          AND representation_revision > 0
          AND source_representation_id = 'semantic_768'
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 2`,
      [node.packet_key],
    );

    if (packetResult.rowCount !== 1) {
      await emit(packetResult.rowCount === 0
        ? 'PACKET_QDRANT_PROJECTION_REFERENCE_MISSING'
        : 'PACKET_QDRANT_PROJECTION_REFERENCE_AMBIGUOUS', {
        snapshotId: snapshotRevision.snapshotId,
        graphNodeKey: node.node_key,
        packetKey: node.packet_key,
        packetRowsObserved: packetResult.rowCount,
      }, 7);
      return;
    }

    const packet = packetResult.rows[0]!;
    const qdrantPayload = await qdrantRetrieve(packet.qdrant_point_id);
    const admission = evaluateFanoutAdmissionV1({
      graphSnapshotRevision: snapshotRevision,
      graphNode: {
        snapshotId: snapshotRevision.snapshotId,
        graphNodeKey: node.node_key,
        canonicalId: null,
        packetKey: node.packet_key,
        symbolVersionId: null,
        sourceRef: node.source_ref,
        treeNodeId: node.tree_node_id,
        sourceRevision: node.source_revision,
        evidenceRefs: [`graph-edge:${node.edge_key}`, `qdrant-point:${packet.qdrant_point_id}`],
      },
      qdrantPayload,
      candidateSnapshotRevision: `fanout:${snapshotRevision.graphRevision}:semantic_768:${packet.representation_revision}`,
      expectedRepresentationRevision: packet.representation_revision,
      producerRevision: PRODUCER_REVISION,
    });

    const firstBlocker = admission.blockers[0] ?? null;
    const status = admission.admitted
      ? 'FANOUT_ADMISSION_READONLY_PROVEN'
      : firstBlocker === 'WORKSPACE_WORLD_REVISION_MISMATCH'
        ? 'QDRANT_WORLD_REVISION_GAP'
        : firstBlocker === 'SOURCE_REVISION_MISMATCH'
          ? 'QDRANT_SOURCE_REVISION_GAP'
          : firstBlocker === 'GRAPH_REVISION_MISMATCH'
            ? 'QDRANT_GRAPH_REVISION_GAP'
            : admission.status === 'CANONICAL_IDENTITY_REJECTED'
              ? 'QDRANT_IDENTITY_GAP'
              : 'FANOUT_ADMISSION_BLOCKED';

    await emit(status, {
      snapshotId: snapshotRevision.snapshotId,
      workspaceWorldRevision: snapshotRevision.workspaceRevision,
      graphRevision: snapshotRevision.graphRevision,
      graphNodeKey: node.node_key,
      sourceRevision: node.source_revision,
      edgeBinding: {
        edgeKey: node.edge_key,
        sourceNodeKey: node.source_node_key,
        targetNodeKey: node.target_node_key,
        sameSnapshotProven: true,
      },
      packetProjection: {
        packetKey: packet.packet_key,
        qdrantPointId: packet.qdrant_point_id,
        sourceRepresentationId: packet.source_representation_id,
        representationRevision: packet.representation_revision,
        packetDeclaredCollection: packet.qdrant_collection,
        packetVectorDimension: packet.qdrant_vector_dim,
      },
      qdrantPayloadPresent: qdrantPayload !== null,
      admission,
      fanoutMayNormalizeToCandidateOrdinal: admission.admitted,
    }, admission.admitted ? 0 : 8);
  } finally {
    try { await client.query('ROLLBACK'); } finally {
      client.release();
      await pool.end();
    }
  }
}

main().catch(async (error) => {
  await emit('FANOUT_ADMISSION_PROOF_ERROR', {
    error: error instanceof Error ? error.message : String(error),
  }, 1);
});
