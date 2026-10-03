#!/usr/bin/env node
/**
 * KARPATHY-GPU-ADMITTED-01 — makes `npm run karpathy:gpu`'s apply path actually
 * runnable, without fabricating either required admission value.
 *
 * `scripts/atlas/karpathy-gpu-enrich.mjs`'s apply mode hard-requires
 * ATLAS_WORKSPACE_REVISION (sha256:-prefixed) and ATLAS_SOURCE_COHORT_CHECKSUM
 * (64-hex) env vars, but nothing in this repo ever set them — the startup
 * task's `npm run karpathy:gpu` step has always thrown
 * KARPATHY_APPLY_ADMITTED_WORKSPACE_REVISION_REQUIRED as a result (see
 * STARTUP-BITFROST-WARM-DIAGNOSIS-01 in
 * openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md).
 *
 * This wrapper supplies BOTH values from real, live data, never invented:
 *   1. workspaceRevision  <- the most recent COMPLETED graphify_runs row's
 *      real sha256 workspace_revision (same query/semantics as
 *      resolveCurrentGraphifyWorkspaceRevision() in
 *      sveltekit-frontend/src/lib/server/atlas/board/
 *      graphify-current-workspace-revision.ts, replicated here in plain SQL
 *      since this is a workspace-root .mjs script, not a SvelteKit module —
 *      see CLAUDE.md's "NPX Execution Context & Module Alias Resolution").
 *      If no such row exists, this wrapper FAILS CLOSED — it never falls
 *      back to a timestamp or synthesized value.
 *   2. sourceCohortChecksum <- a sha256 of the EXACT candidate stableKey set
 *      karpathy-gpu-enrich.mjs itself fetches for this run (via its own
 *      `--dry-run --dry-run-candidates` mode, which now emits a
 *      `KARPATHY_COHORT_JSON:` line for exactly this purpose). The real apply
 *      run is then invoked with the identical passthrough args so its
 *      candidate fetch is the same query, reproducing the same cohort.
 *
 * Usage: node scripts/atlas/run-karpathy-gpu-admitted-v1.mjs [any karpathy-gpu-enrich.mjs flags]
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_SCRIPT = path.join(__dirname, 'karpathy-gpu-enrich.mjs');
const passthroughArgs = process.argv.slice(2);

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const client = await pool.connect();
const revisionRow = (await client.query(`
  SELECT run_id, workspace_revision
  FROM graphify_runs
  WHERE workspace_revision ~ '^sha256:[a-f0-9]{64}$'
  ORDER BY (status = 'COMPLETED') DESC, started_at DESC
  LIMIT 1
`)).rows[0];
client.release();
await pool.end();

if (!revisionRow) {
  console.error(JSON.stringify({
    status: 'NO_ADMITTED_WORKSPACE_REVISION',
    reason: 'No graphify_runs row has a real sha256:-prefixed workspace_revision yet.',
    fabricated: false,
  }, null, 2));
  process.exit(1);
}

const workspaceRevision = revisionRow.workspace_revision;
console.log(`[karpathy-admitted] using workspaceRevision=${workspaceRevision} (graphify_runs.run_id=${revisionRow.run_id})`);

// Step 1: real candidate-set checksum, via the target script's own dry-run-candidates mode.
const cohortProbe = spawnSync(process.execPath, [TARGET_SCRIPT, ...passthroughArgs, '--dry-run', '--dry-run-candidates'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

if (cohortProbe.status !== 0) {
  console.error('[karpathy-admitted] candidate-cohort probe failed:');
  console.error(cohortProbe.stdout);
  console.error(cohortProbe.stderr);
  process.exit(cohortProbe.status ?? 1);
}

const cohortLine = cohortProbe.stdout.split('\n').find((line) => line.startsWith('KARPATHY_COHORT_JSON:'));
if (!cohortLine) {
  console.error(JSON.stringify({
    status: 'NO_COHORT_CHECKSUM_EMITTED',
    reason: 'karpathy-gpu-enrich.mjs did not print a KARPATHY_COHORT_JSON line — is it out of sync with this wrapper?',
    stdoutTail: cohortProbe.stdout.slice(-2000),
  }, null, 2));
  process.exit(1);
}

const cohort = JSON.parse(cohortLine.slice('KARPATHY_COHORT_JSON:'.length));
console.log(`[karpathy-admitted] using sourceCohortChecksum=${cohort.sourceCohortChecksum} (${cohort.candidateCount} candidates, mode=${cohort.mode}, limit=${cohort.limit})`);

// Step 2: real apply run, same passthrough args, no dry flags, admitted values supplied via env.
const applyRun = spawnSync(process.execPath, [TARGET_SCRIPT, ...passthroughArgs], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    ATLAS_WORKSPACE_REVISION: workspaceRevision,
    ATLAS_SOURCE_COHORT_CHECKSUM: cohort.sourceCohortChecksum,
  },
});

process.exit(applyRun.status ?? 1);
