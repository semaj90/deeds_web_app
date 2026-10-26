import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAstSymbolNominationLineageV1 } from './ast-symbol-nomination-lineage-v1.mjs';

const sourceRevision = `sha256:${'a'.repeat(64)}`;
const workspaceRevision = `sha256:${'b'.repeat(64)}`;

test('unbound nominations retain source revision without inventing workspace revision', () => {
  assert.deepEqual(resolveAstSymbolNominationLineageV1({ sourceRevision }), {
    status: 'SOURCE_ONLY_PROPOSAL', sourceRevision, workspaceRevision: null,
  });
});

test('admitted snapshot binding requires exact source and workspace revisions', () => {
  assert.deepEqual(resolveAstSymbolNominationLineageV1({
    sourceRevision,
    workspaceRevision,
    snapshotSource: { sourceRevision },
    bindAdmittedSnapshot: true,
  }), { status: 'SNAPSHOT_BOUND', sourceRevision, workspaceRevision });
});

test('stale candidate source revision cannot be rebound to a newer snapshot', () => {
  assert.deepEqual(resolveAstSymbolNominationLineageV1({
    sourceRevision,
    workspaceRevision,
    snapshotSource: { sourceRevision: `sha256:${'c'.repeat(64)}` },
    bindAdmittedSnapshot: true,
  }), { status: 'SOURCE_REVISION_MISMATCH', sourceRevision, workspaceRevision: null });
});

test('malformed and missing revisions fail closed', () => {
  assert.equal(resolveAstSymbolNominationLineageV1({ sourceRevision: 'rev1' }).status, 'INVALID_SOURCE_REVISION');
  assert.equal(resolveAstSymbolNominationLineageV1({
    sourceRevision,
    bindAdmittedSnapshot: true,
    workspaceRevision: 'workspace-1',
    snapshotSource: { sourceRevision },
  }).status, 'INVALID_WORKSPACE_REVISION');
  assert.equal(resolveAstSymbolNominationLineageV1({
    sourceRevision,
    bindAdmittedSnapshot: true,
    workspaceRevision,
  }).status, 'SNAPSHOT_SOURCE_UNAVAILABLE');
});
