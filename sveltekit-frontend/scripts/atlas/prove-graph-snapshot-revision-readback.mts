#!/usr/bin/env tsx

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const OUT = path.resolve(
  REPO_ROOT,
  process.env.ATLAS_GRAPH_SNAPSHOT_REVISION_OUT ?? 'docs/reports/graph-snapshot-revision-readback.json',
);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const requiredSnapshotColumns = ['snapshot_id', 'source_manifest', 'source_hash', 'topology_hash', 'policy_hash'];

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function manifestRevisionFields(manifest: unknown) {
  const record = manifest && typeof manifest === 'object' ? manifest as Record<string, unknown> : {};
  return {
    workspaceRevision: record.workspaceRevision ?? record.workspace_revision ?? null,
    sourceInventoryRevision: record.sourceInventoryRevision ?? record.source_inventory_revision ?? null,
    graphRevision: record.graphRevision ?? record.graph_revision ?? null,
    identityContractVersion: record.identityContractVersion ?? record.identity_contract_version ?? null,
    parserContractVersion: record.parserContractVersion ?? record.parser_contract_version ?? null,
    producerRevision: record.producerRevision ?? record.producer_revision ?? null,
  };
}

await pool.query('BEGIN READ ONLY');
try {
  const tableResult = await pool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = ANY($1::text[])
  `, [['atlas_graph_snapshots_v2', 'atlas_graph_nodes_v2', 'atlas_graph_edges_v2']]);
  const tables = new Set(tableResult.rows.map((row) => row.table_name));

  const columnResult = tables.has('atlas_graph_snapshots_v2')
    ? await pool.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'atlas_graph_snapshots_v2'
      `)
    : { rows: [] as { column_name: string }[] };
  const columns = new Set(columnResult.rows.map((row) => row.column_name));
  const requiredColumnsPresent = requiredSnapshotColumns.every((column) => columns.has(column));

  const snapshotResult = tables.has('atlas_graph_snapshots_v2') && requiredColumnsPresent
    ? await pool.query<{
        snapshot_id: string;
        source_manifest: unknown;
        source_hash: string;
        topology_hash: string;
        policy_hash: string;
      }>(`
        SELECT snapshot_id, source_manifest, source_hash, topology_hash, policy_hash
        FROM atlas_graph_snapshots_v2
        ORDER BY finalized_at DESC NULLS LAST, created_at DESC, snapshot_id
        LIMIT 1
      `)
    : { rows: [] as { snapshot_id: string; source_manifest: unknown; source_hash: string; topology_hash: string; policy_hash: string }[] };

  const snapshot = snapshotResult.rows[0] ?? null;
  const nodeCountResult = snapshot && tables.has('atlas_graph_nodes_v2')
    ? await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM atlas_graph_nodes_v2 WHERE snapshot_id = $1', [snapshot.snapshot_id])
    : { rows: [{ count: '0' }] };
  const edgeCountResult = snapshot && tables.has('atlas_graph_edges_v2')
    ? await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM atlas_graph_edges_v2 WHERE snapshot_id = $1', [snapshot.snapshot_id])
    : { rows: [{ count: '0' }] };
  const nodeReadback = snapshot && tables.has('atlas_graph_nodes_v2')
    ? await pool.query<{ snapshot_id: string; node_key: string }>(
        'SELECT snapshot_id, node_key FROM atlas_graph_nodes_v2 WHERE snapshot_id = $1 ORDER BY node_key LIMIT 1',
        [snapshot.snapshot_id],
      )
    : { rows: [] as { snapshot_id: string; node_key: string }[] };
  const edgeReadback = snapshot && tables.has('atlas_graph_edges_v2')
    ? await pool.query<{ snapshot_id: string; edge_key: string }>(
        'SELECT snapshot_id, edge_key FROM atlas_graph_edges_v2 WHERE snapshot_id = $1 ORDER BY edge_key LIMIT 1',
        [snapshot.snapshot_id],
      )
    : { rows: [] as { snapshot_id: string; edge_key: string }[] };

  const revisions = snapshot ? manifestRevisionFields(snapshot.source_manifest) : null;
  const manifestRevisionComplete = revisions
    ? Object.values(revisions).every(hasText)
    : false;
  const snapshotReadbackProven = Boolean(
    snapshot &&
    hasText(snapshot.source_hash) &&
    hasText(snapshot.topology_hash) &&
    hasText(snapshot.policy_hash) &&
    nodeReadback.rows.every((row) => row.snapshot_id === snapshot.snapshot_id) &&
    edgeReadback.rows.every((row) => row.snapshot_id === snapshot.snapshot_id),
  );

  const status = !tables.has('atlas_graph_snapshots_v2') || !requiredColumnsPresent
    ? 'SNAPSHOT_OWNER_NOT_READY'
    : !snapshot
      ? 'SNAPSHOT_OWNER_IDENTIFIED_NO_ROWS'
      : snapshotReadbackProven && manifestRevisionComplete
        ? 'SNAPSHOT_OWNER_READBACK_PROVEN_REVISION_OWNER_REVIEW_REQUIRED'
        : 'SNAPSHOT_OWNER_READBACK_PROVEN_REVISION_BLOCKED';

  const proof = {
    schemaVersion: 'atlas.graph-snapshot-revision-readback.v1',
    status,
    readOnly: true,
    canonicalWriteAttempted: false,
    canonicalPersistenceAuthorized: false,
    tables: Object.fromEntries(['atlas_graph_snapshots_v2', 'atlas_graph_nodes_v2', 'atlas_graph_edges_v2'].map((table) => [table, tables.has(table)])),
    requiredSnapshotColumns,
    requiredColumnsPresent,
    selectedSnapshotId: snapshot?.snapshot_id ?? null,
    snapshotReadbackProven,
    manifestRevisionComplete,
    revisions,
    nodeCount: Number(nodeCountResult.rows[0]?.count ?? 0),
    edgeCount: Number(edgeCountResult.rows[0]?.count ?? 0),
    selectedNodeReadback: nodeReadback.rows[0] ?? null,
    selectedEdgeReadback: edgeReadback.rows[0] ?? null,
    revisionOwnerProven: false,
    canonicalWrites: false,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...proof, output: OUT }, null, 2));
  if (status !== 'SNAPSHOT_OWNER_READBACK_PROVEN_REVISION_OWNER_REVIEW_REQUIRED') process.exitCode = 3;
} finally {
  await pool.query('ROLLBACK');
  await pool.end();
}
