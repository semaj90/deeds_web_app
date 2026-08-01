#!/usr/bin/env node
/**
 * run-graphify-daily-startup.mjs
 *
 * Wrapper for graphify:daily npm script.
 * Runs on VS Code folder open as background task.
 * Signals partial/provisional progress via a stable "graphify:daily partial" pattern
 * for problemMatcher.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.resolve(ROOT, 'sveltekit-frontend');
const DAILY_CHAIN_SCRIPT = 'npm run graphify:daily:chain';
const FALLBACK_SCRIPT = 'npm run startup:graphify-complete:no-consumer -- --skip-audit';

const quiet = process.env.GRAPHIFY_QUIET === '1';
const refreshFeatures = process.env.GRAPHIFY_FEATURE_RECOMMENDATIONS === '1';
const allowFallback = process.env.GRAPHIFY_ALLOW_FALLBACK === '1';
const provenanceScript = 'npm run atlas:phase109b:workflow:dry';

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

  process.exit(0);
} catch (err) {
  console.error(`ERROR: graphify:daily failed: ${err.message}`);
  if (!allowFallback) {
    console.error('[graphify:daily] Fallback disabled; exiting with failure.');
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
    process.exit(0);
  } catch (fallbackErr) {
    console.error(`ERROR: graphify fallback failed: ${fallbackErr.message}`);
    console.log('graphify:daily partial');
    process.exit(1);
  }
}
