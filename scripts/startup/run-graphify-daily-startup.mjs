#!/usr/bin/env node
/**
 * run-graphify-daily-startup.mjs
 *
 * Wrapper for graphify:daily npm script.
 * Safe background launcher when invoked manually or by a task.
 * Signals partial/provisional progress via a stable "graphify:daily partial" pattern
 * for problemMatcher.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { acquireStartupLock, releaseStartupLock } from './lib/graphify-startup-lock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.resolve(ROOT, 'sveltekit-frontend');
const DAILY_CHAIN_SCRIPT = 'npm run graphify:daily:chain';
const FALLBACK_SCRIPT = 'npm run startup:graphify-complete:no-consumer -- --skip-audit';
const STARTUP_LOCK_FILE = path.resolve(ROOT, '.graphify-daily-start.lock');

const quiet = process.env.GRAPHIFY_QUIET === '1';
const refreshFeatures = process.env.GRAPHIFY_FEATURE_RECOMMENDATIONS === '1';
const allowFallback = process.env.GRAPHIFY_ALLOW_FALLBACK === '1';
const provenanceScript = 'npm run atlas:phase109b:workflow:dry';

if (!acquireStartupLock(STARTUP_LOCK_FILE, { script: 'run-graphify-daily-startup.mjs' })) {
  if (!quiet) console.log('[graphify:daily] Another startup lock is active; backing off.');
  console.log('graphify:daily complete');
  process.exit(75);
}

process.on('exit', () => releaseStartupLock(STARTUP_LOCK_FILE));
process.on('SIGINT', () => {
  releaseStartupLock(STARTUP_LOCK_FILE);
  process.exit(130);
});
process.on('SIGTERM', () => {
  releaseStartupLock(STARTUP_LOCK_FILE);
  process.exit(143);
});

try {
  if (!quiet) console.log('[graphify:daily] Starting...');

  if (!quiet) console.log('[graphify:daily] Running repository provenance dry-run...');
  execSync(provenanceScript, {
    cwd: FRONTEND,
    stdio: 'inherit',
    timeout: 10 * 60 * 1000
  });
  if (!quiet) console.log('[graphify:daily] Repository provenance dry-run complete');

  // Run from sveltekit-frontend directory to resolve npm scripts
  //
  // graphify:daily:chain runs 6 sequential steps (dedup-validation,
  // materialize, cold-processing, phase8-fanout's own 9 sub-steps,
  // qdrant tag-mirror, feature-map-sync) over the full production
  // packet corpus (60K+ rows). A 5-minute timeout here silently killed
  // the chain mid-run with ETIMEDOUT regardless of progress — phase8's
  // own fanout orchestrator already grants itself a 2h overall-timeout
  // (see run-atlas-phase8-fanout.mjs), so the outer wrapper must not be
  // shorter than that. 3h gives headroom for the steps around it.
  execSync(DAILY_CHAIN_SCRIPT, {
    cwd: FRONTEND,
    stdio: 'inherit',
    timeout: 3 * 60 * 60 * 1000 // 3 hour timeout
  });

  console.log('graphify:daily partial');

  if (refreshFeatures) {
    if (!quiet) console.log('[graphify:daily] Refreshing feature recommendation index...');
    execSync('npm run atlas:feature-recommendations:refresh', {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true
    });
    console.log('[graphify:daily] feature recommendations complete');
  }

  // DAG-4/QAS is a non-mutating recommendation sketch. It may emit a
  // deferred receipt when no candidate feature matrix exists, but it must
  // never block canonical Graphify completion or invent candidate evidence.
  try {
    execSync('npx tsx ../scripts/atlas/prove-query-adaptive-sampling.mts --daily', {
      cwd: FRONTEND,
      stdio: quiet ? 'ignore' : 'inherit',
      shell: true,
      timeout: 60 * 1000
    });
  } catch (qasError) {
    console.warn(`[graphify:daily] QAS receipt deferred: ${qasError.message}`);
  }
  try {
    execSync('npx tsx ../scripts/atlas/evaluate-query-adaptive-sampling.mts', {
      cwd: FRONTEND,
      stdio: quiet ? 'ignore' : 'inherit',
      shell: true,
      timeout: 60 * 1000
    });
  } catch (qasEvalError) {
    console.warn(`[graphify:daily] QAS evaluation deferred: ${qasEvalError.message}`);
  }

  // RLM/ACE routing consumes only the already-derived QAS candidate feature
  // artifact. RLM selects evidence branches; ACE emits prefetch/residency hints.
  // This step is deliberately read-only: no Valkey warming, GPU promotion,
  // Postgres receipt persistence, graph fanout, or Kanban mutation occurs here.
  try {
    execSync('npx tsx ../scripts/atlas/report-rlm-ace-routing.mts', {
      cwd: FRONTEND,
      stdio: quiet ? 'ignore' : 'inherit',
      shell: true,
      timeout: 60 * 1000
    });
  } catch (rlmAceError) {
    console.warn(`[graphify:daily] RLM/ACE routing receipt deferred: ${rlmAceError.message}`);
  }

  // Terminal lifecycle marker for .vscode/tasks.json's background problemMatcher
  // (endsPattern: "graphify:daily complete") — must be printed on every exit
  // path (success, fallback-success, and failure), not just success. Before
  // this fix the script never emitted this exact string anywhere, so the
  // isBackground:true task's endsPattern could never match — VS Code had no
  // reliable signal the task had finished, on success or failure alike. Do
  // not confuse this with the "partial" markers above/below, which signal
  // data-completeness (chain-progressed-but-not-all-substeps-verified), a
  // separate concern from process-lifecycle termination.
  console.log('graphify:daily complete');
  process.exit(0);
} catch (err) {
  console.error(`ERROR: graphify:daily failed: ${err.message}`);
  if (!allowFallback) {
    console.error('[graphify:daily] Fallback disabled; exiting with failure.');
    console.log('graphify:daily complete');
    process.exit(1);
  }

  console.log('[graphify:daily] Falling back to startup pipeline...');

  try {
    execSync(FALLBACK_SCRIPT, {
      cwd: FRONTEND,
      stdio: 'inherit',
      timeout: 10 * 60 * 1000,
      shell: true,
    });
    console.log('[graphify:daily] fallback startup partial');
    console.log('graphify:daily complete');
    process.exit(0);
  } catch (fallbackErr) {
    console.error(`ERROR: graphify fallback failed: ${fallbackErr.message}`);
    console.log('graphify:daily partial');
    console.log('graphify:daily complete');
    process.exit(1);
  }
}
