#!/usr/bin/env node
/**
 * Read-only smoke for MIRROR-01 / EXEC-SMOKE-06: exercises the compiled
 * residencyTransitionToWorkflowAction adapter end to end (full state ladder,
 * sequence monotonicity, negative cases). No stores, network, GPU or writes.
 * Status vocabulary: FIXTURE_ONLY on pass, BLOCKED when dist lacks the export.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const modPath = path.join(root, 'packages/parent-atlas/dist/core/workflow-action-adapters.js');
const mod = await import(pathToFileURL(modPath).href);

if (typeof mod.residencyTransitionToWorkflowAction !== 'function') {
  console.log(JSON.stringify({ status: 'BLOCKED', reason: 'DIST_MISSING_EXPORT', hint: 'build packages/parent-atlas (tsc -p)' }));
  process.exit(2);
}

const { residencyTransitionToWorkflowAction: map, RESIDENCY_STATES } = mod;
const identity = { runId: 'run:smoke', workflowId: 'wf:smoke', workflowRevision: 1, actionId: 'act:smoke', dagNodeId: 'node:smoke', attempt: 1 };
const failures = [];
const check = (name, ok) => { if (!ok) failures.push(name); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const ladder = ['QUEUED', 'DEQUEUED', 'EVIDENCE_CHECK', 'PREFETCHING', 'RESIDENT', 'EXECUTING', 'READBACK', 'RELEASED'];
let prev = -1;
ladder.forEach((state, sequence) => {
  const ev = map({
    identity,
    producer_revision: 'smoke:v1',
    transition: { sequence, state, executor: 'CPU', materializationId: 'mat:smoke', generation: 1, packetKey: 'pk:smoke', receiptId: state === 'RELEASED' ? 'rcpt:smoke' : undefined },
  });
  check(`state:${state}`, ev.metadata.residency_state === state);
  check(`monotonic:${state}`, ev.sequence > prev);
  check(`no-materialization-resource:${state}`, ev.resourceRefs.every((r) => r.resource_id !== 'mat:smoke'));
  prev = ev.sequence;
});
check('states-covered', ladder.every((s) => RESIDENCY_STATES.includes(s)));
check('released-needs-receipt', throws(() => map({ identity, producer_revision: 'smoke:v1', transition: { sequence: 9, state: 'RELEASED', executor: 'CPU', materializationId: 'm', generation: 0 } })));
check('failed-needs-reason', throws(() => map({ identity, producer_revision: 'smoke:v1', transition: { sequence: 9, state: 'FAILED', executor: 'CUDA', materializationId: 'm', generation: 0 } })));
check('unknown-state-rejected', throws(() => map({ identity, producer_revision: 'smoke:v1', transition: { sequence: 9, state: 'WARM', executor: 'CPU', materializationId: 'm', generation: 0 } })));
check('cuda-lane-gpu', map({ identity, producer_revision: 'smoke:v1', transition: { sequence: 0, state: 'QUEUED', executor: 'CUDA', materializationId: 'm', generation: 0 } }).lane === 'gpu');

const status = failures.length ? 'FAILED' : 'FIXTURE_ONLY';
console.log(JSON.stringify({ schema: 'atlas.residency-workflow-action-smoke.v1', status, failures, writesPerformed: false }));
process.exit(failures.length ? 1 : 0);
