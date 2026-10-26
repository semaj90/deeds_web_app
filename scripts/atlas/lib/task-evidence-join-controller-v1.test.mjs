import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { indexCurrentTaskEvidenceAdmissionsV1 } from './task-evidence-join-controller-v1.mjs';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function hashCanonical(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function fixture() {
  const taskPath = 'openspec/changes/fixture/tasks.md';
  const sourceRevision = `sha256:${'b'.repeat(64)}`;
  const taskRevision = `sha256:${'a'.repeat(64)}`;
  const workspaceRevision = `sha256:${'c'.repeat(64)}`;
  const task = { taskKey: 'fixture:1', source: taskPath, line: 1, blockHash: taskRevision, state: 'DONE' };
  const workboard = {
    tasks: [task],
    taskInventory: [task],
    sourceFileHashes: { [taskPath]: sourceRevision },
  };
  const sourceEntries = Object.entries(workboard.sourceFileHashes).sort(([left], [right]) => left.localeCompare(right));
  const sourceFileHash = hashCanonical(sourceEntries);
  const admissionBody = {
    schema: 'atlas.task-evidence-admission.v1',
    taskRef: `${taskPath}#L1`,
    taskCardId: 'fixture#task',
    canonicalTaskRef: 'openspec-task:root/fixture/TASK-1',
    taskRevision,
    sourceRevision,
    workspaceRevision,
    admitted: true,
    evidenceRefs: ['receipt:fixture:1'],
    canonicalAuthority: false,
  };
  const admission = { ...admissionBody, checksum: hashCanonical(admissionBody) };
  const reportBody = {
    schema: 'atlas.current-task-evidence-card-join-report.v1',
    workspaceHead: 'fixture-head',
    workspaceRevision,
    taskSourceFileHash: sourceFileHash,
    taskSnapshotChecksum: hashCanonical({ sourceFileHash, tasks: workboard.tasks }),
    taskCount: 1,
    taskEvidenceAdmissions: [admission],
    canonicalAuthority: false,
    writesPerformed: false,
  };
  const evidenceJoin = { ...reportBody, checksum: hashCanonical(reportBody), generatedAt: '2026-10-13T00:00:00Z' };
  return { workboard, evidenceJoin, task };
}

test('admits only exact task, task-file, workspace and receipt-bound matches', () => {
  const { workboard, evidenceJoin, task } = fixture();
  const result = indexCurrentTaskEvidenceAdmissionsV1({ workboard, evidenceJoin, expectedHead: 'fixture-head' });
  assert.equal(result.status, 'TASK_EVIDENCE_JOIN_SNAPSHOT_MATCHED');
  assert.equal(result.admittedTaskCount, 1);
  assert.equal(result.admissionsByTaskKey.get(task.taskKey).evidenceRefs[0], 'receipt:fixture:1');
});

test('rejects stale workspace, changed task snapshot, and invalid report checksum', () => {
  const { workboard, evidenceJoin } = fixture();
  assert.equal(indexCurrentTaskEvidenceAdmissionsV1({ workboard, evidenceJoin, expectedHead: 'other-head' }).status, 'TASK_EVIDENCE_JOIN_STALE');

  const changedWorkboard = { ...workboard, tasks: [{ ...workboard.tasks[0], text: 'changed' }] };
  assert.equal(indexCurrentTaskEvidenceAdmissionsV1({ workboard: changedWorkboard, evidenceJoin, expectedHead: 'fixture-head' }).reason, 'TASK_SNAPSHOT_CHECKSUM_MISMATCH');

  const invalidReport = { ...evidenceJoin, checksum: `sha256:${'0'.repeat(64)}` };
  assert.equal(indexCurrentTaskEvidenceAdmissionsV1({ workboard, evidenceJoin: invalidReport, expectedHead: 'fixture-head' }).status, 'TASK_EVIDENCE_JOIN_INVALID');
});

test('fails closed when an individually valid admission binds another revision', () => {
  const { workboard, evidenceJoin, task } = fixture();
  const admission = { ...evidenceJoin.taskEvidenceAdmissions[0], taskRevision: `sha256:${'d'.repeat(64)}` };
  const { checksum: _oldChecksum, ...admissionBody } = admission;
  const signedAdmission = { ...admissionBody, checksum: hashCanonical(admissionBody) };
  const { checksum: _reportChecksum, generatedAt, ...reportBody } = evidenceJoin;
  reportBody.taskEvidenceAdmissions = [signedAdmission];
  const changedReport = { ...reportBody, checksum: hashCanonical(reportBody), generatedAt };
  const result = indexCurrentTaskEvidenceAdmissionsV1({ workboard, evidenceJoin: changedReport, expectedHead: 'fixture-head' });
  assert.equal(result.status, 'TASK_EVIDENCE_JOIN_SNAPSHOT_MATCHED');
  assert.equal(result.admittedTaskCount, 0);
  assert.equal(result.rejectedTaskCount, 1);
  assert.equal(result.admissionsByTaskKey.get(task.taskKey), null);
});

test('rejects duplicate task keys before indexing evidence admissions', () => {
  const { workboard, evidenceJoin } = fixture();
  workboard.taskInventory = [
    ...workboard.taskInventory,
    { ...workboard.taskInventory[0], line: 2 },
  ];

  const result = indexCurrentTaskEvidenceAdmissionsV1({ workboard, evidenceJoin, expectedHead: 'fixture-head' });
  assert.equal(result.status, 'TASK_EVIDENCE_JOIN_INVALID');
  assert.equal(result.reason, 'DUPLICATE_OR_MISSING_TASK_KEY');
  assert.equal(result.admittedTaskCount, 0);
});

test('rejects multiple task keys claiming one canonical task reference', () => {
  const { workboard, evidenceJoin } = fixture();
  const firstTask = workboard.taskInventory[0];
  const secondTask = { ...firstTask, taskKey: 'fixture:2', line: 2, blockHash: `sha256:${'d'.repeat(64)}` };
  workboard.tasks = [firstTask, secondTask];
  workboard.taskInventory = [firstTask, secondTask];
  const sourceFileHash = hashCanonical(Object.entries(workboard.sourceFileHashes).sort(([left], [right]) => left.localeCompare(right)));
  const { checksum: _firstAdmissionChecksum, ...firstAdmissionBody } = evidenceJoin.taskEvidenceAdmissions[0];
  const secondAdmissionBody = {
    ...firstAdmissionBody,
    taskRef: `${secondTask.source}#L2`,
    taskCardId: 'fixture#task-2',
    taskRevision: secondTask.blockHash,
  };
  const secondAdmission = { ...secondAdmissionBody, checksum: hashCanonical(secondAdmissionBody) };
  const { checksum: _oldChecksum, generatedAt, ...reportBody } = evidenceJoin;
  reportBody.taskEvidenceAdmissions = [...evidenceJoin.taskEvidenceAdmissions, secondAdmission];
  reportBody.taskCount = 2;
  reportBody.taskSnapshotChecksum = hashCanonical({ sourceFileHash, tasks: workboard.tasks });
  const changedReport = { ...reportBody, checksum: hashCanonical(reportBody), generatedAt };

  const result = indexCurrentTaskEvidenceAdmissionsV1({ workboard, evidenceJoin: changedReport, expectedHead: 'fixture-head' });
  assert.equal(result.admittedTaskCount, 0);
  assert.equal(result.rejectedTaskCount, 2);
  assert.equal(result.admissionsByTaskKey.get('fixture:1'), null);
  assert.equal(result.admissionsByTaskKey.get('fixture:2'), null);
});
