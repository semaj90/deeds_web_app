#!/usr/bin/env node
/** Read-only census of router/matrix ownership and Postgres persistence surfaces. */
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const root = process.cwd();
const reportPath = path.join(root, 'docs/reports/pipeline-router-matrix-surfaces-v1.json');
const dbUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const routerFiles = [
  'sveltekit-frontend/src/lib/server/routing/query-router-4x4.ts',
  'sveltekit-frontend/src/lib/server/retrieval/query-router-4x4.ts',
  'sveltekit-frontend/src/lib/server/retrieval/router-matrix.ts',
  'sveltekit-frontend/src/lib/server/ace/stage-a0-routing.ts',
  'sveltekit-frontend/src/lib/server/atlas/feature-matrix-schema.ts',
  'sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts',
];
const tableNames = [
  'atlas_packets', 'atlas_packet_features',
  'atlas_observation_feature_rows', 'codebase_chunk_index', 'graphify_executions',
  'graphify_execution_files', 'atlas_symbol_versions', 'taxonomy_nodes',
  'taxonomy_edges', 'semantic_lifecycle_events', 'projection_outbox',
];
const requiredColumns = {
  atlas_packets: ['packet_key', 'source_ref', 'workspace_revision', 'representation_revision'],
  atlas_packet_features: ['packet_key', 'used_concepts', 'ast_symbols'],
  atlas_observation_feature_rows: ['packet_key', 'workspace_revision', 'representation_revision', 'ontology_classes'],
  codebase_chunk_index: ['chunk_id', 'source_ref', 'content_embedding_768', 'search_vector'],
  graphify_executions: ['execution_id', 'workspace_revision', 'status', 'canonical_authority'],
  graphify_execution_files: ['execution_id', 'source_ref', 'workspace_revision', 'code_source_revision'],
  atlas_symbol_versions: ['symbol_version_id', 'packet_key', 'source_revision', 'workspace_revision'],
  taxonomy_nodes: [], taxonomy_edges: [], semantic_lifecycle_events: [], projection_outbox: [],
};

const staticSurfaces = [];
for (const file of routerFiles) {
  let source = null;
  try { source = await fs.readFile(path.join(root, file), 'utf8'); } catch {}
  staticSurfaces.push({
    file,
    present: Boolean(source),
    exports: source ? [...source.matchAll(/export\s+(?:const|function|class|type|interface)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]) : [],
    executableRouter: Boolean(source && /QueryRouter4x4|route\s*\(/.test(source)),
    matrixDefinition: Boolean(source && /DEFAULT_MATRIX|DEFAULT_ROUTER_MATRIX/.test(source)),
    candidateMatrix: Boolean(source && /candidate_feature_matrix|RetrievalCandidateFeatureMatrixV1/.test(source)),
  });
}

const report = {
  schema: 'atlas.pipeline-router-matrix-surfaces.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY', writesPerformed: false, authority: false,
  workspaceRevision: null,
  ownership: {
    executableRouter: 'sveltekit-frontend/src/lib/server/routing/query-router-4x4.ts',
    legacyMatrixVocabulary: 'sveltekit-frontend/src/lib/server/retrieval/router-matrix.ts',
    candidateFeatureMatrix: 'sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts',
    fusionOwner: 'SearchRuntime',
  },
  staticSurfaces,
  postgres: { reachable: false, tables: {}, indexes: [], errors: [] },
  blockers: [],
};

const pool = new pg.Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 5000 });
try {
  const quoted = tableNames.map((name) => `'${name}'`).join(',');
  const columns = await pool.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${quoted}) ORDER BY table_name, ordinal_position`);
  const indexes = await pool.query(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN (${quoted}) ORDER BY tablename, indexname`);
  report.postgres.reachable = true;
  for (const name of tableNames) {
    const rows = columns.rows.filter((row) => row.table_name === name);
    const columnsPresent = rows.map((row) => row.column_name);
    report.postgres.tables[name] = {
      exists: rows.length > 0,
      columns: columnsPresent,
      columnTypes: Object.fromEntries(rows.map((row) => [row.column_name, row.data_type])),
      missingRequiredColumns: (requiredColumns[name] ?? []).filter((column) => !columnsPresent.includes(column)),
    };
  }
  report.postgres.indexes = indexes.rows;
} catch (error) {
  report.postgres.errors.push(String(error?.message ?? error));
} finally { await pool.end().catch(() => {}); }

if (!report.postgres.reachable) report.blockers.push('POSTGRES_UNREACHABLE');
if (!report.postgres.tables.atlas_observation_feature_rows?.exists) report.blockers.push('OBSERVATION_FEATURE_TABLE_NOT_PROVEN');
if (report.postgres.tables.atlas_observation_feature_rows?.missingRequiredColumns?.length) report.blockers.push('OBSERVATION_FEATURE_COLUMNS_MISSING');
const workspaceColumn = report.postgres.tables.atlas_observation_feature_rows?.columns?.find((column) => column === 'workspace_revision');
const workspaceColumnType = report.postgres.tables.atlas_observation_feature_rows?.columnTypes?.workspace_revision;
if (workspaceColumn && workspaceColumnType !== 'text') report.blockers.push('WORKSPACE_REVISION_TYPE_MISMATCH');
if (staticSurfaces.filter((surface) => surface.matrixDefinition).length > 1) report.blockers.push('MULTIPLE_ROUTER_MATRIX_DEFINITIONS');
report.status = report.blockers.length ? 'SURFACES_CENSUSED_REVIEW_REQUIRED' : 'SURFACES_PRESENT_REVIEW_REQUIRED';
report.firstBlockingInvariant = report.blockers[0] ?? null;

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, firstBlockingInvariant: report.firstBlockingInvariant, postgresReachable: report.postgres.reachable, observationFeatureTable: report.postgres.tables.atlas_observation_feature_rows?.exists ?? false, report: reportPath }, null, 2));
process.exitCode = report.blockers.length ? 1 : 0;
