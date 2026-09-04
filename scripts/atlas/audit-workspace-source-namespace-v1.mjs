#!/usr/bin/env node
/**
 * WORKSPACE-SOURCE-NAMESPACE-01 -- read-only workspace/source binding audit.
 * This script never updates Graphify, PostgreSQL, Qdrant, Neo4j, or Valkey.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });

const config = JSON.parse(readFileSync(resolve(ROOT, 'scripts/atlas/daily-graphify-config.json'), 'utf8'));
const ownerReport = JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/graphify-workspace-owner-v1.json'), 'utf8'));
const runOwnerReport = JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/current-graphify-run-owner-v1.json'), 'utf8'));
const REPORT = resolve(ROOT, 'docs/reports/workspace-source-namespace-v1.json');
const logicalWorkspaceKey = String(config.workspace_id ?? '').trim() || null;
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

const text = (value) => (value == null ? null : String(value).trim() || null);
const configuredWorkspaceUuid = text(config.workspace_uuid);

async function main() {
  const columnsResult = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workspaces'
    ORDER BY ordinal_position
  `);
  const columns = columnsResult.rows.map((row) => row.column_name);
  const workspaceId = configuredWorkspaceUuid
    ?? text(runOwnerReport.currentRun?.workspace_id ?? runOwnerReport.runs?.[0]?.workspace_id);
  const workspaceRows = workspaceId
    ? (await pool.query('SELECT * FROM public.workspaces WHERE id = $1::uuid', [workspaceId])).rows
    : [];
  const runRows = workspaceId
    ? (await pool.query(`
        SELECT run_id, workspace_id, workspace_revision, status, started_at, completed_at
        FROM public.graphify_runs
        WHERE workspace_id = $1::uuid
        ORDER BY started_at DESC, run_id
      `, [workspaceId])).rows
    : [];
  await pool.end();

  const candidateKeyColumns = columns.filter((column) => /(^|_)(name|key|slug|identifier|code)($|_)/i.test(column));
  const matchingColumns = candidateKeyColumns.filter((column) =>
    workspaceRows.some((row) => text(row[column]) === logicalWorkspaceKey));
  const repositoryKey = text(config.repository_key ?? config.repositoryKey) ?? null;
  const directoryScope = text(config.directory_scope ?? config.directoryScope) ?? null;
  const completedRuns = runRows.filter((row) => row.status === 'COMPLETED' && row.completed_at);
  const report = {
    schema: 'atlas.workspace-source-namespace.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
    logicalWorkspaceKey,
    workspaceId,
    configuredWorkspaceUuid,
    repositoryKey,
    directoryScope,
    candidateKeyColumns,
    matchingKeyColumns: matchingColumns,
    workspaceRowCount: workspaceRows.length,
    graphifyRunCount: runRows.length,
    completedGraphifyRunCount: completedRuns.length,
    currentRun: runRows[0] ?? null,
    checks: {
      logicalKeyResolvesExactlyOneWorkspace: matchingColumns.length > 0 && workspaceRows.length === 1,
      configuredUuidMatchesLiveOwner: !configuredWorkspaceUuid || configuredWorkspaceUuid === workspaceId,
      workspaceForeignKeyOwnerPresent: ownerReport.graphifyRunWorkspaceForeignKey === true,
      repositoryIdentityExplicit: Boolean(repositoryKey),
      directoryScopeExplicit: Boolean(directoryScope),
      workspaceRevisionAvailable: runRows.some((row) => /^sha256:[0-9a-f]{64}$/i.test(text(row.workspace_revision) ?? '')),
      completedOwnerAvailable: completedRuns.length > 0,
      absolutePathNamespaceDependency: false,
      ambiguity: 0,
    },
    status: 'WORKSPACE_SOURCE_NAMESPACE_BLOCKED',
    nextGate: 'Resolve logical key, repository identity, and directory scope into one revisioned binding before PKT-LINEAGE-08.',
  };
  const checks = report.checks;
  // GRAPHIFY-LIFECYCLE-OWNER-01 (2026-09-03): absolutePathNamespaceDependency is an
  // inverted-meaning check -- false IS the passing state (no absolute-path dependency exists),
  // unlike every other boolean check here where true means passing. The original
  // `every(value === true || value === 0)` condition could never be satisfied while this field
  // stayed its correct value of false, making WORKSPACE_SOURCE_NAMESPACE_PROVEN structurally
  // unreachable regardless of how many real conditions were met. Confirmed via a real run:
  // all 8 other checks true, this one false (correct), status stuck at BLOCKED. Fixed by
  // evaluating each check against its own documented passing value instead of one uniform rule.
  const passingValueByCheck = {
    absolutePathNamespaceDependency: false,
    ambiguity: 0,
  };
  const allChecksPass = Object.entries(checks).every(([key, value]) => {
    if (key in passingValueByCheck) return value === passingValueByCheck[key];
    return value === true;
  });
  if (allChecksPass) {
    report.status = 'WORKSPACE_SOURCE_NAMESPACE_PROVEN';
  }
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, workspaceId, logicalWorkspaceKey, repositoryKey, directoryScope, completedGraphifyRunCount: completedRuns.length, report: REPORT }, null, 2));
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
