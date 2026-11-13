import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDiagnosticResolutionOnBoardV1 } from './svelte-check-diagnostic-resolution-v1.mjs';

const fingerprintA = `sha256:${'a'.repeat(64)}`;
const fingerprintB = `sha256:${'b'.repeat(64)}`;
const receiptSha256 = `sha256:${'c'.repeat(64)}`;
const scopeId = `sha256:${'d'.repeat(64)}`;

function makeReceipt(fingerprints = [fingerprintA]) {
  return {
    schema: 'atlas.svelte-check-diagnostic-resolution.v1',
    status: 'CLEAN_RUN_RESOLUTION_CANDIDATES',
    previousRunId: 'prior-run',
    currentRunId: 'clean-run',
    checkerScopeId: scopeId,
    resolvedCount: fingerprints.length,
    resolvedDiagnosticFingerprints: fingerprints,
    resolvedDiagnostics: fingerprints.map((fingerprint, index) => ({ taskId: `diag-${index}`, fingerprint })),
    artifacts: { previous: {}, current: {} },
    writesPerformed: false,
    boardWritesPerformed: false,
    databaseWritesPerformed: false,
    completionAuthorized: false,
  };
}

test('projects exact matching diagnostic as absent while preserving board and OpenSpec statuses', () => {
  const board = { tasks: [
    { id: 'card-a', origin: 'agentic_error_fixing_v1', diagnostic_fingerprint: fingerprintA, status: 'PROPOSED', openspec_task_ref: 'WFU-99' },
    { id: 'card-b', origin: 'agentic_error_fixing_v1', diagnostic_fingerprint: fingerprintB, status: 'IN_PROGRESS' },
    { id: 'other', origin: 'other', diagnostic_fingerprint: fingerprintA, status: 'todo' },
  ] };
  const result = projectDiagnosticResolutionOnBoardV1({
    board, receipt: makeReceipt(), receiptSha256, artifactReadbackVerified: true,
  });
  assert.equal(result.matchedCount, 1);
  assert.deepEqual(result.unmatchedFingerprints, []);
  assert.equal(result.board.tasks[0].diagnostic_resolution.status, 'ABSENT_IN_CLEAN_CHECK');
  assert.equal(result.board.tasks[0].diagnostic_resolution_task_id, 'diag-0');
  assert.equal(result.board.tasks[0].status, 'PROPOSED');
  assert.equal(result.board.tasks[0].openspec_task_ref, 'WFU-99');
  assert.equal(result.board.tasks[1], board.tasks[1]);
  assert.equal(result.board.tasks[2], board.tasks[2]);
  assert.equal(result.boardTaskStatusesChanged, false);
  assert.equal(result.canonicalTaskStatusesChanged, false);
  assert.equal(result.completionAuthorized, false);
});

test('requires artifact readback and exact fingerprint set agreement', () => {
  assert.throws(() => projectDiagnosticResolutionOnBoardV1({
    board: { tasks: [] }, receipt: makeReceipt(), receiptSha256, artifactReadbackVerified: false,
  }), /ARTIFACTS_NOT_VERIFIED/);
  const receipt = makeReceipt();
  receipt.resolvedDiagnosticFingerprints = [fingerprintB];
  assert.throws(() => projectDiagnosticResolutionOnBoardV1({
    board: { tasks: [] }, receipt, receiptSha256, artifactReadbackVerified: true,
  }), /FINGERPRINT_SET_MISMATCH/);
});

test('rejects ambiguous duplicate board cards for one diagnostic fingerprint', () => {
  const task = { origin: 'agentic_error_fixing_v1', diagnostic_fingerprint: fingerprintA, status: 'PROPOSED' };
  assert.throws(() => projectDiagnosticResolutionOnBoardV1({
    board: { tasks: [task, { ...task }] }, receipt: makeReceipt(), receiptSha256, artifactReadbackVerified: true,
  }), /BOARD_FINGERPRINT_AMBIGUOUS/);
});
