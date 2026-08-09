#!/usr/bin/env npx tsx
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { materializeCanonicalGraphSnapshotFromPostgres, type QueryLike } from '../../sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-postgres.js';

function parseArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const root = resolve(import.meta.dirname, '..', '..');
const outputJson = parseArg('--output-json', resolve(root, 'graphify/frozen-graph-snapshot-v2.json'));
const workspaceId = parseArg('--workspace-id', process.env.PAGERANK_WORKSPACE_ID ?? 'workspace:parent-atlas');
const snapshotId = parseArg('--snapshot-id', process.env.PAGERANK_SNAPSHOT_ID ?? randomUUID());
const sourceInventorySnapshotId = parseArg('--source-inventory-snapshot-id', process.env.PAGERANK_SOURCE_INVENTORY_SNAPSHOT_ID ?? `inventory:${snapshotId}`);
const identityContractVersion = parseArg('--identity-contract-version', 'identity-contract-v1');
const parserContractVersion = parseArg('--parser-contract-version', 'tree-sitter-typescript-v1');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const queryLike: QueryLike = {
  query: async (text, params) => pool.query(text, params)
};

try {
  const materialization = await materializeCanonicalGraphSnapshotFromPostgres(queryLike, {
    snapshotId,
    workspaceId,
    sourceInventorySnapshotId,
    identityContractVersion,
    parserContractVersion
  });

  const payload = {
    snapshotId: materialization.graphSnapshot.snapshotId,
    nodes: materialization.graphSnapshotNodes.map((node) => ({ ...node })),
    edges: materialization.graphSnapshotEdges.map((edge) => ({ ...edge })),
    manifest: materialization.graphSnapshotManifest,
    proof: materialization.graphSnapshotProof,
    graphSnapshot: materialization.graphSnapshot
  };

  await writeFile(outputJson, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'GRAPH_SNAPSHOT_EXPORTED',
    output_json: outputJson,
    snapshot_id: snapshotId,
    workspace_id: workspaceId,
    node_count: materialization.graphSnapshotManifest.nodeCount,
    edge_count: materialization.graphSnapshotManifest.edgeCount,
    topology_hash: materialization.graphSnapshotManifest.topologyHash
  }));
} finally {
  await pool.end();
}
