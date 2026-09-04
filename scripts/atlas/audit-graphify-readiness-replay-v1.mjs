#!/usr/bin/env node
/**
 * GRAPHIFY-STALE-RUN-REPLAY-01 -- readiness-only replay of existing evidence.
 * No Graphify stage is started and no database row is updated.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const sourceReport = JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/current-graphify-run-owner-v1.json'), 'utf8'));
const REPORT = resolve(ROOT, 'docs/reports/graphify-readiness-replay-v1.json');
const currentRun = sourceReport.currentRun ?? sourceReport.runs?.[0] ?? null;
const pool = new pg.Pool({
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
});

async function main() {
  if (!currentRun?.run_id) throw new Error('CURRENT_GRAPHIFY_RUN_MISSING');
  const result = await pool.query(`
    SELECT parse_status, count(*)::integer AS count,
           count(*) FILTER (WHERE source_revision IS NOT NULL AND content_hash IS NOT NULL)::integer AS revision_hash_ready,
           count(*) FILTER (WHERE byte_length > 0)::integer AS nonempty
    FROM public.graphify_files
    WHERE first_seen_run_id = $1::uuid OR last_seen_run_id = $1::uuid
    GROUP BY parse_status
    ORDER BY parse_status
  `, [currentRun.run_id]);
  await pool.end();
  const indexedCount = result.rows.reduce((sum, row) => sum + Number(row.count), 0);
  const revisionHashReady = result.rows.reduce((sum, row) => sum + Number(row.revision_hash_ready), 0);
  const nonempty = result.rows.reduce((sum, row) => sum + Number(row.nonempty), 0);
  const manifestCount = Number(currentRun.source_manifest_source_count ?? 0);
  const report = {
    schema: 'atlas.graphify-readiness-replay.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READINESS_ONLY',
    readOnly: true,
    writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
    run: {
      runId: currentRun.run_id,
      workspaceId: currentRun.workspace_id,
      workspaceRevision: currentRun.workspace_revision,
      status: currentRun.status,
      completedAt: currentRun.completed_at,
      manifestCount,
    },
    evidence: {
      graphifyFileCount: indexedCount,
      revisionHashReady,
      nonempty,
      parseStatusCounts: result.rows,
    },
    checks: {
      runExists: true,
      runCompleted: currentRun.status === 'COMPLETED' && Boolean(currentRun.completed_at),
      manifestCoveragePresent: manifestCount > 0,
      fileEvidencePresent: indexedCount > 0,
      revisionHashCoverageComplete: indexedCount > 0 && revisionHashReady === indexedCount,
      nonemptyCoverageComplete: indexedCount > 0 && nonempty === indexedCount,
    },
    status: 'READINESS_REPLAY_BLOCKED_STALE_RUN',
    conclusion: 'Existing evidence was inspected without mutating run state; a stale RUNNING record cannot be promoted or converted into a completion receipt by this replay.',
    nextGate: 'Explicit abandonment review or separately authorized fresh Graphify execution.',
  };
  if (report.checks.runCompleted && report.checks.manifestCoveragePresent && report.checks.fileEvidencePresent && report.checks.revisionHashCoverageComplete && report.checks.nonemptyCoverageComplete) {
    report.status = 'READINESS_REPLAY_PROVEN';
  }
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, runId: currentRun.run_id, graphifyFileCount: indexedCount, report: REPORT }, null, 2));
}

main().catch(async (error) => {
  await pool.end().catch(() => {});
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
