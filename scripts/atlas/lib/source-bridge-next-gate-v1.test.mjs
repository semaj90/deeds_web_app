import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveSourceBridgeNextGateV1, listSourceBridgeBlockingGatesV1 } from './source-bridge-next-gate-v1.mjs';

const matchedFailedAttempt = {
  executionFound: true,
  executionRevisionMatchesAdmission: true,
  executionCompleted: false,
  sourceSelectionCompleted: true,
  selectedManifestMatchesAdmission: true,
  membershipUsesCurrentRevision: true,
  manifestMembershipCountMatches: true,
  exactCurrentSourceBridge: true,
  workspaceBindingsCoverSelectedRoot: false,
  bindingRowsAreCurrent: false,
};

test('reports source-binding coverage as the next gate when execution membership is exact', () => {
  assert.equal(deriveSourceBridgeNextGateV1(matchedFailedAttempt), 'WORKSPACE_SOURCE_BINDING_RECONCILIATION_REQUIRED');
  assert.deepEqual(listSourceBridgeBlockingGatesV1(matchedFailedAttempt), [
    'WORKSPACE_SOURCE_BINDING_RECONCILIATION_REQUIRED',
    'COMPLETED_EXECUTION_REQUIRED',
  ]);
});

test('reports execution membership before later binding gates when membership mismatches', () => {
  const checks = { ...matchedFailedAttempt, exactCurrentSourceBridge: false };
  assert.equal(deriveSourceBridgeNextGateV1(checks), 'EXECUTION_MEMBERSHIP_RECONCILIATION_REQUIRED');
});

test('reports the independent readback gate only after all bridge predicates pass', () => {
  const checks = {
    ...matchedFailedAttempt,
    executionCompleted: true,
    workspaceBindingsCoverSelectedRoot: true,
    bindingRowsAreCurrent: true,
  };
  assert.equal(deriveSourceBridgeNextGateV1(checks), 'INDEPENDENT_SOURCE_BINDING_READBACK_AND_PACKET_MATERIALIZATION_AUDIT');
  assert.deepEqual(listSourceBridgeBlockingGatesV1(checks), []);
});
