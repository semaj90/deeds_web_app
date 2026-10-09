import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskScopedSourceReceiptCandidateV1, verifyPublishedTaskEvidenceAdmissionV1 } from '../prove-task-scoped-source-receipt-v1.mjs';

const sha256 = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-task-receipt-'));
  const tasksPath = 'openspec/change/tasks.md';
  const implementationPath = 'src/feature.ts';
  const testPath = 'src/feature.test.ts';
  const producerPath = 'src/runner.mjs';
  const verifierPath = 'src/verifier.mjs';
  const testOutputPath = '.tmp/test-output.txt';
  fs.mkdirSync(path.join(root, 'openspec/change'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
  const taskBytes = Buffer.from('- [x] TASK-1 Verify feature behavior.\n');
  const implementationBytes = Buffer.from('export const behavior = "works";\n');
  const testBytes = Buffer.from('assert.equal(behavior, "works");\n');
  const producerBytes = Buffer.from('runTest();\n');
  const verifierBytes = Buffer.from('verifyBytes();\n');
  fs.writeFileSync(path.join(root, tasksPath), taskBytes);
  fs.writeFileSync(path.join(root, implementationPath), implementationBytes);
  fs.writeFileSync(path.join(root, testPath), testBytes);
  fs.writeFileSync(path.join(root, producerPath), producerBytes);
  fs.writeFileSync(path.join(root, verifierPath), verifierBytes);
  const testOutputBytes = Buffer.from('tests passed\n');
  fs.writeFileSync(path.join(root, testOutputPath), testOutputBytes);
  const span = (file, bytes, role, text) => ({
    file,
    role,
    startByte: bytes.indexOf(Buffer.from(text)),
    endByte: bytes.indexOf(Buffer.from(text)) + Buffer.byteLength(text),
    sourceRevision: sha256(bytes),
    spanChecksum: sha256(Buffer.from(text)),
    expectedText: text,
  });
  const task = {
    changeId: 'parent-atlas-example',
    taskId: 'TASK-1',
    taskRef: `${tasksPath}#L1`,
    tasksPath,
    taskText: 'TASK-1 Verify feature behavior.',
    taskHash: sha256(Buffer.from('task block')),
    sourceLine: 1,
    canonicalTaskRef: 'openspec-task:openspec://root/parent-atlas-example/TASK-1',
  };
  const proof = {
    schema: 'atlas.task-scoped-behavior-proof.v1',
    changeId: task.changeId,
    taskId: task.taskId,
    taskRef: task.taskRef,
    taskRevision: task.taskHash,
    workspaceRevision: sha256(Buffer.from('workspace')),
    execution: {
      status: 'SUCCEEDED',
      exitCode: 0,
      command: 'node --test feature.test.mjs',
      producerRef: producerPath,
      producerRevision: sha256(producerBytes),
      independentVerifierRef: verifierPath,
      independentVerifierRevision: sha256(verifierBytes),
      completedAt: '2026-10-09T00:00:00.000Z',
      outputRef: testOutputPath,
      outputChecksum: sha256(testOutputBytes),
      proofRef: '.tmp/behavior-proof.json',
    },
    expectedAssertions: [{ id: 'behavior', expected: 'feature returns works' }],
    actualAssertions: [{ id: 'behavior', actual: 'feature returns works', passed: true }],
    sourceEvidence: [
      span(implementationPath, implementationBytes, 'implementation', 'behavior = "works"'),
      span(testPath, testBytes, 'test', 'assert.equal(behavior, "works");'),
    ],
  };
  return { root, task, proof };
}

test('builds a revision-bound scratch receipt from exact implementation and test spans', () => {
  const value = fixture();
  try {
    const receipt = buildTaskScopedSourceReceiptCandidateV1({
      ...value,
      canonicalTaskKey: 'openspec-task-key:fixture',
      workspaceRevision: value.proof.workspaceRevision,
      proofChecksum: sha256(Buffer.from(JSON.stringify(value.proof))),
    });
    assert.equal(receipt.verdict, 'PARTIAL');
    assert.equal(receipt.taskRevision, value.task.taskHash);
    assert.equal(receipt.workspaceRevision, value.proof.workspaceRevision);
    assert.equal(receipt.sourceEvidenceChecks.length, 2);
    assert.equal(receipt.publicationScope, 'SCRATCH_ONLY');
    assert.equal(receipt.canonicalAuthority, false);
    assert.equal(receipt.writesPerformed, false);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('rejects a stale workspace binding before receipt construction', () => {
  const value = fixture();
  try {
    assert.throws(() => buildTaskScopedSourceReceiptCandidateV1({
      ...value,
      canonicalTaskKey: 'openspec-task-key:fixture',
      workspaceRevision: sha256(Buffer.from('different')),
      proofChecksum: sha256(Buffer.from(JSON.stringify(value.proof))),
    }), /BEHAVIOR_PROOF_REVISION_MISMATCH/);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('rejects incorrect exact-span evidence and failed behavioral assertions', () => {
  const value = fixture();
  try {
    const mismatchedSpan = structuredClone(value.proof);
    mismatchedSpan.sourceEvidence[0].expectedText = 'behavior = "other"';
    assert.throws(() => buildTaskScopedSourceReceiptCandidateV1({
      ...value,
      proof: mismatchedSpan,
      canonicalTaskKey: 'openspec-task-key:fixture',
      workspaceRevision: value.proof.workspaceRevision,
      proofChecksum: sha256(Buffer.from(JSON.stringify(mismatchedSpan))),
    }), /SOURCE_EVIDENCE_READBACK_MISMATCH/);

    const failed = structuredClone(value.proof);
    failed.actualAssertions[0].passed = false;
    const receipt = buildTaskScopedSourceReceiptCandidateV1({
      ...value,
      proof: failed,
      canonicalTaskKey: 'openspec-task-key:fixture',
      workspaceRevision: value.proof.workspaceRevision,
      proofChecksum: sha256(Buffer.from(JSON.stringify(failed))),
    });
    assert.equal(receipt.verdict, 'PARTIAL');
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('rejects execution output whose readback checksum differs from the proof', () => {
  const value = fixture();
  try {
    fs.writeFileSync(path.join(value.root, '.tmp/test-output.txt'), 'altered output\n');
    assert.throws(() => buildTaskScopedSourceReceiptCandidateV1({
      ...value,
      canonicalTaskKey: 'openspec-task-key:fixture',
      workspaceRevision: value.proof.workspaceRevision,
      proofChecksum: sha256(Buffer.from(JSON.stringify(value.proof))),
    }), /BEHAVIOR_EXECUTION_OUTPUT_CHECKSUM_MISMATCH/);
  } finally {
    fs.rmSync(value.root, { recursive: true, force: true });
  }
});

test('published admission mode requires the exact task, receipt, and current workspace', () => {
  const task = { taskRef: 'openspec/change/tasks.md#L1' };
  const report = {
    schema: 'atlas.current-task-evidence-card-join-report.v1',
    workspaceRevision: sha256(Buffer.from('workspace')),
    taskEvidenceAdmissions: [{ taskRef: task.taskRef, admitted: true, evidenceRefs: ['receipt:exact'], reasonCodes: [] }],
  };
  const result = verifyPublishedTaskEvidenceAdmissionV1({
    auditReport: report,
    task,
    evidenceId: 'receipt:exact',
    workspaceRevision: report.workspaceRevision,
  });
  assert.equal(result.status, 'TASK_EVIDENCE_ADMITTED');
  assert.equal(result.receiptDiscovered, true);
  const missingReceipt = verifyPublishedTaskEvidenceAdmissionV1({
    auditReport: report,
    task,
    evidenceId: 'receipt:other',
    workspaceRevision: report.workspaceRevision,
  });
  assert.equal(missingReceipt.status, 'PUBLISHED_RECEIPT_NOT_ADMITTED');
  assert.equal(missingReceipt.receiptDiscovered, false);
  assert.throws(() => verifyPublishedTaskEvidenceAdmissionV1({
    auditReport: report,
    task,
    evidenceId: 'receipt:exact',
    workspaceRevision: sha256(Buffer.from('stale-workspace')),
  }), /CURRENT_TASK_ADMISSION_WORKSPACE_REVISION_MISMATCH/);
});
