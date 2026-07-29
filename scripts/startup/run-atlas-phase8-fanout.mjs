#!/usr/bin/env node
/**
 * run-atlas-phase8-fanout.mjs
 *
 * Bounded wrapper for the phase8 fanout chain so each sub-step has a visible
 * boundary and a per-step timeout. This keeps graphify:daily from looking
 * frozen when one downstream job is just slow.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.resolve(ROOT, 'sveltekit-frontend');

dotenv.config({ path: path.join(ROOT, '.env'), override: false });
dotenv.config({ path: path.join(ROOT, '.env.local'), override: false });

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const STEP_TIMEOUT_MS = Number(process.env.GRAPHIFY_PHASE8_STEP_TIMEOUT_MS || 20 * 60 * 1000);
const OVERALL_STEP_TIMEOUT_MS = Number(process.env.GRAPHIFY_PHASE8_OVERALL_TIMEOUT_MS || 120 * 60 * 1000);

const steps = DRY_RUN
  ? [
      ['atlas:phase8:step3:langextract:gate', 'gate'],
      ['atlas:summary:index:rank', 'dry'],
      ['atlas:summary:envelopes:build:dry', 'dry'],
      ['atlas:summary:envelopes:queue:dry', 'dry'],
      ['atlas:materialize:feature-envelopes:dry', 'dry'],
      ['atlas:phase16:latent:dry', 'dry'],
      ['atlas:phase16:som:dry', 'dry'],
      ['atlas:phase16:gds:dry', 'dry'],
      ['atlas:bitfrost-semantic-cache:warm', 'dry'],
    ]
  : [
      ['atlas:phase8:step3:langextract:apply', 'apply'],
      ['atlas:summary:index:rank:apply', 'apply'],
      ['atlas:summary:envelopes:build:apply', 'apply'],
      ['atlas:summary:envelopes:queue:apply', 'apply'],
      ['atlas:materialize:feature-envelopes:apply', 'apply'],
      ['atlas:phase16:latent:apply', 'apply'],
      ['atlas:phase16:som:apply', 'apply'],
      ['atlas:phase16:gds:apply', 'apply'],
      ['atlas:bitfrost-semantic-cache:warm:apply', 'apply'],
    ];

function log(message) {
  console.log(`[phase8-fanout] ${message}`);
}

async function runStep(script) {
  const startedAt = Date.now();
  log(`→ ${script}`);
  return await new Promise((resolve) => {
    const child = spawn('npm', ['run', script], {
      cwd: FRONTEND,
      shell: true,
      env: process.env,
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, STEP_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));

    child.on('error', (error) => {
      clearTimeout(timeout);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      log(`✗ ${script} failed to start after ${elapsed}s: ${error.message}`);
      resolve({ ok: false, timedOut: false, code: null, elapsed });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (timedOut) {
        log(`✗ ${script} timed out after ${elapsed}s`);
        resolve({ ok: false, timedOut: true, code: null, elapsed });
        return;
      }
      if (code !== 0) {
        log(`✗ ${script} exited with code ${code} after ${elapsed}s`);
        resolve({ ok: false, timedOut: false, code, elapsed });
        return;
      }
      log(`✓ ${script} completed in ${elapsed}s`);
      resolve({ ok: true, timedOut: false, code: 0, elapsed });
    });
  });
}

const overallStartedAt = Date.now();
log(`starting [dry-run=${DRY_RUN}] [step-timeout=${STEP_TIMEOUT_MS}ms] [overall-timeout=${OVERALL_STEP_TIMEOUT_MS}ms]`);

for (const [script] of steps) {
  if (Date.now() - overallStartedAt > OVERALL_STEP_TIMEOUT_MS) {
    log(`✗ overall timeout reached before ${script}`);
    process.exit(1);
  }

  const result = await runStep(script);
  if (!result.ok) {
    process.exit(result.timedOut ? 124 : 1);
  }
}

const elapsedSec = ((Date.now() - overallStartedAt) / 1000).toFixed(1);
log(`complete in ${elapsedSec}s`);
