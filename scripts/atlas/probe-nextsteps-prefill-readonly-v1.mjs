#!/usr/bin/env node
/**
 * Canonical read-only proof that the real Kanban DAG proposer accepts and
 * evaluates a nextsteps: feature against the isolated PG18 scratch inventory.
 * Requires: node --import tsx/esm scripts/atlas/probe-nextsteps-prefill-readonly-v1.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { recommendKanbanDagPrefillV1 } from '../../sveltekit-frontend/src/mcp/kanban-dag-prefill-recommendation.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXPECTED_DB = 'legal_ai_live_integration_scratch';
const EXPECTED_PORT = 5434;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const featureId = process.argv.slice(2).find((arg) => arg.startsWith('--feature-id='))?.slice(13)
  ?? 'nextsteps:next-steps-active-2026-05-09-dev-test-prod-split-plan';
const outputArg = process.argv.slice(2).find((arg) => arg.startsWith('--report='))?.slice(9)
  ?? '.tmp/atlas/nextsteps-prefill-readonly-v1.json';
const outputPath = path.resolve(ROOT, outputArg);
if (!outputPath.startsWith(`${path.resolve(ROOT, '.tmp')}${path.sep}`)) {
  throw new Error('REPORT_PATH_MUST_BE_UNDER_REPO_TMP');
}

const url = new URL(process.env.SCRATCH_DATABASE_URL ?? resolveDatabaseUrl(loadRepoEnv(process.env)));
url.pathname = `/${EXPECTED_DB}`;
if (!LOOPBACK.has(url.hostname) || Number(url.port || 5432) !== EXPECTED_PORT) {
  throw new Error('SCRATCH_ENDPOINT_MUST_BE_LOOPBACK_PORT_5434');
}

const pool = new pg.Pool({
  connectionString: url.toString(),
  max: 2,
  connectionTimeoutMillis: 5000,
  options: '-c default_transaction_read_only=on',
});
const report = {
  schema: 'atlas.nextsteps-prefill-readonly-proof.v1',
  generatedAt: new Date().toISOString(),
  status: 'NOT_RUN',
  database: null,
  serverVersionNum: null,
  featureId,
  recommendation: null,
  canonicalAuthority: false,
  writesPerformed: false,
};

try {
  const client = await pool.connect();
  try {
    const identity = (await client.query(`
      SELECT current_database() AS database,
             current_setting('server_version_num')::int AS server_version_num
    `)).rows[0];
    if (identity.database !== EXPECTED_DB || Number(identity.server_version_num) < 180000) {
      throw new Error('SCRATCH_DATABASE_IDENTITY_OR_PG18_CHECK_FAILED');
    }
    report.database = identity.database;
    report.serverVersionNum = Number(identity.server_version_num);
  } finally {
    client.release();
  }

  const recommendation = await recommendKanbanDagPrefillV1(pool, {
    featureId,
    cohortLimit: 64,
    maxPrefillTasks: 16,
  });
  if (recommendation.writesPerformed !== false || recommendation.canonicalAuthority !== false) {
    throw new Error('PROPOSER_RETURNED_MUTATING_OR_CANONICAL_RESULT');
  }
  report.recommendation = {
    status: recommendation.status,
    reasonCode: recommendation.reasonCode ?? null,
    algorithm: recommendation.algorithm ?? null,
    taskCount: recommendation.graphProfile?.taskCount ?? null,
    dependencyCount: recommendation.graphProfile?.dependencyCount ?? null,
    readyTaskIds: recommendation.readyTaskIds ?? [],
    writesPerformed: recommendation.writesPerformed,
    canonicalAuthority: recommendation.canonicalAuthority,
  };
  report.status = recommendation.status === 'PROPOSED'
    ? 'NEXTSTEPS_PROPOSER_READONLY_PASS'
    : 'NEXTSTEPS_PROPOSER_RETURNED_NO_PROPOSAL';
} catch (error) {
  report.status = 'NEXTSTEPS_PROPOSER_READONLY_FAILED';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  schema: report.schema,
  status: report.status,
  database: report.database,
  featureId: report.featureId,
  proposalStatus: report.recommendation?.status ?? null,
  readyCount: report.recommendation?.readyTaskIds?.length ?? 0,
  dependencyCount: report.recommendation?.dependencyCount ?? null,
  writesPerformed: false,
  reportPath: path.relative(ROOT, outputPath),
}, null, 2)}\n`);
if (report.status !== 'NEXTSTEPS_PROPOSER_READONLY_PASS') process.exitCode = 1;
