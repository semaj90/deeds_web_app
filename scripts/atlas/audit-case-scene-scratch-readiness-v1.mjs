/**
 * Read-only inventory of the isolated case-scene PG18 scratch schema.
 * Never connects to legal_ai_db: the target database name and loopback port are mandatory.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXPECTED_DB = 'legal_ai_live_integration_scratch';
const EXPECTED_PORT = 5434;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const TABLES = ['scene_document_revisions', 'scene_assets', 'scene_asset_files'];
const REQUIRED_COLUMNS = {
  scene_document_revisions: ['case_id', 'scene_id', 'revision', 'command_id', 'parent_manifest_sha256', 'manifest_sha256', 'manifest', 'created_by', 'created_at'],
  scene_assets: ['asset_id', 'case_id', 'scene_id', 'bucket', 'object_key', 'format', 'sha256', 'byte_length', 'content_type', 'created_at'],
  scene_asset_files: ['asset_id', 'relative_path', 'bucket', 'object_key', 'sha256', 'byte_length', 'content_type'],
};
const report = {
  schema: 'atlas.case-scene-scratch-readiness.v1',
  generatedAt: new Date().toISOString(),
  status: 'NOT_RUN',
  canonicalAuthority: false,
  writesPerformed: false,
  target: { database: EXPECTED_DB, host: '127.0.0.1', port: EXPECTED_PORT },
  scenePersistenceConfigured: false,
  server: null,
  tables: [],
  requiredColumnGaps: {},
  counts: {},
  requiredIndexes: [],
  immutabilityTriggers: [],
  caseRows: null,
  caseInsertRequirements: [],
};

function resolveScratchUrl() {
  const env = loadRepoEnv(process.env);
  report.scenePersistenceConfigured = String(env.SCENE_PERSISTENCE_ENABLED ?? '').trim().toLowerCase() === 'true';
  const explicit = env.ATLAS_SCRATCH_PG18_URL || env.ATLAS_SCRATCH_DB_URL || env.SCRATCH_DATABASE_URL;
  const url = new URL(explicit || resolveDatabaseUrl(env));
  if (!explicit) url.pathname = `/${EXPECTED_DB}`;
  if (!LOOPBACK.has(url.hostname.toLowerCase()) || Number(url.port || 5432) !== EXPECTED_PORT ||
      decodeURIComponent(url.pathname.replace(/^\/+/, '')) !== EXPECTED_DB) {
    throw new Error('SCENE_SCRATCH_TARGET_GUARD_FAILED');
  }
  return url;
}

const client = new pg.Client({
  connectionString: resolveScratchUrl().toString(),
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
  options: '-c default_transaction_read_only=on',
});

try {
  await client.connect();
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const identity = (await client.query(`
    SELECT current_database() AS database,
           current_setting('server_version_num')::int AS server_version_num,
           inet_server_port() AS server_port
  `)).rows[0];
  report.server = identity;
  if (identity.database !== EXPECTED_DB || Number(identity.server_version_num) < 180000) {
    throw new Error('SCENE_SCRATCH_DATABASE_IDENTITY_OR_VERSION_MISMATCH');
  }

  const tableRows = (await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name`,
    [TABLES],
  )).rows;
  report.tables = tableRows.map((row) => row.table_name);
  report.caseRows = String((await client.query('SELECT count(*)::bigint AS rows FROM public.cases')).rows[0].rows);
  report.caseInsertRequirements = (await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cases'
      AND is_nullable = 'NO' AND column_default IS NULL
    ORDER BY ordinal_position
  `)).rows;

  for (const table of TABLES) {
    if (!report.tables.includes(table)) {
      report.counts[table] = null;
      report.requiredColumnGaps[table] = REQUIRED_COLUMNS[table];
      continue;
    }
    const columns = (await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    )).rows.map((row) => row.column_name);
    const missing = REQUIRED_COLUMNS[table].filter((column) => !columns.includes(column));
    report.requiredColumnGaps[table] = missing;
    const count = (await client.query(`SELECT count(*)::bigint AS rows FROM public.${table}`)).rows[0].rows;
    report.counts[table] = String(count);
  }

  report.requiredIndexes = (await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'scene_document_revisions_case_scene_revision_uq',
        'scene_document_revisions_command_uq',
        'scene_document_revisions_head_idx',
        'scene_assets_case_scene_sha_uq',
        'scene_assets_bucket_object_key_uq',
        'scene_assets_case_scene_idx',
        'scene_asset_files_asset_path_uq',
        'scene_asset_files_bucket_key_uq',
        'scene_asset_files_asset_idx'
      )
    ORDER BY indexname
  `)).rows;
  report.immutabilityTriggers = (await client.query(`
    SELECT trigger_name, event_object_table
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name IN ('scene_document_revisions_immutable_trg', 'scene_assets_immutable_trg', 'scene_asset_files_immutable_trg')
    ORDER BY trigger_name
  `)).rows;

  const complete = TABLES.every((table) => report.tables.includes(table) && report.requiredColumnGaps[table].length === 0);
  report.status = complete ? 'SCHEMA_PRESENT_READ_ONLY' : 'SCHEMA_NOT_ADMITTED';
  await client.query('ROLLBACK');
} catch (error) {
  report.status = 'BLOCKED';
  report.errorCode = error instanceof Error ? error.message : String(error);
  try { await client.query('ROLLBACK'); } catch { /* no active transaction */ }
} finally {
  await client.end().catch(() => {});
}

const reportPath = path.join(ROOT, '.tmp/atlas/case-scene-scratch-readiness-v1.json');
mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  status: report.status,
  database: report.server?.database ?? EXPECTED_DB,
  serverVersionNum: report.server?.server_version_num ?? null,
  serverPort: report.server?.server_port ?? null,
  scenePersistenceConfigured: report.scenePersistenceConfigured,
  tables: report.tables,
  counts: report.counts,
  caseRows: report.caseRows,
  caseInsertRequirements: report.caseInsertRequirements,
  requiredIndexes: report.requiredIndexes.length,
  immutabilityTriggers: report.immutabilityTriggers.length,
  writesPerformed: report.writesPerformed,
  reportPath: path.relative(ROOT, reportPath),
}, null, 2));

if (report.status === 'BLOCKED') process.exitCode = 2;
