import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOpenSpecTaskEvidenceBindingsV1, predicateIdForTaskClaim } from './resolve-openspec-predicates-v1.mjs';

function task(name, line) {
  return {
    taskRef: `openspec/changes/demo/tasks.md#L${line}`,
    canonicalTaskRef: `openspec-task:openspec://root/demo/${name}`,
    taskKey: name,
    taskText: `Verify ${name}`,
    taskHash: `sha256:source-${name}`,
    changeId: 'demo',
    taskId: name,
  };
}

test('derives blocker, failed, stale, partial, and proven states from admitted evidence', () => {
  const tasks = [task('BLOCKED', 10), task('FAILED', 20), task('STALE', 30), task('PARTIAL', 40), task('PROVEN', 50)];
  const census = {
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks,
    evidenceCards: [
      { taskRef: tasks[0].taskRef, proofState: 'CLAIM_ONLY' },
      { taskRef: tasks[1].taskRef, proofState: 'CLAIM_ONLY' },
      { taskRef: tasks[2].taskRef, proofState: 'PROVEN' },
      { taskRef: tasks[3].taskRef, proofState: 'CLAIM_ONLY' },
      { taskRef: tasks[4].taskRef, proofState: 'CLAIM_ONLY' },
    ],
    missingTaskReferences: [{ fromTaskKey: tasks[0].canonicalTaskRef, reference: 'demo prerequisite', status: 'MISSING_TARGET' }],
    dependencies: [],
    evidenceMatches: [
      { canonicalTaskRef: tasks[1].canonicalTaskRef, resolution: 'BOUND', proofEligible: true, verdict: 'FAILED', evidenceId: 'failed-1', workspaceCurrent: true, sourceCurrent: true },
      { canonicalTaskRef: tasks[2].canonicalTaskRef, resolution: 'BOUND', proofEligible: false, verdict: 'PROVEN', evidenceId: 'stale-1', workspaceCurrent: false, sourceCurrent: false },
      { canonicalTaskRef: tasks[3].canonicalTaskRef, resolution: 'BOUND', proofEligible: true, verdict: 'PARTIAL', evidenceId: 'partial-1', workspaceCurrent: true, sourceCurrent: true },
      { canonicalTaskRef: tasks[4].canonicalTaskRef, resolution: 'BOUND', proofEligible: true, verdict: 'PROVEN', evidenceId: 'proven-1', workspaceCurrent: true, sourceCurrent: true },
    ],
  };
  const report = buildOpenSpecTaskEvidenceBindingsV1(census);
  const states = new Map(report.bindings.map((binding) => [binding.taskId, binding.proofState]));

  assert.deepEqual(Object.fromEntries(states), {
    BLOCKED: 'BLOCKED',
    FAILED: 'FAILED',
    STALE: 'STALE',
    PARTIAL: 'PARTIAL',
    PROVEN: 'PARTIAL',
  });
  assert.equal(report.predicates.find((predicate) => predicate.taskId === 'STALE').status, 'CLAIM_ONLY');
  assert.equal(report.predicates.find((predicate) => predicate.taskId === 'PROVEN').status, 'CLAIM_ONLY');
  assert.equal(report.bindings.find((binding) => binding.taskId === 'PROVEN').blockers[0].type, 'TASK_LEVEL_PROOF_NOT_BOUND_TO_PREDICATES');
  assert.equal(report.summary.heuristicPromotionCount, 0);
});

test('promotes only predicates explicitly named by current receipt assertions', () => {
  const taskRow = {
    ...task('SPLIT', 60),
    taskText: 'Capture node formula; bind it to the current source revision',
  };
  const claims = ['Capture node formula', 'bind it to the current source revision'];
  const predicateIds = claims.map((claim, index) => predicateIdForTaskClaim(taskRow.canonicalTaskRef, index, claim));
  const report = buildOpenSpecTaskEvidenceBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [taskRow],
    evidenceCards: [{ taskRef: taskRow.taskRef, proofState: 'PROVEN' }],
    evidenceMatches: [{
      canonicalTaskRef: taskRow.canonicalTaskRef,
      resolution: 'BOUND',
      proofEligible: true,
      verdict: 'PROVEN',
      evidenceId: 'proof-split-1',
      workspaceCurrent: true,
      sourceCurrent: true,
      actualAssertions: [{ claimRef: predicateIds[0], passed: true }],
    }],
    dependencies: [],
    missingTaskReferences: [],
  });

  assert.deepEqual(report.predicates.map((predicate) => predicate.status), ['PROVEN', 'CLAIM_ONLY']);
  assert.equal(report.bindings[0].proofState, 'PARTIAL');
  assert.deepEqual(report.predicates[0].evidenceIds, ['proof-split-1']);
  assert.deepEqual(report.predicates[1].evidenceIds, []);
});

test('blocks contradictory assertions on the same predicate', () => {
  const taskRow = task('CONFLICT', 70);
  const predicateId = predicateIdForTaskClaim(taskRow.canonicalTaskRef, 0, taskRow.taskText);
  const report = buildOpenSpecTaskEvidenceBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [taskRow],
    evidenceMatches: [
      { canonicalTaskRef: taskRow.canonicalTaskRef, resolution: 'BOUND', proofEligible: true, verdict: 'PROVEN', evidenceId: 'pass-1', workspaceCurrent: true, sourceCurrent: true, actualAssertions: [{ claimRef: predicateId, passed: true }] },
      { canonicalTaskRef: taskRow.canonicalTaskRef, resolution: 'BOUND', proofEligible: true, verdict: 'PROVEN', evidenceId: 'fail-1', workspaceCurrent: true, sourceCurrent: true, actualAssertions: [{ claimRef: predicateId, passed: false }] },
    ],
    dependencies: [],
    missingTaskReferences: [],
  });

  assert.equal(report.predicates[0].status, 'BLOCKED');
  assert.equal(report.predicates[0].contradictions[0].type, 'CONFLICTING_PREDICATE_ASSERTIONS');
  assert.equal(report.bindings[0].proofState, 'BLOCKED');
});

test('never inherits PROVEN from a retrieval card without receipt assertions', () => {
  const taskRow = task('CARD-ONLY', 80);
  const report = buildOpenSpecTaskEvidenceBindingsV1({
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    source: { workspaceRevision: 'sha256:workspace' },
    tasks: [taskRow],
    evidenceCards: [{ taskRef: taskRow.taskRef, proofState: 'PROVEN' }],
    evidenceMatches: [],
    dependencies: [],
    missingTaskReferences: [],
  });

  assert.equal(report.predicates[0].status, 'CLAIM_ONLY');
  assert.equal(report.bindings[0].proofState, 'CLAIM_ONLY');
});
