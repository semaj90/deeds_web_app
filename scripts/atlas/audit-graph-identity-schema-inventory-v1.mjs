#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportsDirectory = path.join(root, 'docs', 'reports');
const tables = [
  'atlas_packets', 'atlas_tree_nodes', 'atlas_ast_nodes',
  'atlas_symbol_registry', 'atlas_symbol_versions',
  'graphify_files', 'graphify_symbols', 'graphify_edges',
  'atlas_topology_clusters', 'atlas_topology_features', 'atlas_topology_index',
  'atlas_graph_authority_runs', 'atlas_graph_authority_scores',
  'atlas_graph_authority_runs_v2', 'atlas_graph_authority_scores_v2',
  'registry_topology_projection', 'topology_positions', 'topology_snapshots',
];
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 15000,
});
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const constraintColumns = (row) => Array.isArray(row.columns)
  ? row.columns
  : String(row.columns ?? '').replace(/^\{|\}$/g, '').split(',').filter(Boolean);
let databaseError = null;
let columns = [];
let constraints = [];
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    columns = (await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
        AND (column_name ~* '(id|key|ref|revision|hash|ordinal|packet|symbol|concept|node|edge|source|feature|cluster|snapshot|run)')
      ORDER BY table_name, ordinal_position
    `, [tables])).rows;
    constraints = (await client.query(`
      SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
             array_remove(array_agg(kcu.column_name ORDER BY kcu.ordinal_position), NULL) AS columns
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_schema = tc.constraint_schema
       AND kcu.constraint_name = tc.constraint_name
       AND kcu.table_name = tc.table_name
      WHERE tc.constraint_schema = 'public'
        AND tc.table_name = ANY($1::text[])
        AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
      GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
      ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name
    `, [tables])).rows;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const generatedAt = new Date().toISOString();
const report = {
  schema: 'atlas.graph-identity-schema-inventory.v1',
  generatedAt,
  mode: 'POSTGRES_REPEATABLE_READ_READ_ONLY',
  status: databaseError ? 'DATABASE_AUDIT_FAILED' : 'SCHEMA_INVENTORY_CAPTURED',
  databaseError,
  requestedTables: tables,
  columns,
  constraints,
  findings: {
    atlasPacketsPacketKeyUnique: constraints.some((row) => row.table_name === 'atlas_packets' && row.constraint_type === 'UNIQUE' && constraintColumns(row).join(',') === 'packet_key'),
    atlasTreeNodesPacketKeyUnique: constraints.some((row) => row.table_name === 'atlas_tree_nodes' && row.constraint_type === 'UNIQUE' && constraintColumns(row).includes('packet_key')),
    atlasTreeNodesSourceRefUnique: constraints.some((row) => row.table_name === 'atlas_tree_nodes' && row.constraint_type === 'UNIQUE' && constraintColumns(row).includes('source_ref')),
    graphifyFilesSourceRevisionUnique: constraints.some((row) => row.table_name === 'graphify_files' && row.constraint_type === 'UNIQUE' && constraintColumns(row).includes('source_ref') && constraintColumns(row).includes('source_revision')),
    graphifySymbolsFileStableKeyUnique: constraints.some((row) => row.table_name === 'graphify_symbols' && row.constraint_type === 'UNIQUE' && constraintColumns(row).join(',') === 'file_id,stable_symbol_key'),
    graphifyEdgesSemanticTupleUnique: constraints.some((row) => row.table_name === 'graphify_edges' && row.constraint_type === 'UNIQUE' && constraintColumns(row).includes('subject_symbol_id') && constraintColumns(row).includes('object_symbol_id')),
  },
  authority: false,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  caveats: [
    'Schema constraints describe declared uniqueness/foreign-key rules, not runtime population quality.',
    'Indexes that are not declared constraints are not treated as canonical uniqueness invariants.',
    'No DDL or data changes were performed.',
  ],
  likely_cause: 'Identity fields are distributed across canonical packet, tree, parser, symbol, graph, and topology tables with different keys and constraint coverage.',
  evidence: ['PostgreSQL information_schema.columns', 'PostgreSQL information_schema.table_constraints'],
  patch_targets: ['scripts/atlas/audit-graph-identity-schema-inventory-v1.mjs', 'openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md'],
  safe_next_command: 'node scripts/atlas/audit-graph-identity-schema-inventory-v1.mjs',
  smoke_command: 'node scripts/atlas/audit-graph-identity-schema-inventory-v1.mjs',
};
const reportPath = path.join(reportsDirectory, `graph-identity-schema-inventory-v1-${generatedAt.replace(/[:.]/g, '-')}.json`);
report.reportPath = path.relative(root, reportPath).replace(/\\/g, '/');
report.checksum = sha256(JSON.stringify(report));
fs.mkdirSync(reportsDirectory, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ schema: report.schema, status: report.status, columnCount: columns.length, constraintCount: constraints.length, findings: report.findings, reportPath: report.reportPath, databaseError }, null, 2));
