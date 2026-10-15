#!/usr/bin/env npx tsx
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { materializeCanonicalGraphSnapshotFromPostgres, type QueryLike } from '../../sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-postgres.js';
import { buildGraphSnapshotRevisionWriteV1 } from '../../sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-revision-v1.js';

function parseArg(name: string, fallback?: string): string | null {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback?.trim() || null;
}

function requiredArg(name: string, fallback?: string): string {
  const value = parseArg(name, fallback);
  if (!value) throw new Error(`${name.replace(/^--/, '').toUpperCase().replaceAll('-', '_')}_REQUIRED`);
  return value;
}

const root = resolve(import.meta.dirname, '..', '..');
dotenv.config({ path: resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(root, 'sveltekit-frontend/.env.local'), override: true });
const outputJson = parseArg('--output-json', resolve(root, 'graphify/frozen-graph-snapshot-v2.json'));
// Renamed from --workspace-id 2026-09-28: that name/value scoped the query to
// atlas_packets.workspace_id (a directory-path label, 1,196 meaningless distinct
// values), never the admitted revision. --workspace-revision now scopes to
// atlas_packets.workspace_revision_key (sha256:<64-hex>), matching every other
// admitted-revision-bound producer in this repo.
const workspaceRevision = requiredArg('--workspace-revision', process.env.PAGERANK_WORKSPACE_REVISION ?? process.env.PAGERANK_WORKSPACE_ID);
// GRAPH-SNAPSHOT-SCOPE-V2-01 (2026-09-28): workspace_revision alone still spans
// every repository undifferentiated (16,151 packets at the current admitted
// revision). --execution-id + --repository-id scope to a real
// graphify_execution_file_membership_v2 partition (7 real repository_id values
// live, e.g. "repo:root") and avoid a 2x join fan-out from multiple executions
// recording membership for the same (workspace_revision, repository_id) pair --
// see graph-snapshot-postgres.ts's PostgresGraphSnapshotInput doc comments for
// the live verification numbers.
const executionId = requiredArg('--execution-id', process.env.PAGERANK_EXECUTION_ID);
const repositoryId = requiredArg('--repository-id', process.env.PAGERANK_REPOSITORY_ID);
const snapshotId = requiredArg('--snapshot-id', process.env.PAGERANK_SNAPSHOT_ID);
const sourceInventorySnapshotId = requiredArg('--source-inventory-snapshot-id', process.env.PAGERANK_SOURCE_INVENTORY_SNAPSHOT_ID);
const identityContractVersion = requiredArg('--identity-contract-version', 'identity-contract-v1');
const parserContractVersion = requiredArg('--parser-contract-version', 'tree-sitter-typescript-v1');
const pool = new Pool({
  ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}),
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  max: 1,
  application_name: 'atlas-graph-snapshot-readonly-export-v2'
});
const client = await pool.connect();
const queryLike: QueryLike = {
  query: async <T = Record<string, unknown>,>(text: string, params?: readonly unknown[]) => {
    const result = await client.query(text, params as unknown[] | undefined);
    return { rows: result.rows as T[] };
  }
};

try {
  await client.query('BEGIN TRANSACTION READ ONLY');
  const materialization = await materializeCanonicalGraphSnapshotFromPostgres(queryLike, {
    snapshotId,
    workspaceRevision,
    executionId,
    repositoryId,
    sourceInventorySnapshotId,
    identityContractVersion,
    parserContractVersion
  });

  const revisionWrite = buildGraphSnapshotRevisionWriteV1({
    snapshotId,
    workspaceRevision,
    identityContractVersion,
    parserContractVersion,
    sourceInventoryHash: materialization.graphSnapshotProof.sourceInventoryHash,
    topologyHash: materialization.graphSnapshotProof.topologyHash,
    policyHash: materialization.graphSnapshotProof.policyHash,
    producerRevision: 'graph-snapshot-materializer-v1'
  });
  await client.query('COMMIT');

  const payload = {
    snapshotId: materialization.graphSnapshot.snapshotId,
    nodes: materialization.graphSnapshotNodes.map((node) => ({ ...node })),
    edges: materialization.graphSnapshotEdges.map((edge) => ({ ...edge })),
    manifest: {
      ...materialization.graphSnapshotManifest,
      workspaceRevision,
      sourceInventoryRevision: revisionWrite.revision.sourceInventoryRevision,
      graphRevision: revisionWrite.revision.graphRevision,
      revisionChecksum: revisionWrite.revision.revisionChecksum
    },
    proof: {
      ...materialization.graphSnapshotProof,
      graphRevision: revisionWrite.revision.graphRevision,
      revisionChecksum: revisionWrite.revision.revisionChecksum
    },
    graphSnapshot: {
      ...materialization.graphSnapshot,
      workspaceRevision: revisionWrite.revision.workspaceRevision,
      sourceInventoryRevision: revisionWrite.revision.sourceInventoryRevision,
      graphRevision: revisionWrite.revision.graphRevision,
      identityContractVersion: revisionWrite.revision.identityContractVersion,
      parserContractVersion: revisionWrite.revision.parserContractVersion,
      revisionChecksum: revisionWrite.revision.revisionChecksum
    },
    revision: revisionWrite.revision,
    databaseReadOnly: true
  };

  await writeFile(outputJson, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'GRAPH_SNAPSHOT_EXPORTED_READ_ONLY',
    output_json: outputJson,
    snapshot_id: snapshotId,
    workspace_revision: workspaceRevision,
    execution_id: executionId,
    repository_id: repositoryId,
    node_count: materialization.graphSnapshotManifest.nodeCount,
    edge_count: materialization.graphSnapshotManifest.edgeCount,
    topology_hash: materialization.graphSnapshotManifest.topologyHash,
    graph_revision: revisionWrite.revision.graphRevision,
    revision_checksum: revisionWrite.revision.revisionChecksum,
    database_read_only: true
  }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
