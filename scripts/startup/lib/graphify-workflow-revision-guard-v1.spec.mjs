import assert from 'node:assert/strict';
import test from 'node:test';
import { assertGraphifyWorkflowRevisionMatchesAdmissionV1 } from './graphify-workflow-revision-guard-v1.mjs';

const admittedRevision = `sha256:${'a'.repeat(64)}`;

test('accepts a workflow receipt bound to the admitted workspace revision', () => {
  assert.equal(assertGraphifyWorkflowRevisionMatchesAdmissionV1({
    sourceBindingObservation: { workspaceRevision: admittedRevision },
  }, admittedRevision), true);
});

test('refuses a missing source-binding revision', () => {
  assert.throws(
    () => assertGraphifyWorkflowRevisionMatchesAdmissionV1({}, admittedRevision),
    { message: 'GRAPHIFY_SOURCE_BINDING_WORKSPACE_REVISION_MISSING' },
  );
});

test('refuses a workflow receipt from a different workspace revision', () => {
  assert.throws(
    () => assertGraphifyWorkflowRevisionMatchesAdmissionV1({
      sourceBindingObservation: { workspaceRevision: `sha256:${'b'.repeat(64)}` },
    }, admittedRevision),
    { message: 'GRAPHIFY_SOURCE_BINDING_WORKSPACE_REVISION_MISMATCH' },
  );
});

test('refuses a missing admitted workspace revision', () => {
  assert.throws(
    () => assertGraphifyWorkflowRevisionMatchesAdmissionV1({
      sourceBindingObservation: { workspaceRevision: admittedRevision },
    }, null),
    { message: 'GRAPHIFY_ADMITTED_WORKSPACE_REVISION_MISSING' },
  );
});
