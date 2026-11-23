#!/usr/bin/env node

/**
 * Read-only discovery of existing PostgreSQL graph and source-edge tables.
 * This is an evidence inventory only; it does not promote or materialize edges.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Client } = require('pg');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TABLES = [
  'atlas_graph_nodes_v2', 'atlas_graph_edges_v2', 'atlas_graph_snapshots_v2', 'code_features',
  'feature_file_edges', 'code_feature_edges', 'cpg_edges', 'cpg_nodes',
  'graphify_edges', 'graphify_files', 'graphify_current_source_membership_v1',
  'graphify_execution_file_membership_v2', 'atlas_typed_edges', 'atlas_graph_facts',
  'phase89_import_edges', 'atlas_workspace_source_bindings', 'codebase_chunk_index',
];
const SAMPLE_FIELDS = [
  'snapshot_id', 'status', 'graph_revision', 'source_inventory_revision', 'edge_type', 'relation', 'relation_type', 'relationship_type', 'predicate', 'kind',
  'source_node_key', 'target_node_key', 'source_file_id', 'target_file_id', 'source_feature_id',
  'target_feature_id', 'from_feature_id', 'to_feature_id', 'feature_id', 'source_ref', 'target_ref',
  'source_path', 'target_path', 'relative_path', 'repository_relative_path', 'symbol',
  'line_start', 'line_end', 'packet_key', 'evidence_ref', 'confidence', 'source_revision',
  'code_source_revision', 'workspace_revision', 'content_hash', 'file_content_hash',
  'byte_length', 'weight', 'created_at',
];
const COUNT_TABLES = [
  'atlas_graph_nodes_v2', 'atlas_graph_edges_v2', 'atlas_graph_snapshots_v2', 'code_features',
  'feature_file_edges', 'code_feature_edges', 'cpg_edges', 'cpg_nodes', 'graphify_edges',
  'graphify_files', 'graphify_current_source_membership_v1', 'graphify_execution_file_membership_v2',
  'atlas_typed_edges', 'atlas_graph_facts', 'phase89_import_edges',
];

export function parseArgs(args) {
  const read = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const target = read('target') ?? 'src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts';
  const sampleRaw = read('sample-limit') ?? '5';
  if (!/^\d+$/.test(sampleRaw) || Number(sampleRaw) < 1 || Number(sampleRaw) > 20) {
    throw new Error('INVALID_SAMPLE_LIMIT');
  }
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const output = resolve(ROOT, read('output') ?? `docs/reports/graph-sources-readonly-${date}.json`);
  const outputRelative = relative(ROOT, output);
  if (!outputRelative || outputRelative === '..' || outputRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(outputRelative)) {
    throw new Error('OUTPUT_PATH_OUTSIDE_WORKSPACE');
  }
  if (!target.trim()) throw new Error('TARGET_REQUIRED');
  return { target: target.trim().replaceAll('\\', '/'), output, sampleLimit: Number(sampleRaw) };
}

export function quotePgIdentifier(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('UNSAFE_SQL_IDENTIFIER');
  return `"${name}"`;
}

function safeColumns(columns) {
  const available = new Set(columns.map((row) => row.column_name));
  return SAMPLE_FIELDS.filter((name) => available.has(name));
}

async function querySection(client, sql, params = []) {
  try {
    return { rows: (await client.query(sql, params)).rows, error: null };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runGraphSourceAudit({ target, sampleLimit = 5, clientFactory = () => new Client({ connectionString: resolveDatabaseUrl(loadRepoEnv()), connectionTimeoutMillis: 5000 }) }) {
  if (!Number.isInteger(sampleLimit) || sampleLimit < 1 || sampleLimit > 20) throw new Error('INVALID_SAMPLE_LIMIT');
  if (typeof target !== 'string' || !target.trim()) throw new Error('TARGET_REQUIRED');
  target = target.trim().replaceAll('\\', '/');
  const report = {
    schema: 'atlas.graph-sources-readonly-audit.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_POSTGRES_DISCOVERY',
    target,
    readOnlyTransaction: false,
    databaseWritesPerformed: false,
    canonicalAuthority: false,
    database: { connected: false, serverVersion: null },
    schemas: {},
    counts: {},
    snapshots: { rows: [], edgeTypeCounts: [], error: null },
    targetMatches: {},
    edgeSamples: {},
    relationQuality: { codeFeatureEdges: { status: 'NOT_INSPECTED', rows: [], error: null } },
    errors: [],
  };
  const client = clientFactory();
  let transactionStarted = false;
  try {
    await client.connect();
    report.database.connected = true;
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionStarted = true;
    await client.query("SET LOCAL statement_timeout = '20s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    const proof = await client.query("SELECT current_setting('transaction_read_only') AS read_only, current_setting('server_version') AS server_version");
    report.readOnlyTransaction = proof.rows[0]?.read_only === 'on';
    report.database.serverVersion = proof.rows[0]?.server_version ?? null;
    if (!report.readOnlyTransaction) throw new Error('READ_ONLY_TRANSACTION_NOT_CONFIRMED');

    const schemaResult = await client.query(
      `SELECT table_name, ordinal_position, column_name, data_type, udt_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
        ORDER BY table_name, ordinal_position`,
      [TABLES],
    );
    for (const table of TABLES) report.schemas[table] = schemaResult.rows.filter((row) => row.table_name === table);

    for (const table of COUNT_TABLES) {
      if (!report.schemas[table]?.length) {
        report.counts[table] = { status: 'TABLE_MISSING', rows: null };
        continue;
      }
      const countResult = await querySection(client, `SELECT count(*)::text AS row_count FROM public.${quotePgIdentifier(table)}`);
      report.counts[table] = countResult.error
        ? { status: 'COUNT_FAILED', rows: null, error: countResult.error }
        : { status: 'COUNTED', rows: countResult.rows[0]?.row_count ?? '0' };
    }

    if (report.schemas.atlas_graph_snapshots_v2?.length) {
      const fields = safeColumns(report.schemas.atlas_graph_snapshots_v2);
      if (fields.includes('snapshot_id')) {
        const snapshotColumns = fields.filter((name) => ['snapshot_id', 'status', 'graph_revision', 'workspace_revision', 'source_inventory_revision', 'created_at'].includes(name));
        const projection = snapshotColumns.map(quotePgIdentifier).join(', ');
        const snapshots = await querySection(client, `SELECT ${projection} FROM public."atlas_graph_snapshots_v2" ORDER BY ${quotePgIdentifier('snapshot_id')} LIMIT 50`);
        report.snapshots.rows = snapshots.rows;
        report.snapshots.error = snapshots.error;
      }
    }
    if (report.schemas.atlas_graph_edges_v2?.length) {
      const edgeCols = new Set(report.schemas.atlas_graph_edges_v2.map((row) => row.column_name));
      if (edgeCols.has('edge_type')) {
        const groupCols = ['snapshot_id', 'edge_type'].filter((name) => edgeCols.has(name)).map(quotePgIdentifier).join(', ');
        const grouped = await querySection(client,
          `SELECT ${groupCols}, count(*)::text AS row_count FROM public."atlas_graph_edges_v2" GROUP BY ${groupCols} ORDER BY ${groupCols} LIMIT 200`);
        report.snapshots.edgeTypeCounts = grouped.rows;
        report.snapshots.edgeTypeCountError = grouped.error;
      }
    }

    const basename = target.split('/').at(-1);
    for (const table of ['atlas_graph_nodes_v2', 'code_features', 'graphify_files', 'graphify_current_source_membership_v1', 'graphify_execution_file_membership_v2', 'codebase_chunk_index']) {
      const columns = report.schemas[table] ?? [];
      const refColumn = ['source_ref', 'repository_relative_path', 'relative_path'].find((name) => columns.some((row) => row.column_name === name));
      if (!refColumn) {
        report.targetMatches[table] = { status: columns.length ? 'NO_SOURCE_REF_COLUMN' : 'TABLE_MISSING', rows: [], error: null };
        continue;
      }
      const select = safeColumns(columns);
      const projection = (select.length ? select : [refColumn]).map(quotePgIdentifier).join(', ');
      const matches = await querySection(client,
        `SELECT ${projection} FROM public.${quotePgIdentifier(table)} WHERE strpos(lower(${quotePgIdentifier(refColumn)}), lower($1)) > 0 ORDER BY ${quotePgIdentifier(refColumn)} LIMIT $2`,
        [basename, sampleLimit],
      );
      report.targetMatches[table] = {
        status: matches.error ? 'QUERY_FAILED' : 'QUERIED',
        matchMode: 'BASENAME_CANDIDATE_NOT_EXACT_IDENTITY',
        referenceColumn: refColumn,
        rows: matches.rows,
        error: matches.error,
      };
    }

    for (const table of ['feature_file_edges', 'code_feature_edges', 'cpg_edges', 'graphify_edges', 'atlas_typed_edges', 'phase89_import_edges', 'atlas_graph_facts']) {
      const columns = report.schemas[table] ?? [];
      if (!columns.length) {
        report.edgeSamples[table] = { status: 'TABLE_MISSING', predicateColumn: null, rows: [], error: null };
        continue;
      }
      const predicateColumn = ['edge_type', 'relation', 'relation_type', 'relationship_type', 'predicate', 'kind'].find((name) => columns.some((row) => row.column_name === name));
      const sampleFields = safeColumns(columns);
      if (sampleFields.length === 0) {
        report.edgeSamples[table] = { status: 'NO_SAFE_SAMPLE_COLUMNS', predicateColumn, predicateCounts: [], predicateCountError: null, rows: [], error: null };
        continue;
      }
      const projection = sampleFields.map(quotePgIdentifier).join(', ');
      const sample = await querySection(client, `SELECT ${projection} FROM public.${quotePgIdentifier(table)} LIMIT $1`, [sampleLimit]);
      const typeCounts = predicateColumn
        ? await querySection(client, `SELECT ${quotePgIdentifier(predicateColumn)} AS predicate, count(*)::text AS row_count FROM public.${quotePgIdentifier(table)} GROUP BY ${quotePgIdentifier(predicateColumn)} ORDER BY count(*) DESC LIMIT 50`)
        : { rows: [], error: null };
      report.edgeSamples[table] = {
        status: sample.error ? 'QUERY_FAILED' : 'QUERIED',
        predicateColumn,
        predicateCounts: typeCounts.rows,
        predicateCountError: typeCounts.error,
        rows: sample.rows,
        error: sample.error,
      };
    }

    const codeEdgeColumns = new Set((report.schemas.code_feature_edges ?? []).map((row) => row.column_name));
    const qualityFields = ['relation', 'from_feature_id', 'to_feature_id', 'confidence'];
    if (qualityFields.every((field) => codeEdgeColumns.has(field))) {
      const evidenceCount = codeEdgeColumns.has('evidence_ref')
        ? `count(*) FILTER (WHERE ${quotePgIdentifier('evidence_ref')} IS NOT NULL)`
        : '0';
      const quality = await querySection(client,
        `SELECT ${quotePgIdentifier('relation')} AS relation,
                count(*)::text AS row_count,
                count(DISTINCT ${quotePgIdentifier('from_feature_id')})::text AS source_count,
                count(DISTINCT ${quotePgIdentifier('to_feature_id')})::text AS target_count,
                min(${quotePgIdentifier('confidence')})::float8 AS min_confidence,
                max(${quotePgIdentifier('confidence')})::float8 AS max_confidence,
                (${evidenceCount})::text AS evidence_ref_count
           FROM public."code_feature_edges"
          GROUP BY ${quotePgIdentifier('relation')}
          ORDER BY ${quotePgIdentifier('relation')}
          LIMIT 50`);
      report.relationQuality.codeFeatureEdges = {
        status: quality.error ? 'QUERY_FAILED' : 'QUERIED',
        rows: quality.rows,
        error: quality.error,
      };
    } else if (report.schemas.code_feature_edges?.length) {
      report.relationQuality.codeFeatureEdges = { status: 'REQUIRED_COLUMNS_MISSING', rows: [], error: null };
    } else {
      report.relationQuality.codeFeatureEdges = { status: 'TABLE_MISSING', rows: [], error: null };
    }
    return report;
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    return report;
  } finally {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
    return;
  }
  const report = await runGraphSourceAudit(args);
  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ output: args.output, databaseConnected: report.database.connected, readOnlyTransaction: report.readOnlyTransaction, tableCount: Object.values(report.schemas).filter((columns) => columns.length > 0).length, errors: report.errors }, null, 2)}\n`);
  if (!report.database.connected || !report.readOnlyTransaction || report.errors.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
