#!/usr/bin/env npx tsx
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { materializeCanonicalGraphSnapshotFromPostgres, type QueryLike } from '../../sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-postgres.js';

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
const outputJson = parseArg('--output-json', resolve(root, 'graphify/frozen-graph-snapshot-v2.json'));
const workspaceId = requiredArg('--workspace-id', process.env.PAGERANK_WORKSPACE_ID);
const snapshotId = requiredArg('--snapshot-id', process.env.PAGERANK_SNAPSHOT_ID);
const sourceInventorySnapshotId = requiredArg('--source-inventory-snapshot-id', process.env.PAGERANK_SOURCE_INVENTORY_SNAPSHOT_ID);
const identityContractVersion = requiredArg('--identity-contract-version', 'identity-contract-v1');
const parserContractVersion = requiredArg('--parser-contract-version', 'tree-sitter-typescript-v1');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const queryLike: QueryLike = {
  query: async <T = Record<string, unknown>,>(text: string, params?: readonly unknown[]) => {
    const result = await pool.query(text, params as unknown[] | undefined);
    return { rows: result.rows as T[] };
  }
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
