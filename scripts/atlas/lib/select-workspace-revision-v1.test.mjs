import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWorkspaceRevisionV1 } from './select-workspace-revision-v1.mjs';

const revisionA = `sha256:${'a'.repeat(64)}`;
const revisionB = `sha256:${'b'.repeat(64)}`;

test('explicitly selects a bound revision from a mixed binding census', () => {
  assert.equal(selectWorkspaceRevisionV1(revisionA, [revisionA, revisionB]), revisionA);
});

test('does not select an unbound revision', () => {
  assert.throws(() => selectWorkspaceRevisionV1(revisionA, [revisionB]), {
    message: 'CANARY_REQUESTED_WORKSPACE_REVISION_NOT_BOUND',
  });
});

test('implicit selection requires exactly one available revision', () => {
  assert.equal(selectWorkspaceRevisionV1(null, [revisionA]), revisionA);
  assert.throws(() => selectWorkspaceRevisionV1(null, [revisionA, revisionB]), {
    message: 'CANARY_CURRENT_WORKSPACE_REVISION_REQUIRED',
  });
});

test('rejects malformed explicit revisions', () => {
  assert.throws(() => selectWorkspaceRevisionV1('latest', [revisionA]), {
    message: 'CANARY_CURRENT_WORKSPACE_REVISION_REQUIRED',
  });
});
