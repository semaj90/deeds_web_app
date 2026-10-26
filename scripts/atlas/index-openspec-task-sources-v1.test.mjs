import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertSnapshotSize, buildSourceRows, canonicalJson } from './index-openspec-task-sources-v1.mjs';
import { computeOpenSpecWorkspaceRevisionV1 } from './audit-openspec-evidence-fabric-v1.mjs';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const digest = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

test('caps each apply snapshot and rejects invalid row counts', () => {
  assertSnapshotSize(10_000);
  assert.throws(() => assertSnapshotSize(10_001), /APPLY_BLOCKED_SOURCE_ROW_CAP/);
  assert.throws(() => assertSnapshotSize(-1), /INVALID_SOURCE_ROW_COUNT/);
  assert.throws(() => assertSnapshotSize(1.5), /INVALID_SOURCE_ROW_COUNT/);
});

function makeCensus(root, taskRef = 'openspec/changes/example/tasks.md#L1') {
  const sourcePath = path.join(root, 'openspec/changes/example/tasks.md');
  const sourceLines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);
  const census = {
    schema: 'atlas.openspec-evidence-portfolio-census.v2',
    workspaceRevision: computeOpenSpecWorkspaceRevisionV1(root),
    checksum: null,
    summary: { uncheckedTasks: 1 },
    tasks: [{
      archived: false,
      declaredChecked: false,
      taskRef,
      sourceLine: 1,
      changeId: 'example',
      taskText: 'Add a deterministic test',
      taskHash: blockHash(taskBlock(sourceLines, 0)),
      taskIdentity: { identityState: 'DERIVED_ID' },
      canonicalTaskRef: 'openspec:example:task-1',
    }],
  };
  const { checksum: _checksum, ...unsigned } = census;
  census.checksum = digest(canonicalJson(unsigned));
  return census;
}

test('indexes an exact unchecked task source line without promoting identity', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-source-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const taskFile = path.join(root, 'openspec/changes/example/tasks.md');
  fs.mkdirSync(path.dirname(taskFile), { recursive: true });
  fs.writeFileSync(taskFile, '- [ ] Add a deterministic test\n', 'utf8');

  const plan = buildSourceRows(makeCensus(root), root);
  assert.equal(plan.invalid.length, 0);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].sourceRef, 'openspec/changes/example/tasks.md#L1');
  assert.equal(plan.rows[0].identityStatus, 'DERIVED_ID');
  assert.equal(plan.rows[0].canonicalTaskKeyCandidate, 'openspec:example:task-1');
  assert.notEqual(plan.snapshotId, plan.workspaceRevision);
  assert.equal(plan.rows[0].snapshotId, plan.snapshotId);
});

test('uses the source-row manifest rather than volatile census metadata as snapshot identity', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-source-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, 'openspec/changes/example/tasks.md');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, '- [ ] Add a deterministic test\n', 'utf8');

  const firstCensus = makeCensus(root);
  const secondCensus = structuredClone(firstCensus);
  secondCensus.generatedAt = '2026-10-19T00:00:00.000Z';
  const { checksum: _checksum, ...unsigned } = secondCensus;
  secondCensus.checksum = digest(canonicalJson(unsigned));

  const first = buildSourceRows(firstCensus, root);
  const second = buildSourceRows(secondCensus, root);

  assert.notEqual(firstCensus.checksum, secondCensus.checksum);
  assert.equal(first.rowManifestChecksum, second.rowManifestChecksum);
  assert.equal(first.snapshotId, second.snapshotId);
});

test('rejects traversal references and modified source lines', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-source-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, 'openspec/changes/example/tasks.md');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, '- [ ] Add a deterministic test\n', 'utf8');
  const plan = buildSourceRows(makeCensus(root, '../outside/tasks.md#L1'), root);
  assert.equal(plan.rows.length, 0);
  assert.ok(plan.invalid[0].issues.includes('SOURCE_REF_INVALID_OR_OUTSIDE_ROOT'));
});

test('rejects a census with a changed checksum', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-source-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, 'openspec/changes/example/tasks.md');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, '- [ ] Add a deterministic test\n', 'utf8');
  const census = makeCensus(root);
  census.tasks[0].taskText = 'tampered';
  assert.throws(() => buildSourceRows(census, root), /CENSUS_CHECKSUM_MISMATCH/);
});

test('rejects a stale workspace snapshot even when the census checksum is valid', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-source-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, 'openspec/changes/example/tasks.md');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, '- [ ] Add a deterministic test\n', 'utf8');
  const census = makeCensus(root);
  fs.appendFileSync(sourcePath, '- [ ] New task after census\n', 'utf8');
  assert.throws(() => buildSourceRows(census, root), /WORKSPACE_SNAPSHOT_STALE/);
});
