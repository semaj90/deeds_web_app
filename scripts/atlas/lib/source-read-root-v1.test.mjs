import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveSourceReadRootV1 } from './source-read-root-v1.mjs';

const HEX = 'a'.repeat(64);
const admission = { status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED', authority: true, snapshotRevision: `sha256:${HEX}`, workspaceRevision: 'sha256:' + 'b'.repeat(64) };

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'src-root-'));
  const root = path.join(repoRoot, '.tmp', 'workspace-source-snapshots', HEX);
  fs.mkdirSync(root, { recursive: true });
  return { repoRoot, root };
}

test('defaults to the working tree when the variable is unset', () => {
  const { repoRoot } = fixture();
  const r = resolveSourceReadRootV1({ repoRoot, env: {}, workspaceRevision: admission.workspaceRevision, admission });
  assert.equal(r.mode, 'WORKING_TREE');
  assert.equal(r.root, repoRoot);
});

test('accepts only the admitted materialized snapshot', () => {
  const { repoRoot, root } = fixture();
  const r = resolveSourceReadRootV1({ repoRoot, env: { ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT: root }, workspaceRevision: admission.workspaceRevision, admission });
  assert.equal(r.mode, 'MATERIALIZED_ADMITTED_SNAPSHOT');
  assert.equal(r.root, root);
});

test('fails closed on every mismatch and never falls back to the working tree', () => {
  const { repoRoot, root } = fixture();
  const env = { ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT: root };
  const ws = admission.workspaceRevision;
  assert.throws(() => resolveSourceReadRootV1({ repoRoot, env: { ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT: repoRoot }, workspaceRevision: ws, admission }), /NOT_A_MATERIALIZED_SNAPSHOT/);
  assert.throws(() => resolveSourceReadRootV1({ repoRoot, env: { ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT: path.join(root, 'nested') }, workspaceRevision: ws, admission }), /NOT_A_MATERIALIZED_SNAPSHOT/);
  assert.throws(() => resolveSourceReadRootV1({ repoRoot, env, workspaceRevision: ws, admission: null }), /ADMISSION_INVALID/);
  assert.throws(() => resolveSourceReadRootV1({ repoRoot, env, workspaceRevision: ws, admission: { ...admission, authority: false } }), /ADMISSION_INVALID/);
  assert.throws(() => resolveSourceReadRootV1({ repoRoot, env, workspaceRevision: ws, admission: { ...admission, snapshotRevision: 'sha256:' + 'c'.repeat(64) } }), /REVISION_MISMATCH/);
  assert.throws(() => resolveSourceReadRootV1({ repoRoot, env, workspaceRevision: 'sha256:' + 'd'.repeat(64), admission }), /WORKSPACE_REVISION_MISMATCH/);
  assert.throws(() => resolveSourceReadRootV1({ repoRoot, env, workspaceRevision: '', admission }), /WORKSPACE_REVISION_MISMATCH/);
});

test('rejects an admitted snapshot directory that does not exist', () => {
  const { repoRoot } = fixture();
  const missingHex = 'e'.repeat(64);
  const missingRoot = path.join(repoRoot, '.tmp', 'workspace-source-snapshots', missingHex);
  const missingAdmission = { ...admission, snapshotRevision: `sha256:${missingHex}` };
  assert.throws(() => resolveSourceReadRootV1({ repoRoot, env: { ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT: missingRoot }, workspaceRevision: admission.workspaceRevision, admission: missingAdmission }), /ROOT_MISSING/);
});
