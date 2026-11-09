#!/usr/bin/env node
/**
 * Apply the candidate scene schema to the exact isolated PG18 scratch target,
 * run the real SvelteKit revision handlers against one synthetic owned case,
 * then remove only this run's candidate schema and fixture.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXPECTED_DB = 'legal_ai_live_integration_scratch';
const EXPECTED_PORT = 5434;
const SCENE_TABLES = ['scene_asset_files', 'scene_assets', 'scene_document_revisions'];
const MIGRATION_PATH = path.join(ROOT, 'sveltekit-frontend/drizzle/manual/scene_document_revisions.sql');
const VITEST_CLI = path.join(ROOT, 'sveltekit-frontend/node_modules/vitest/vitest.mjs');
const SPECS = [
  'src/routes/api/cases/[id]/scenes/[sceneId]/revisions/revisions.pg18.integration.spec.ts',
  'src/routes/api/cases/[id]/scenes/[sceneId]/assets/sog/sog-pg18.integration.spec.ts',
];
const REPORT_PATH = path.join(ROOT, '.tmp/atlas/case-scene-route-pg18-integration-v1.json');
const CASE_ID = randomUUID();
const SOG_CASE_ID = randomUUID();
const ACTOR_ID = 2_000_000_000;
const migrationSql = readFileSync(MIGRATION_PATH, 'utf8');
const report = {
  schema: 'atlas.case-scene-route-pg18-integration.v1',
  generatedAt: new Date().toISOString(),
  status: 'NOT_RUN',
  target: { database: EXPECTED_DB, host: '127.0.0.1', port: EXPECTED_PORT },
  test: { specs: SPECS, caseFixtureCreated: false, exitCode: null },
  cleanup: { attempted: false, candidateSchemaRemoved: false, caseFixtureRemoved: false },
  committedWrites: false,
  residualArtifacts: null,
};

function scratchUrl() {
  const env = loadRepoEnv(process.env);
  const explicit = env.ATLAS_SCRATCH_PG18_URL || env.ATLAS_SCRATCH_DB_URL || env.SCRATCH_DATABASE_URL;
  const url = new URL(explicit || resolveDatabaseUrl(env));
  if (!explicit) url.pathname = `/${EXPECTED_DB}`;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname.toLowerCase()) ||
      Number(url.port || 5432) !== EXPECTED_PORT || decodeURIComponent(url.pathname.replace(/^\/+/, '')) !== EXPECTED_DB) {
    throw new Error('SCENE_SCRATCH_TARGET_GUARD_FAILED');
  }
  return url.toString();
}

const url = scratchUrl();
const envForTest = {
  ...process.env,
  DATABASE_URL: url,
  SCENE_PERSISTENCE_ENABLED: 'true',
  ATLAS_SCENE_TEST_CASE_ID: CASE_ID,
  ATLAS_SOG_TEST_CASE_ID: SOG_CASE_ID,
  ATLAS_SCENE_TEST_ACTOR_ID: String(ACTOR_ID),
};
const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  options: '-c default_transaction_read_only=off',
});
let migrationCommitted = false;
let testExitCode = null;
let caughtError = null;

try {
  await client.connect();
  const identity = (await client.query(`
    SELECT current_database() AS database, current_setting('server_version_num')::int AS version
  `)).rows[0];
  report.server = identity;
  if (identity.database !== EXPECTED_DB || Number(identity.version) < 180000) throw new Error('SCENE_SCRATCH_DATABASE_IDENTITY_OR_VERSION_MISMATCH');

  const existing = (await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name = ANY($1::text[])
  `, [SCENE_TABLES])).rows;
  const candidateTriggers = (await client.query(`
    SELECT DISTINCT trigger_name FROM information_schema.triggers
    WHERE trigger_schema='public' AND trigger_name = ANY($1::text[])
  `, [['scene_document_revisions_immutable_trg', 'scene_assets_immutable_trg', 'scene_asset_files_immutable_trg']])).rows;
  if (existing.length || candidateTriggers.length) throw new Error('SCENE_CANDIDATE_OBJECTS_ALREADY_EXIST_REFUSING_TO_MODIFY_EXISTING_SCHEMA');

  await client.query('BEGIN');
  await client.query(migrationSql);
  await client.query('COMMIT');
  migrationCommitted = true;
  report.committedWrites = true;

  const child = spawnSync(process.execPath, [VITEST_CLI, 'run', ...SPECS], {
    cwd: path.join(ROOT, 'sveltekit-frontend'),
    env: envForTest,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  testExitCode = child.status ?? 1;
  report.test.exitCode = testExitCode;
  report.test.stdout = child.stdout?.slice(-12000) ?? '';
  report.test.stderr = child.stderr?.slice(-6000) ?? '';
  report.test.caseFixtureCreated = true;
  if (child.error) throw child.error;
  if (testExitCode !== 0) throw new Error(`SCENE_ROUTE_INTEGRATION_TEST_FAILED_${testExitCode}`);
  report.status = 'PASS_REAL_ROUTE_PG18_SCRATCH_CLEANED';
} catch (error) {
  caughtError = error;
  report.status = 'FAIL_OR_BLOCKED';
  report.errorCode = error instanceof Error ? error.message : String(error);
} finally {
  if (migrationCommitted) {
    report.cleanup.attempted = true;
    try {
      await client.query('BEGIN');
      await client.query('DROP TABLE IF EXISTS public.scene_asset_files, public.scene_assets, public.scene_document_revisions');
      await client.query('DROP FUNCTION IF EXISTS public.reject_scene_document_revision_mutation()');
      await client.query('DROP FUNCTION IF EXISTS public.reject_scene_asset_mutation()');
      await client.query(`DELETE FROM public.cases WHERE (id = $1 AND title = $2) OR (id = $3 AND title = $4)`, [
        CASE_ID, `Scene API fixture ${CASE_ID}`, SOG_CASE_ID, `SOG API fixture ${SOG_CASE_ID}`
      ]);
      await client.query('COMMIT');
      const remaining = (await client.query(`
        SELECT
          (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])) AS tables,
          (SELECT count(*)::int FROM public.cases WHERE id = ANY($2::uuid[])) AS fixture_cases
      `, [SCENE_TABLES, [CASE_ID, SOG_CASE_ID]])).rows[0];
      report.cleanup.candidateSchemaRemoved = remaining.tables === 0;
      report.cleanup.caseFixtureRemoved = remaining.fixture_cases === 0;
      report.residualArtifacts = !report.cleanup.candidateSchemaRemoved || !report.cleanup.caseFixtureRemoved;
      if (!report.cleanup.candidateSchemaRemoved || !report.cleanup.caseFixtureRemoved) {
        report.status = 'CLEANUP_INCOMPLETE';
        report.errorCode ??= 'SCENE_SCRATCH_CLEANUP_READBACK_FAILED';
      }
    } catch (cleanupError) {
      try { await client.query('ROLLBACK'); } catch { /* keep original failure */ }
      report.status = 'CLEANUP_INCOMPLETE';
      report.cleanup.errorCode = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      report.committedWrites = true;
      report.residualArtifacts = true;
    }
  }
  await client.end().catch(() => {});
  mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify({
  status: report.status,
  database: report.server?.database ?? EXPECTED_DB,
  serverVersionNum: report.server?.version ?? null,
  routeTestExitCode: report.test.exitCode,
  cleanupAttempted: report.cleanup.attempted,
  candidateSchemaRemoved: report.cleanup.candidateSchemaRemoved,
  caseFixtureRemoved: report.cleanup.caseFixtureRemoved,
  committedWrites: report.committedWrites,
  residualArtifacts: report.residualArtifacts,
  reportPath: path.relative(ROOT, REPORT_PATH),
  ...(report.errorCode ? { errorCode: report.errorCode } : {}),
}, null, 2));

if (report.status !== 'PASS_REAL_ROUTE_PG18_SCRATCH_CLEANED') process.exitCode = 1;
