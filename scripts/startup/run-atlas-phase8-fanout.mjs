#!/usr/bin/env node
/**
 * run-atlas-phase8-fanout.mjs
 *
 * Bounded wrapper for the phase8 fanout chain so each sub-step has a visible
 * boundary and a per-step timeout. This keeps graphify:daily from looking
 * frozen when one downstream job is just slow.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Phase8ProgressTracker } from '../atlas/lib/phase8_progress.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRONTEND = path.resolve(ROOT, 'sveltekit-frontend');

dotenv.config({ path: path.join(ROOT, '.env'), override: false });
dotenv.config({ path: path.join(ROOT, '.env.local'), override: false });

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const APPLY_THROUGH = Number(process.argv.find((a) => a.startsWith('--apply-through='))?.split('=')[1] ?? 0);
const STEP_TIMEOUT_MS = Number(process.env.GRAPHIFY_PHASE8_STEP_TIMEOUT_MS || 20 * 60 * 1000);
const OVERALL_STEP_TIMEOUT_MS = Number(process.env.GRAPHIFY_PHASE8_OVERALL_TIMEOUT_MS || 120 * 60 * 1000);
const HEARTBEAT_MS = Number(process.env.GRAPHIFY_PHASE8_HEARTBEAT_MS || 15_000);

function log(message) {
  console.log(`[phase8-fanout] ${message}`);
}

const PHASE8_DRY_PLAN = [
  ['atlas:phase8:step3:langextract:gate', 'gate'],
  ['atlas:summary:index:rank', 'dry'],
  ['atlas:summary:envelopes:build:dry', 'dry'],
  ['atlas:summary:envelopes:queue:dry', 'dry'],
  ['atlas:materialize:feature-envelopes:dry', 'dry'],
  ['atlas:phase16:latent:dry', 'dry'],
  ['atlas:phase16:som:dry', 'dry'],
  ['atlas:phase16:gds:dry', 'dry'],
  ['atlas:bitfrost-semantic-cache:warm', 'dry'],
  ['atlas:centroids:cache:dry', 'dry'],
  ['atlas:graphify-draft:dry', 'dry'],
];

const PHASE8_APPLY_PLAN = [
  ['atlas:phase8:step3:langextract:apply', 'apply'],
  ['atlas:summary:index:rank:apply', 'apply'],
  ['atlas:summary:envelopes:build:apply', 'apply'],
  ['atlas:summary:envelopes:queue:apply', 'apply'],
  ['atlas:materialize:feature-envelopes:apply', 'apply'],
  ['atlas:phase16:latent:apply', 'apply'],
  ['atlas:phase16:som:apply', 'apply'],
  ['atlas:phase16:gds:apply', 'apply'],
  ['atlas:bitfrost-semantic-cache:warm:apply', 'apply'],
  ['atlas:centroids:cache:warm', 'apply'],
  ['atlas:graphify-draft:apply', 'apply'],
];

/**
 * @param {boolean} dryRun
 * @param {number} applyThrough - when dryRun=true, run steps 1..applyThrough
 *   for real (apply) and leave the rest dry. 0 = fully dry. Ignored when
 *   dryRun=false (everything is already apply). The two plans above are
 *   index-aligned 1:1 so this is a straight per-index swap.
 */
export function buildPhase8StepPlan(dryRun = false, applyThrough = 0) {
  if (!dryRun) return PHASE8_APPLY_PLAN;
  if (applyThrough <= 0) return PHASE8_DRY_PLAN;
  return PHASE8_DRY_PLAN.map((step, i) => (i < applyThrough ? PHASE8_APPLY_PLAN[i] : step));
}

function createStepSnapshot(tracker, runId, stepStates, stepIndex, stepCount, state, startedAt, phase, phaseDetail, lastArtifactId = null) {
  const { percent } = tracker.calculateWeightedProgress(stepStates);
  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  const completedSteps = stepStates.filter((step) => step.completed >= step.total).length;
  const ratePerSecond = elapsedSeconds > 0 ? completedSteps / elapsedSeconds : null;
  const etaSeconds = percent > 0 && percent < 100 ? Math.max(0, Math.round((elapsedSeconds * (100 - percent)) / percent)) : null;
  const currentStep = stepStates[stepIndex - 1] ?? stepStates[0];

  return {
    schema_version: 'atlas-progress-v1',
    run_id: runId,
    pipeline: 'phase8',
    step_id: currentStep?.id ?? `step${stepIndex}`,
    step_index: stepIndex,
    step_count: stepCount,
    state,
    completed: currentStep?.completed ?? 0,
    total: currentStep?.total ?? 1,
    percent,
    rate_per_second: ratePerSecond,
    elapsed_seconds: Math.round(elapsedSeconds),
    eta_seconds: etaSeconds,
    last_artifact_id: lastArtifactId,
    heartbeat_at: new Date().toISOString(),
    phase,
    phase_detail: phaseDetail,
  };
}

function emitStepEvent(tracker, runId, stepStates, stepIndex, stepCount, state, startedAt, phase, phaseDetail, lastArtifactId = null) {
  const event = createStepSnapshot(tracker, runId, stepStates, stepIndex, stepCount, state, startedAt, phase, phaseDetail, lastArtifactId);
  tracker.writeEvent(event);
  return event;
}

