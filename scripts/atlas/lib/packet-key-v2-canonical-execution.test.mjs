import test from 'node:test';
import assert from 'node:assert/strict';
import { isCanonicalGraphifyExecution } from './packet-key-v2-admission-v1.mjs';

test('requires completed status, canonical authority, and exact workspace revision', () => {
  const workspaceRevision = 'sha256:revision';
  assert.equal(isCanonicalGraphifyExecution({ status: 'COMPLETED', canonical_authority: true, workspace_revision: workspaceRevision }, workspaceRevision), true);
  assert.equal(isCanonicalGraphifyExecution({ status: 'COMPLETED', canonical_authority: false, workspace_revision: workspaceRevision }, workspaceRevision), false);
  assert.equal(isCanonicalGraphifyExecution({ status: 'RUNNING', canonical_authority: true, workspace_revision: workspaceRevision }, workspaceRevision), false);
  assert.equal(isCanonicalGraphifyExecution({ status: 'COMPLETED', canonical_authority: true, workspace_revision: 'sha256:other' }, workspaceRevision), false);
  assert.equal(isCanonicalGraphifyExecution(null, workspaceRevision), false);
});
