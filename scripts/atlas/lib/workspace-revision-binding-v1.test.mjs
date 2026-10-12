import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceRevisionBindingStatusV1 } from './workspace-revision-binding-v1.mjs';

const current = `sha256:${'a'.repeat(64)}`;

test('accepts only the exact current workspace revision', () => {
  assert.equal(workspaceRevisionBindingStatusV1(current, current), 'MATCH');
  assert.equal(workspaceRevisionBindingStatusV1(`sha256:${'b'.repeat(64)}`, current), 'MISMATCH');
});

test('rejects absent or malformed workspace revisions', () => {
  assert.equal(workspaceRevisionBindingStatusV1(null, current), 'INVALID');
  assert.equal(workspaceRevisionBindingStatusV1(current, 'workspace:latest'), 'INVALID');
});