async function runStep(script, stepStates, stepIndex, startedAt, phase, runId, tracker, spawnImpl = spawn, heartbeatMs = HEARTBEAT_MS, stepTimeoutMs = STEP_TIMEOUT_MS) {
  const totalSteps = stepStates.length;
  log(`→ ${script}`);
  emitStepEvent(tracker, runId, stepStates, stepIndex, totalSteps, 'STARTING', startedAt, phase, script);

  return await new Promise((resolve) => {
    const child = spawnImpl('npm', ['run', script], {
      cwd: FRONTEND,
      shell: true,
      env: process.env,
    });

    let timedOut = false;
    let settled = false;
    const heartbeat = heartbeatMs > 0
      ? setInterval(() => {
          if (!settled) {
            emitStepEvent(tracker, runId, stepStates, stepIndex, totalSteps, 'RUNNING', startedAt, phase, script);
          }
        }, heartbeatMs)
      : null;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, stepTimeoutMs);

    child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk) => process.stderr.write(chunk));

    const cleanup = () => {
      settled = true;
      clearTimeout(timeout);
      if (heartbeat) clearInterval(heartbeat);
    };

    child.on('error', (error) => {
      cleanup();
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      emitStepEvent(tracker, runId, stepStates, stepIndex, totalSteps, 'FAILED', startedAt, phase, script);
      log(`✗ ${script} failed to start after ${elapsed}s: ${error.message}`);
      resolve({ ok: false, timedOut: false, code: null, elapsed });
    });

    child.on('close', (code) => {
      cleanup();
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (timedOut) {
        emitStepEvent(tracker, runId, stepStates, stepIndex, totalSteps, 'TIMED_OUT', startedAt, phase, script);
        log(`✗ ${script} timed out after ${elapsed}s`);
        resolve({ ok: false, timedOut: true, code: null, elapsed });
        return;
      }
      if (code !== 0) {
        emitStepEvent(tracker, runId, stepStates, stepIndex, totalSteps, 'FAILED', startedAt, phase, script);
        log(`✗ ${script} exited with code ${code} after ${elapsed}s`);
        resolve({ ok: false, timedOut: false, code, elapsed });
        return;
      }
      stepStates[stepIndex - 1].completed = 1;
      emitStepEvent(tracker, runId, stepStates, stepIndex, totalSteps, 'SUCCEEDED', startedAt, phase, script);
      log(`✓ ${script} completed in ${elapsed}s`);
      resolve({ ok: true, timedOut: false, code: 0, elapsed });
    });
  });
}

export async function runPhase8Fanout({
  dryRun = DRY_RUN,
  applyThrough = APPLY_THROUGH,
  verbose = VERBOSE,
  stepTimeoutMs = STEP_TIMEOUT_MS,
  overallTimeoutMs = OVERALL_STEP_TIMEOUT_MS,
  heartbeatMs = HEARTBEAT_MS,
  runId = `phase8_${new Date().toISOString().replace(/[^\d]/g, '').slice(0, 14)}`,
  spawnImpl = spawn,
  logger = log,
  tracker = new Phase8ProgressTracker(runId),
  stepPlan = buildPhase8StepPlan(dryRun, applyThrough),
} = {}) {
  const overallStartedAt = Date.now();
  const stepStates = stepPlan.map(([script], i) => ({
    id: `step${i + 1}`,
    step_index: i + 1,
    script,
    completed: 0,
    total: 1,
  }));

  logger(`starting [dry-run=${dryRun}] [apply-through=${applyThrough}] [step-timeout=${stepTimeoutMs}ms] [overall-timeout=${overallTimeoutMs}ms] [run-id=${runId}]`);
  tracker.writeEvent(createStepSnapshot(tracker, runId, stepStates, 1, stepStates.length, 'STARTING', overallStartedAt, 'phase8', stepPlan[0]?.[0] ?? 'phase8'));

  for (let i = 0; i < stepPlan.length; i++) {
    const [script] = stepPlan[i];
    const stepState = stepStates[i];

    if (Date.now() - overallStartedAt > overallTimeoutMs) {
      logger(`✗ overall timeout reached before ${script}`);
      stepState.completed = 0;
      tracker.writeEvent(createStepSnapshot(tracker, runId, stepStates, i + 1, stepStates.length, 'TIMED_OUT', overallStartedAt, 'phase8', script));
      process.exitCode = 1;
      return { ok: false, reason: 'overall-timeout', runId };
    }

    const elapsed = ((Date.now() - overallStartedAt) / 1000).toFixed(1);
    logger(`[${i + 1}/${stepPlan.length}] → ${script} (elapsed ${elapsed}s)`);

    const result = await runStep(script, stepStates, i + 1, overallStartedAt, 'phase8', runId, tracker, spawnImpl, heartbeatMs, stepTimeoutMs);

    if (!result.ok) {
      logger(`[${i + 1}/${stepPlan.length}] ✗ ${script} failed after ${result.elapsed}s`);
      process.exitCode = result.timedOut ? 124 : 1;
      return { ok: false, reason: result.timedOut ? 'step-timeout' : 'step-failed', runId };
    }

    if (verbose) {
      const completedSteps = stepStates.filter((s) => s.completed === s.total).length;
      const { description } = tracker.calculateWeightedProgress(stepStates);
      logger(`progress: ${completedSteps}/${stepPlan.length} steps complete`);
      logger(description);
    }
  }

  const elapsedSec = ((Date.now() - overallStartedAt) / 1000).toFixed(1);
  logger(`complete in ${elapsedSec}s`);
  return { ok: true, runId };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await runPhase8Fanout({ dryRun: DRY_RUN, applyThrough: APPLY_THROUGH, verbose: VERBOSE });
}
