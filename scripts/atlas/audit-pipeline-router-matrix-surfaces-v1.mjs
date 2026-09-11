#!/usr/bin/env node
/** Read-only census of router/matrix ownership and Postgres persistence surfaces. */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
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
const sourceRoot = path.join(root, 'sveltekit-frontend/src');
const sourceFiles = [];
async function collectTypeScriptFiles(dir) {
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectTypeScriptFiles(full);
    else if (/\.(?:ts|svelte)$/.test(entry.name)) sourceFiles.push(full);
  }
}
await collectTypeScriptFiles(sourceRoot);
for (const file of routerFiles) {
  let source = null;
  try { source = await fs.readFile(path.join(root, file), 'utf8'); } catch {}
  const normalizedFile = file.replaceAll('\\', '/');
  const moduleStem = path.basename(file, path.extname(file));
  const modulePath = normalizedFile.replace(/^sveltekit-frontend\/src\//, '').replace(/\.ts$/, '');
  const moduleAliases = [modulePath, modulePath.replace(/^lib\//, '$lib/'), `./${modulePath.split('/').pop()}`];
  const importConsumers = sourceFiles.filter((candidate) => {
    if (path.relative(root, candidate).replaceAll('\\', '/') === normalizedFile) return false;
    try {
      const consumer = fsSync.readFileSync(candidate, 'utf8');
      return consumer.split(/\r?\n/).some((line) =>
        (/^\s*import\b.*['"`]/.test(line) || /\bfrom\s+['"`]/.test(line))
        && moduleAliases.some((alias) => line.includes(alias))
      );
    } catch { return false; }
  }).map((candidate) => path.relative(root, candidate).replaceAll('\\', '/'));
  const ownershipClassification = normalizedFile.endsWith('/routing/query-router-4x4.ts')
    ? 'CANONICAL_EXECUTABLE_ROUTER'
    : normalizedFile.endsWith('/retrieval/router-matrix.ts')
      ? 'COMPATIBILITY_VOCABULARY'
      : normalizedFile.endsWith('/retrieval/retrieval-candidate-feature-matrix-v1.ts')
        ? 'FEATURE_MATRIX_DATA'
        : normalizedFile.endsWith('/retrieval/query-router-4x4.ts')
          ? 'LEGACY_EXECUTABLE_ROUTER'
          : normalizedFile.endsWith('/atlas/feature-matrix-schema.ts')
            ? 'FEATURE_SCHEMA'
            : normalizedFile.endsWith('/ace/stage-a0-routing.ts')
              ? 'STAGE_ROUTING_ADAPTER'
              : 'UNCLASSIFIED';
  staticSurfaces.push({
    file,
    present: Boolean(source),
    exports: source ? [...source.matchAll(/export\s+(?:const|function|class|type|interface)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]) : [],
    executableRouter: Boolean(source && /QueryRouter4x4|route\s*\(/.test(source)),
    matrixDefinition: Boolean(source && /DEFAULT_MATRIX|DEFAULT_ROUTER_MATRIX/.test(source)),
    candidateMatrix: Boolean(source && /candidate_feature_matrix|RetrievalCandidateFeatureMatrixV1/.test(source)),
    ownershipClassification,
    importConsumers,
    liveConsumerCount: importConsumers.length,
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
const canonicalRouter = staticSurfaces.find((surface) => surface.ownershipClassification === 'CANONICAL_EXECUTABLE_ROUTER');
const compatibilityMatrix = staticSurfaces.find((surface) => surface.ownershipClassification === 'COMPATIBILITY_VOCABULARY');
const featureMatrix = staticSurfaces.find((surface) => surface.ownershipClassification === 'FEATURE_MATRIX_DATA');
report.ownership.classification = {
  canonicalExecutableRouter: canonicalRouter?.file ?? null,
  compatibilityVocabulary: compatibilityMatrix?.file ?? null,
  featureMatrixData: featureMatrix?.file ?? null,
  canonicalRouterLiveConsumerCount: canonicalRouter?.liveConsumerCount ?? 0,
  compatibilityVocabularyLiveConsumerCount: compatibilityMatrix?.liveConsumerCount ?? 0,
  featureMatrixLiveConsumerCount: featureMatrix?.liveConsumerCount ?? 0,
};
if (!canonicalRouter?.present) report.blockers.push('CANONICAL_EXECUTABLE_ROUTER_NOT_PRESENT');
if (!canonicalRouter?.liveConsumerCount) report.blockers.push('CANONICAL_EXECUTABLE_ROUTER_LIVE_CONSUMER_UNPROVEN');
if (staticSurfaces.some((surface) => surface.ownershipClassification === 'UNCLASSIFIED' && surface.matrixDefinition)) {
  report.blockers.push('ROUTER_MATRIX_SURFACE_UNCLASSIFIED');
}
if (staticSurfaces.filter((surface) => surface.matrixDefinition).length > 1) report.notes = ['MULTIPLE_ROUTER_MATRIX_DEFINITIONS_RECLASSIFIED_BY_ROLE'];
if (!report.blockers.includes('ROUTER_MATRIX_SURFACE_UNCLASSIFIED')) {
  report.blockers.push('ROUTER_OWNER_CONSOLIDATION_NOT_AUTHORIZED');
}
report.status = report.blockers.length ? 'SURFACES_CENSUSED_REVIEW_REQUIRED' : 'SURFACES_PRESENT_REVIEW_REQUIRED';
report.firstBlockingInvariant = report.blockers[0] ?? null;

await fs.mkdir(path.dirname(reportPath), { recursive: true });
const reportJson = `${JSON.stringify(report, null, 2)}\n`;
const reportTempPath = `${reportPath}.${process.pid}.tmp`;
await fs.writeFile(reportTempPath, reportJson, 'utf8');
try {
  await fs.rename(reportTempPath, reportPath);
} catch (error) {
  await fs.rm(reportTempPath, { force: true }).catch(() => {});
  report.writeError = String(error?.message ?? error);
  report.status = 'SURFACES_CENSUSED_REPORT_WRITE_BLOCKED';
  report.firstBlockingInvariant = 'ROUTER_MATRIX_REPORT_WRITE_UNAVAILABLE';
  console.error(JSON.stringify({ status: report.status, firstBlockingInvariant: report.firstBlockingInvariant, reportPath }, null, 2));
  process.exitCode = 1;
  process.exit();
}
console.log(JSON.stringify({ status: report.status, firstBlockingInvariant: report.firstBlockingInvariant, postgresReachable: report.postgres.reachable, observationFeatureTable: report.postgres.tables.atlas_observation_feature_rows?.exists ?? false, report: reportPath }, null, 2));
process.exitCode = report.blockers.length ? 1 : 0;
