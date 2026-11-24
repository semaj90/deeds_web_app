import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveRepoImportTargetV1 } from './repo-import-target-resolver-v1.mjs';

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const WORKSPACE = `sha256:${'a'.repeat(64)}`;

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'atlas-import-resolution-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sourceRef = 'src/consumer.ts';
  const sourcePath = path.join(root, sourceRef);
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  const sourceBytes = Buffer.from("import { value } from './provider';\n", 'utf8');
  writeFileSync(sourcePath, sourceBytes);
  return { root, sourceRef, sourceBytes };
}

test('resolves one in-workspace target and binds both file hashes', (t) => {
  const f = fixture(t);
  const targetBytes = Buffer.from('export const value = 1;\n', 'utf8');
  writeFileSync(path.join(f.root, 'src/provider.ts'), targetBytes);
  const result = resolveRepoImportTargetV1({
    workspaceRoot: f.root,
    sourceRef: f.sourceRef,
    sourceRevision: sha256(f.sourceBytes),
    workspaceRevision: WORKSPACE,
    specifier: './provider',
  });
  assert.equal(result.status, 'UNIQUE_LOCAL_TARGET');
  assert.equal(result.targetRef, 'src/provider.ts');
  assert.equal(result.sourceRevision, sha256(f.sourceBytes));
  assert.equal(result.targetSourceRevision, sha256(targetBytes));
  assert.equal(result.workspaceRevision, WORKSPACE);
  assert.equal(result.canonicalAuthority, false);
});

test('keeps extension-ambiguous imports unresolved', (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.root, 'src/provider.ts'), 'export const value = 1;\n');
  writeFileSync(path.join(f.root, 'src/provider.js'), 'exports.value = 1;\n');
  const result = resolveRepoImportTargetV1({
    workspaceRoot: f.root,
    sourceRef: f.sourceRef,
    sourceRevision: sha256(f.sourceBytes),
    workspaceRevision: WORKSPACE,
    specifier: './provider',
  });
  assert.equal(result.status, 'AMBIGUOUS_REPO_TARGET');
  assert.equal(result.candidateCount, 2);
  assert.equal(result.targetRef, undefined);
});

test('rejects source bytes that do not match the pinned source revision', (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.root, 'src/provider.ts'), 'export const value = 1;\n');
  const result = resolveRepoImportTargetV1({
    workspaceRoot: f.root,
    sourceRef: f.sourceRef,
    sourceRevision: `sha256:${'b'.repeat(64)}`,
    workspaceRevision: WORKSPACE,
    specifier: './provider',
  });
  assert.equal(result.status, 'SOURCE_REVISION_MISMATCH');
});

test('requires a source revision and workspace revision before target resolution', (t) => {
  const f = fixture(t);
  assert.equal(resolveRepoImportTargetV1({
    workspaceRoot: f.root, sourceRef: f.sourceRef, sourceRevision: sha256(f.sourceBytes), specifier: './provider',
  }).status, 'WORKSPACE_REVISION_REQUIRED');
  assert.equal(resolveRepoImportTargetV1({
    workspaceRoot: f.root, sourceRef: f.sourceRef, workspaceRevision: WORKSPACE, specifier: './provider',
  }).status, 'SOURCE_REVISION_REQUIRED');
});

test('reports missing and non-relative imports without inventing a target', (t) => {
  const f = fixture(t);
  const shared = {
    workspaceRoot: f.root,
    sourceRef: f.sourceRef,
    sourceRevision: sha256(f.sourceBytes),
    workspaceRevision: WORKSPACE,
  };
  assert.equal(resolveRepoImportTargetV1({ ...shared, specifier: './absent' }).status, 'REPO_TARGET_NOT_FOUND');
  assert.equal(resolveRepoImportTargetV1({ ...shared, specifier: 'react' }).status, 'NOT_A_RELATIVE_IMPORT');
});
