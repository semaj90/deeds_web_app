import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyWorkspaceFrameStateV1,
  requireWorkspaceFrameForPurposeV1,
  resolveCurrentWorkspaceFrameV1,
  computeWorkspaceFrameAuthorityV1,
} from './current-workspace-frame-selector-v1.mjs';

// WSR-08a/08c: VALID / CURRENT / ADMITTED are independent; nothing here reads the live workspace.
const SNAP = 'sha256:' + 'a'.repeat(64);
const WS = 'sha256:' + 'b'.repeat(64);
const LIVE = 'sha256:' + 'c'.repeat(64);

const admittedFrame = (over = {}) => ({
  status: 'CURRENT_WORKSPACE_FRAME_SELECTED',
  selectedWorkspaceRevision: WS,
  selectedSnapshotRevision: SNAP,
  selectedSource: 'WORKSPACE_REVISION_TOURNAMENT_ADMISSION_RECEIPT',
  selectedAuthority: true,
  authorityConflict: false,
  blockers: [],
  ...over,
});
const goodValidation = { snapshotRevision: SNAP, status: 'RESEAL_READBACK_PROVEN', totalViolations: 0, sourceCount: 10, exactMatches: 10 };

test('legacy admission (no new fields): admitted, but validity and currentness are UNKNOWN and fail closed', () => {
  const state = classifyWorkspaceFrameStateV1({ frame: admittedFrame() });
  assert.equal(state.admitted, true);
  assert.equal(state.snapshotValid, null);
  assert.equal(state.currentAtEvaluation, null);
  assert.equal(state.admissionMode, null);
  for (const purpose of ['CURRENT_WORKSPACE', 'HISTORICAL_EXACT_SNAPSHOT', 'READ_ONLY_COMPARISON']) {
    assert.equal(requireWorkspaceFrameForPurposeV1(state, purpose).ok, false, purpose);
  }
});

test('prior immutable snapshot: valid + admitted + superseded is usable historically but never as current', () => {
  const state = classifyWorkspaceFrameStateV1({
    frame: admittedFrame(),
    validationReceipt: goodValidation,
    validationReceiptSha256: 'sha256:' + 'd'.repeat(64),
    currentWorkspaceRevision: LIVE,
    admission: { admissionMode: 'PRIOR_IMMUTABLE_SNAPSHOT', manifestSha256: 'sha256:' + 'e'.repeat(64) },
  });
  assert.equal(state.snapshotValid, true);
  assert.equal(state.currentAtEvaluation, false);
  assert.equal(state.supersededByWorkspaceRevision, LIVE);
  assert.equal(state.admissionMode, 'PRIOR_IMMUTABLE_SNAPSHOT');
  assert.equal(requireWorkspaceFrameForPurposeV1(state, 'HISTORICAL_EXACT_SNAPSHOT').ok, true);
  assert.equal(requireWorkspaceFrameForPurposeV1(state, 'READ_ONLY_COMPARISON').ok, true);
  const current = requireWorkspaceFrameForPurposeV1(state, 'CURRENT_WORKSPACE');
  assert.equal(current.ok, false);
  assert.deepEqual(current.blockers, ['FRAME_SUPERSEDED_BY_CURRENT_WORKSPACE']);
});

test('current admitted frame satisfies CURRENT_WORKSPACE only when the live revision equals it', () => {
  const same = classifyWorkspaceFrameStateV1({ frame: admittedFrame(), validationReceipt: goodValidation, currentWorkspaceRevision: WS });
  assert.equal(same.currentAtEvaluation, true);
  assert.equal(requireWorkspaceFrameForPurposeV1(same, 'CURRENT_WORKSPACE').ok, true);
  const unknown = classifyWorkspaceFrameStateV1({ frame: admittedFrame(), validationReceipt: goodValidation });
  assert.deepEqual(requireWorkspaceFrameForPurposeV1(unknown, 'CURRENT_WORKSPACE').blockers, ['CURRENT_NOT_EVALUATED']);
});

test('non-admitted frames (CLI/env/derived) are never admitted, whatever their validity', () => {
  const state = classifyWorkspaceFrameStateV1({
    frame: admittedFrame({ selectedSource: 'CLI_WORKSPACE_REVISION', selectedAuthority: false }),
    validationReceipt: goodValidation,
    currentWorkspaceRevision: WS,
  });
  assert.equal(state.admitted, false);
  assert.deepEqual(requireWorkspaceFrameForPurposeV1(state, 'CURRENT_WORKSPACE').blockers, ['FRAME_NOT_ADMITTED']);
  assert.equal(requireWorkspaceFrameForPurposeV1(state, 'READ_ONLY_COMPARISON').ok, true);
});

test('validity needs a matching, clean readback receipt (wrong snapshot, violations or short readback fail)', () => {
  for (const bad of [
    { ...goodValidation, snapshotRevision: 'sha256:' + 'f'.repeat(64) },
    { ...goodValidation, totalViolations: 1 },
    { ...goodValidation, exactMatches: 9 },
    { ...goodValidation, status: 'RESEAL_READBACK_BLOCKED' },
  ]) {
    assert.equal(classifyWorkspaceFrameStateV1({ frame: admittedFrame(), validationReceipt: bad }).snapshotValid, false);
  }
});

test('existing frame authority contract is unchanged and does not look at currentness', () => {
  const frame = admittedFrame();
  assert.equal(computeWorkspaceFrameAuthorityV1(frame).frameAuthoritative, true);
  assert.equal(typeof resolveCurrentWorkspaceFrameV1, 'function');
  assert.throws(() => requireWorkspaceFrameForPurposeV1({}, 'NOT_A_PURPOSE'), /WORKSPACE_FRAME_PURPOSE_UNKNOWN/);
});
