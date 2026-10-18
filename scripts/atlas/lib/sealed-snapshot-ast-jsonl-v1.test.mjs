import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveContainedSnapshotFile, stageSealedSnapshotSourceV1, validateSealedSnapshotInventoryPlanV1 } from './sealed-snapshot-ast-jsonl-v1.mjs';

const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

test('validates the sealed plan scope and revision binding', () => {
  const plan = { schema: 'atlas.graphify-sealed-snapshot-inventory-plan.v1', sourceScope: 'repo:root', workspaceRevision: `sha256:${'1'.repeat(64)}`, snapshotRevision: `sha256:${'2'.repeat(64)}`, rows: [{ workspaceRevision: `sha256:${'1'.repeat(64)}` }], rowCount: 1, scopeSourceCount: 1, selectedSourceCount: 1 };
  assert.equal(validateSealedSnapshotInventoryPlanV1(plan), plan);
  assert.throws(() => validateSealedSnapshotInventoryPlanV1({ ...plan, rows: [] }), /STAGING_PLAN_CONTRACT_INVALID/);
});

test('extracts AST spans from exact UTF-8 bytes with source and workspace revisions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-stage-ast-'));
  try {
    const bytes = Buffer.from('const π = 1;\nexport function answer() { return π; }\n', 'utf8');
    fs.writeFileSync(path.join(root, 'sample.ts'), bytes);
    const sha = digest(bytes);
    const revision = `sha256:${'1'.repeat(64)}`;
    const plan = { snapshotRevision: `sha256:${'2'.repeat(64)}` };
    const row = { sourceRef: 'sample.ts', workspaceRevision: revision, codeSourceRevision: `sha256:${sha}`, contentHash: sha, byteLength: bytes.length };
    const result = stageSealedSnapshotSourceV1({ row, snapshotRoot: root, plan });
    assert.equal(result.status, 'PARSED');
    assert.equal(result.sourceRevision, row.codeSourceRevision);
    assert.equal(result.workspaceRevision, revision);
    assert.ok(result.observations.some((observation) => observation.name === 'answer' && observation.endByte > observation.startByte));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects traversal and changed source bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-stage-ast-'));
  try {
    assert.throws(() => resolveContainedSnapshotFile(root, '../escape.ts'), /STAGING_SOURCE_REF_INVALID/);
    fs.writeFileSync(path.join(root, 'changed.ts'), 'export const x = 1;');
    const row = { sourceRef: 'changed.ts', workspaceRevision: `sha256:${'1'.repeat(64)}`, sourceRevision: `sha256:${'2'.repeat(64)}`, contentHash: '0'.repeat(64), byteLength: 17 };
    const result = stageSealedSnapshotSourceV1({ row, snapshotRoot: root, plan: { snapshotRevision: `sha256:${'3'.repeat(64)}` } });
    assert.equal(result.status, 'SOURCE_BYTES_MISMATCH');
  } catch (error) {
    if (process.platform === 'win32' && error?.code === 'EPERM') t.skip('Symlink creation is unavailable for this account.');
    else throw error;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects symlink escapes when the host permits symlink creation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-stage-ast-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-stage-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'escape.ts'), 'export const x = 1;');
    try {
      fs.symlinkSync(path.join(outside, 'escape.ts'), path.join(root, 'escape.ts'));
    } catch (error) {
      if (process.platform === 'win32' && error?.code === 'EPERM') return t.skip('Symlink creation is unavailable for this account.');
      throw error;
    }
    assert.throws(() => resolveContainedSnapshotFile(root, 'escape.ts'), /STAGING_SYMLINK_OUTSIDE_SNAPSHOT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
