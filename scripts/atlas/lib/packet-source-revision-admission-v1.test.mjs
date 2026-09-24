import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBoundedPacketSourceRevisionV1, resolvePacketSourceRevisionV1 } from './packet-source-revision-admission-v1.mjs';

const scope = { sourceRef: 'src/a.ts', executionId: 'exec-1', workspaceRevision: `sha256:${'a'.repeat(64)}` };
const rev1 = `sha256:${'b'.repeat(64)}`;
const rev2 = `sha256:${'c'.repeat(64)}`;
const row = (overrides = {}) => {
  const codeRevision = overrides.code_source_revision ?? rev1;
  return {
    source_ref: scope.sourceRef,
    execution_id: scope.executionId,
    workspace_revision: scope.workspaceRevision,
    repository_id: 'repo:root',
    code_source_revision: codeRevision,
    binding_source_revision: codeRevision,
    binding_repository_id: 'deeds-web-app',
    content_hash: codeRevision.slice('sha256:'.length),
    binding_checksum: 'f'.repeat(64),
    ...overrides,
  };
};

test('preserves the exact admitted code_source_revision', () => {
  assert.equal(resolvePacketSourceRevisionV1({ ...scope, rows: [row(), row()] }), rev1);
});

test('keeps two source revisions distinct across exact execution scopes', () => {
  assert.equal(resolvePacketSourceRevisionV1({ ...scope, rows: [row()] }), rev1);
  assert.equal(resolvePacketSourceRevisionV1({ ...scope, executionId: 'exec-2', rows: [row({ execution_id: 'exec-2', code_source_revision: rev2, content_hash: 'c'.repeat(64) })] }), rev2);
});

test('rejects multiple revisions for one source in an execution instead of collapsing them', () => {
  assert.throws(() => resolvePacketSourceRevisionV1({ ...scope, rows: [row(), row({ code_source_revision: rev2, content_hash: 'c'.repeat(64) })] }), /PACKET_SOURCE_REVISION_AMBIGUOUS/);
});

test('does not accept content hash as a substitute for source revision', () => {
  assert.throws(() => resolvePacketSourceRevisionV1({ ...scope, rows: [row({ code_source_revision: null })] }), /PACKET_SOURCE_REVISION_INVALID/);
  assert.throws(() => resolvePacketSourceRevisionV1({ ...scope, rows: [row({ content_hash: 'd'.repeat(64) })] }), /PACKET_SOURCE_CONTENT_DIGEST_MISMATCH/);
});

test('rejects missing, sentinel, workspace-mismatched, and cross-execution identity', () => {
  assert.throws(() => resolvePacketSourceRevisionV1({ ...scope, workspaceRevision: 'latest', rows: [row()] }), /PACKET_SOURCE_SCOPE_REQUIRED/);
  assert.throws(() => resolvePacketSourceRevisionV1({ ...scope, rows: [row({ code_source_revision: 'unknown' })] }), /PACKET_SOURCE_REVISION_INVALID/);
  assert.throws(() => resolvePacketSourceRevisionV1({ ...scope, rows: [row({ workspace_revision: `sha256:${'d'.repeat(64)}` })] }), /PACKET_SOURCE_WORKSPACE_MISMATCH/);
  assert.throws(() => resolvePacketSourceRevisionV1({ ...scope, rows: [row({ execution_id: 'exec-other' })] }), /PACKET_SOURCE_EXECUTION_MISMATCH/);
});

test('preserves an exact bounded source-binding revision and rejects workspace or digest substitution', () => {
  const binding = { sourceRef: scope.sourceRef, sourceRevision: rev1, workspaceRevision: scope.workspaceRevision,
    contentDigest: 'b'.repeat(64), bindingChecksum: `sha256:${'e'.repeat(64)}` };
  assert.equal(resolveBoundedPacketSourceRevisionV1({ sourceRef: scope.sourceRef, workspaceRevision: scope.workspaceRevision, rows: [binding, { ...binding }] }), rev1);
  assert.throws(() => resolveBoundedPacketSourceRevisionV1({ sourceRef: scope.sourceRef, workspaceRevision: `sha256:${'d'.repeat(64)}`, rows: [binding] }), /PACKET_SOURCE_WORKSPACE_MISMATCH/);
  assert.throws(() => resolveBoundedPacketSourceRevisionV1({ sourceRef: scope.sourceRef, workspaceRevision: scope.workspaceRevision, rows: [{ ...binding, contentDigest: 'c'.repeat(64) }] }), /PACKET_SOURCE_CONTENT_DIGEST_MISMATCH/);
});
