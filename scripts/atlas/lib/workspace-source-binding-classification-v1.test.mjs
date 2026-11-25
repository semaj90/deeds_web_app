import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyWorkspaceSourceBindingV1 } from './workspace-source-binding-classification-v1.mjs';

const workspace = 'sha256:current';
const oldWorkspace = 'sha256:old';
const expected = { sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', contentDigest: 'a'.repeat(64) };
const row = (workspaceRevision, overrides = {}) => ({
  canonical_source_ref: 'src/a.ts',
  workspace_revision: workspaceRevision,
  source_revision: expected.sourceRevision,
  content_digest: expected.contentDigest,
  ...overrides,
});

test('historical bindings do not make one exact current binding ambiguous', () => {
  assert.equal(classifyWorkspaceSourceBindingV1({
    expected,
    workspaceRevision: workspace,
    bindings: [row(oldWorkspace), row(workspace)],
  }), 'REVISION_BOUND');
});

test('multiple rows within the requested workspace revision remain ambiguous', () => {
  assert.equal(classifyWorkspaceSourceBindingV1({
    expected,
    workspaceRevision: workspace,
    bindings: [row(workspace), row(workspace, { source_revision: 'sha256:other' })],
  }), 'AMBIGUOUS');
});

test('bindings only in other workspace revisions are classified as stale', () => {
  assert.equal(classifyWorkspaceSourceBindingV1({
    expected,
    workspaceRevision: workspace,
    bindings: [row(oldWorkspace)],
  }), 'WRONG_WORKSPACE_REVISION');
});

test('content digest and source revision must match the exact current row', () => {
  assert.equal(classifyWorkspaceSourceBindingV1({
    expected,
    workspaceRevision: workspace,
    bindings: [row(workspace, { content_digest: 'b'.repeat(64) })],
  }), 'SOURCE_CONTENT_MISMATCH');
});

test('no binding remains distinct from an old workspace binding', () => {
  assert.equal(classifyWorkspaceSourceBindingV1({ expected, workspaceRevision: workspace, bindings: [] }), 'WORKSPACE_IDENTITY_ONLY');
});
