/**
 * Rehearse the candidate case-scene DDL inside a PostgreSQL transaction and roll it back.
 * The target guard forbids every database except loopback PG18 legal_ai_live_integration_scratch.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXPECTED_DB = 'legal_ai_live_integration_scratch';
const EXPECTED_PORT = 5434;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const MIGRATION_PATH = path.join(ROOT, 'sveltekit-frontend/drizzle/manual/scene_document_revisions.sql');
const REPORT_PATH = path.join(ROOT, '.tmp/atlas/case-scene-migration-rehearsal-v1.json');
const REQUIRED_TABLES = ['scene_document_revisions', 'scene_assets', 'scene_asset_files'];
const REQUIRED_INDEXES = [
  'scene_document_revisions_case_scene_revision_uq', 'scene_document_revisions_command_uq', 'scene_document_revisions_head_idx',
  'scene_assets_case_scene_sha_uq', 'scene_assets_bucket_object_key_uq', 'scene_assets_case_scene_idx',
  'scene_asset_files_asset_path_uq', 'scene_asset_files_bucket_key_uq', 'scene_asset_files_asset_idx',
];
const REQUIRED_TRIGGERS = [
  'scene_document_revisions_immutable_trg', 'scene_assets_immutable_trg', 'scene_asset_files_immutable_trg',
];
const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
const report = {
  schema: 'atlas.case-scene-migration-rehearsal.v1',
  generatedAt: new Date().toISOString(),
  status: 'NOT_RUN',
  target: { database: EXPECTED_DB, host: '127.0.0.1', port: EXPECTED_PORT },
  migration: { path: path.relative(ROOT, MIGRATION_PATH), sha256: createHash('sha256').update(migrationSql).digest('hex') },
  transactionalDdlExecuted: false,
  transactionalSceneContractExecuted: false,
  committedWrites: false,
  verified: { tables: [], indexes: [], triggers: [], revisions: [], conflictRejected: false, immutableUpdateRejected: false, afterRollbackTables: [], caseRowsBefore: null, caseRowsAfter: null },
};

function resolveScratchUrl() {
  const env = loadRepoEnv(process.env);
  const explicit = env.ATLAS_SCRATCH_PG18_URL || env.ATLAS_SCRATCH_DB_URL || env.SCRATCH_DATABASE_URL;
  const url = new URL(explicit || resolveDatabaseUrl(env));
  if (!explicit) url.pathname = `/${EXPECTED_DB}`;
  if (!LOOPBACK.has(url.hostname.toLowerCase()) || Number(url.port || 5432) !== EXPECTED_PORT ||
      decodeURIComponent(url.pathname.replace(/^\/+/, '')) !== EXPECTED_DB) {
    throw new Error('SCENE_SCRATCH_TARGET_GUARD_FAILED');
  }
  return url.toString();
}

const connectionString = resolveScratchUrl();
const client = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
  options: '-c default_transaction_read_only=off',
});

async function inventory(clientForQuery) {
  const tables = (await clientForQuery.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[]) ORDER BY table_name`,
    [REQUIRED_TABLES],
  )).rows.map((row) => row.table_name);
  const indexes = (await clientForQuery.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1::text[]) ORDER BY indexname`,
    [REQUIRED_INDEXES],
  )).rows.map((row) => row.indexname);
  const triggers = (await clientForQuery.query(
    `SELECT DISTINCT trigger_name FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name = ANY($1::text[]) ORDER BY trigger_name`,
    [REQUIRED_TRIGGERS],
  )).rows.map((row) => row.trigger_name);
  return { tables, indexes, triggers };
}

let transactionOpen = false;
try {
  await client.connect();
  const identity = (await client.query(`
    SELECT current_database() AS database,
           current_setting('server_version_num')::int AS server_version_num,
           inet_server_port() AS server_port
  `)).rows[0];
  report.server = identity;
  if (identity.database !== EXPECTED_DB || Number(identity.server_version_num) < 180000) {
    throw new Error('SCENE_SCRATCH_DATABASE_IDENTITY_OR_VERSION_MISMATCH');
  }

  const initial = await inventory(client);
  if (initial.tables.length || initial.indexes.length || initial.triggers.length) {
    throw new Error('SCENE_CANDIDATE_OBJECTS_ALREADY_EXIST; REFUSING TO REHEARSE OVER THEM');
  }
  report.verified.caseRowsBefore = String((await client.query('SELECT count(*)::bigint AS count FROM public.cases')).rows[0].count);

  await client.query('BEGIN');
  transactionOpen = true;
  await client.query(migrationSql);
  report.transactionalDdlExecuted = true;
  report.verified = { ...report.verified, ...(await inventory(client)) };
  for (const [kind, required] of Object.entries({
    tables: REQUIRED_TABLES,
    indexes: REQUIRED_INDEXES,
    triggers: REQUIRED_TRIGGERS,
  })) {
    if (report.verified[kind].length !== required.length || required.some((name) => !report.verified[kind].includes(name))) {
      throw new Error(`SCENE_MIGRATION_${kind.toUpperCase()}_VERIFICATION_FAILED`);
    }
  }

  // Exercise the database persistence contract using a synthetic case, entirely inside
  // this transaction. This proves PostgreSQL insert/readback/conflict/immutability
  // behavior, not the authenticated SvelteKit route or its Drizzle caller.
  const caseId = randomUUID();
  const sceneId = randomUUID();
  const firstManifest = { schema: 'atlas.case-scene-scratch-fixture.v1', caseId, sceneId, revision: 1, objects: [] };
  const firstHash = createHash('sha256').update(JSON.stringify(firstManifest)).digest('hex');
  await client.query(
    `INSERT INTO public.cases (id, title, status, priority) VALUES ($1, $2, 'open', 'low')`,
    [caseId, `Scratch scene contract fixture ${caseId}`],
  );
  await client.query(`
    INSERT INTO public.scene_document_revisions
      (case_id, scene_id, revision, command_id, parent_manifest_sha256, manifest_sha256, manifest, created_by)
    VALUES ($1, $2, 1, $3, NULL, $4, $5::jsonb, 0)
  `, [caseId, sceneId, randomUUID(), firstHash, JSON.stringify(firstManifest)]);
  const firstReadback = (await client.query(`
    SELECT case_id, scene_id, revision, parent_manifest_sha256, manifest_sha256, manifest
    FROM public.scene_document_revisions WHERE case_id = $1 AND scene_id = $2 AND revision = 1
  `, [caseId, sceneId])).rows[0];
  if (!firstReadback || firstReadback.manifest_sha256 !== firstHash || firstReadback.manifest.caseId !== caseId) {
    throw new Error('SCENE_REVISION_1_READBACK_FAILED');
  }

  const secondManifest = { ...firstManifest, revision: 2, objects: [{ id: 'synthetic-marker-1' }] };
  const secondHash = createHash('sha256').update(JSON.stringify(secondManifest)).digest('hex');
  const currentHead = (await client.query(`
    SELECT revision, manifest_sha256 FROM public.scene_document_revisions
    WHERE case_id = $1 AND scene_id = $2 ORDER BY revision DESC LIMIT 1
  `, [caseId, sceneId])).rows[0];
  if (currentHead.revision !== 1 || currentHead.manifest_sha256 !== firstHash) throw new Error('SCENE_HEAD_READBACK_FAILED');
  await client.query(`
    INSERT INTO public.scene_document_revisions
      (case_id, scene_id, revision, command_id, parent_manifest_sha256, manifest_sha256, manifest, created_by)
    VALUES ($1, $2, 2, $3, $4, $5, $6::jsonb, 0)
  `, [caseId, sceneId, randomUUID(), firstHash, secondHash, JSON.stringify(secondManifest)]);
  const staleExpectedRevision = 0;
  report.verified.conflictRejected = currentHead.revision !== staleExpectedRevision;
  if (!report.verified.conflictRejected) throw new Error('STALE_SCENE_REVISION_NOT_REJECTED');

  await client.query('SAVEPOINT immutable_guard');
  try {
    await client.query(`UPDATE public.scene_document_revisions SET revision = 99 WHERE case_id = $1 AND scene_id = $2`, [caseId, sceneId]);
    throw new Error('SCENE_REVISION_IMMUTABILITY_TRIGGER_DID_NOT_FIRE');
  } catch (error) {
    if (error?.message === 'SCENE_REVISION_IMMUTABILITY_TRIGGER_DID_NOT_FIRE') throw error;
    if (!String(error?.message ?? '').includes('append-only')) throw error;
    report.verified.immutableUpdateRejected = true;
    await client.query('ROLLBACK TO SAVEPOINT immutable_guard');
  }
  await client.query('RELEASE SAVEPOINT immutable_guard');
  report.verified.revisions = (await client.query(`
    SELECT revision, parent_manifest_sha256, manifest_sha256
    FROM public.scene_document_revisions WHERE case_id = $1 AND scene_id = $2 ORDER BY revision
  `, [caseId, sceneId])).rows;
  if (report.verified.revisions.length !== 2 ||
      report.verified.revisions[0].manifest_sha256 !== firstHash ||
      report.verified.revisions[1].parent_manifest_sha256 !== firstHash ||
      report.verified.revisions[1].manifest_sha256 !== secondHash ||
      !report.verified.immutableUpdateRejected) {
    throw new Error('SCENE_REVISION_CHAIN_OR_IMMUTABILITY_READBACK_FAILED');
  }
  report.transactionalSceneContractExecuted = true;

  await client.query('ROLLBACK');
  transactionOpen = false;

  const postRollback = await inventory(client);
  report.verified.afterRollbackTables = postRollback.tables;
  report.verified.caseRowsAfter = String((await client.query('SELECT count(*)::bigint AS count FROM public.cases')).rows[0].count);
  if (postRollback.tables.length || postRollback.indexes.length || postRollback.triggers.length) {
    throw new Error('SCENE_MIGRATION_ROLLBACK_DID_NOT_REMOVE_CANDIDATE_OBJECTS');
  }
  if (report.verified.caseRowsAfter !== report.verified.caseRowsBefore) {
    throw new Error('SCENE_SCRATCH_CASE_FIXTURE_ROLLBACK_MISMATCH');
  }
  report.status = 'PASS_DDL_REHEARSED_AND_ROLLED_BACK';
} catch (error) {
  report.status = 'BLOCKED';
  report.errorCode = error instanceof Error ? error.message : String(error);
  if (transactionOpen) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    transactionOpen = false;
  }
} finally {
  await client.end().catch(() => {});
  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify({
  status: report.status,
  database: report.server?.database ?? EXPECTED_DB,
  serverVersionNum: report.server?.server_version_num ?? null,
  migrationSha256: report.migration.sha256,
  transactionalDdlExecuted: report.transactionalDdlExecuted,
  tablesVerified: report.verified.tables.length,
  indexesVerified: report.verified.indexes.length,
  triggersVerified: report.verified.triggers.length,
  afterRollbackTables: report.verified.afterRollbackTables?.length ?? 0,
  transactionalSceneContractExecuted: report.transactionalSceneContractExecuted,
  revisionsReadBack: report.verified.revisions.length,
  staleConflictRejected: report.verified.conflictRejected,
  immutableUpdateRejected: report.verified.immutableUpdateRejected,
  caseRowsBefore: report.verified.caseRowsBefore,
  caseRowsAfter: report.verified.caseRowsAfter,
  committedWrites: report.committedWrites,
  reportPath: path.relative(ROOT, REPORT_PATH),
}, null, 2));

if (report.status === 'BLOCKED') process.exitCode = 2;
