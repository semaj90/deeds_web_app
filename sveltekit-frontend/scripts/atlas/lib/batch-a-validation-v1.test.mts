import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runBatchAReplayValidationV1 } from '../batch-a-determinism-validator.mjs';
import { checksumBatchASnapshotV1, parseBatchASnapshotV1, validateBatchASnapshotV1, type BatchASnapshotV1 } from './batch-a-validation-v1.mjs';

function fixture(): BatchASnapshotV1 {
  return {
    schema: 'atlas.batch-a.snapshot.v1',
    structuralEvidence: true,
    observedNodeCount: 2,
    inputChecksum: `sha256:${createHash('sha256').update('fixture input').digest('hex')}`,
    nodes: [
      { node_id: 'root', parent_id: null, metadata: { name: 'λ', byteStart: 0, byteEnd: 12 } },
      { node_id: 'child', parent_id: 'root', metadata: { name: 'child' } },
    ],
    edges: [{ parent_tree_node_id: 'root', child_tree_node_id: 'child', edge_kind: 'parent_child' }],
  };
}

function result(snapshot: BatchASnapshotV1, id: string) {
  return validateBatchASnapshotV1(snapshot, structuredClone(snapshot)).find(gate => gate.gate_id === id)!;
}

test('accepts declared node_id endpoints and a reproducible parent graph', () => {
  const snapshot = fixture();
  assert.ok(validateBatchASnapshotV1(snapshot, structuredClone(snapshot)).every(gate => gate.pass));
});

test('does not pass coverage for an empty extraction', () => {
  const snapshot = { ...fixture(), nodes: [], edges: [], observedNodeCount: 0 };
  assert.equal(result(snapshot, 'A1').status, 'NOT_PROVEN');
});

test('requires a native node denominator instead of file counts', () => {
  assert.equal(result({ ...fixture(), observedNodeCount: null }, 'A1').status, 'NOT_PROVEN');
  assert.equal(result({ ...fixture(), structuralEvidence: false }, 'A1').status, 'NOT_PROVEN');
});

test('measures the original 95 percent node coverage threshold', () => {
  const snapshot = fixture();
  snapshot.nodes = Array.from({ length: 19 }, (_, position) => ({ node_id: `node-${position}`, parent_id: null }));
  snapshot.edges = [];
  snapshot.observedNodeCount = 20;
  assert.equal(result(snapshot, 'A1').pass, true);
  snapshot.nodes.pop();
  assert.equal(result(snapshot, 'A1').pass, false);
});

test('rejects an impossible node denominator', () => {
  assert.equal(result({ ...fixture(), observedNodeCount: 1 }, 'A1').pass, false);
});

test('detects duplicates before any output deduplication', () => {
  const snapshot = fixture();
  snapshot.nodes.push(structuredClone(snapshot.nodes[0]));
  snapshot.observedNodeCount = 3;
  assert.equal(result(snapshot, 'A2').pass, false);
  assert.equal(result(snapshot, 'A2').metric, 1);
});

test('rejects rows without an identity', () => {
  const snapshot = fixture();
  snapshot.nodes[1].node_id = null;
  assert.equal(result(snapshot, 'A2').pass, false);
  assert.equal(result(snapshot, 'A5').pass, false);
});

test('requires an actual replay snapshot and input checksum', () => {
  assert.equal(validateBatchASnapshotV1(fixture()).find(gate => gate.gate_id === 'A3')!.status, 'NOT_PROVEN');
  const snapshot = { ...fixture(), inputChecksum: null };
  assert.equal(result(snapshot, 'A3').status, 'NOT_PROVEN');
});

test('replay rejects changed input bytes or rows', () => {
  const snapshot = fixture();
  const replay = structuredClone(snapshot);
  replay.inputChecksum = `sha256:${'f'.repeat(64)}`;
  assert.equal(validateBatchASnapshotV1(snapshot, replay)[2].pass, false);
  replay.inputChecksum = snapshot.inputChecksum;
  replay.nodes[1].metadata = { name: 'changed' };
  assert.equal(validateBatchASnapshotV1(snapshot, replay)[2].pass, false);
});

test('replay canonicalizes row order and object keys without losing metadata', () => {
  const snapshot = fixture();
  const replay = structuredClone(snapshot);
  replay.nodes[0].metadata = { byteEnd: 12, byteStart: 0, name: 'λ' };
  replay.nodes.reverse();
  assert.equal(checksumBatchASnapshotV1(snapshot), checksumBatchASnapshotV1(replay));
  assert.equal(validateBatchASnapshotV1(snapshot, replay)[2].pass, true);
});

test('rejects a cycle in explicit parent edges', () => {
  const snapshot = fixture();
  snapshot.edges.push({ parent_tree_node_id: 'child', child_tree_node_id: 'root', edge_kind: 'parent_child' });
  assert.equal(result(snapshot, 'A4').pass, false);
});

test('rejects parent_id cycles even when explicit edges are absent', () => {
  const snapshot = fixture();
  snapshot.edges = [];
  snapshot.nodes[0].parent_id = 'child';
  assert.equal(result(snapshot, 'A4').pass, false);
});

test('does not misclassify reference cycles as parent cycles', () => {
  const snapshot = fixture();
  snapshot.edges.push({ parent_tree_node_id: 'child', child_tree_node_id: 'root', edge_kind: 'import_call' });
  assert.equal(result(snapshot, 'A4').pass, true);
});

test('rejects dangling edges and dangling parent pointers', () => {
  const snapshot = fixture();
  snapshot.edges[0].child_tree_node_id = 'missing';
  assert.equal(result(snapshot, 'A5').pass, false);
  snapshot.edges = [];
  snapshot.nodes[1].parent_id = 'missing';
  assert.equal(result(snapshot, 'A5').pass, false);
});

test('allows a proven flat single-node tree', () => {
  const snapshot = { ...fixture(), nodes: [fixture().nodes[0]], edges: [], observedNodeCount: 1 };
  assert.ok(validateBatchASnapshotV1(snapshot, structuredClone(snapshot)).every(gate => gate.pass));
});

test('rejects legacy aggregate receipts and non-finite snapshot values', () => {
  assert.throws(() => parseBatchASnapshotV1({ gates: [{ pass: true }] }), /INVALID_BATCH_A_SNAPSHOT/);
  const snapshot = fixture();
  snapshot.nodes[0].metadata = { score: Number.NaN };
  assert.throws(() => checksumBatchASnapshotV1(snapshot), /NON_JSON_BATCH_A_SNAPSHOT/);
});

test('replay CLI validates two local snapshots and rejects a reused file', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'atlas-batch-a-'));
  const firstPath = path.join(directory, 'first.json');
  const secondPath = path.join(directory, 'second.json');
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    writeFileSync(firstPath, JSON.stringify(fixture()));
    writeFileSync(secondPath, JSON.stringify(fixture()));
    assert.equal(runBatchAReplayValidationV1(['--first', firstPath, '--second', secondPath]), 0);
    assert.equal(runBatchAReplayValidationV1(['--first', firstPath, '--second', firstPath]), 2);
    const changed = fixture();
    changed.nodes.pop();
    writeFileSync(secondPath, JSON.stringify(changed));
    assert.equal(runBatchAReplayValidationV1(['--first', firstPath, '--second', secondPath]), 1);
    assert.equal(runBatchAReplayValidationV1([]), 2);
    writeFileSync(secondPath, JSON.stringify({ exit_code: 0, gates: [] }));
    assert.equal(runBatchAReplayValidationV1(['--first', firstPath, '--second', secondPath]), 2);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    unlinkSync(firstPath);
    unlinkSync(secondPath);
    rmdirSync(directory);
  }
});

test('materializer import does not start discovery, output, or database initialization', async () => {
  const originalLog = console.log;
  console.log = () => { throw new Error('MATERIALIZER_IMPORT_SIDE_EFFECT'); };
  try {
    await import(new URL('../batch-a-structural-materializer.mts', import.meta.url).href);
  } finally {
    console.log = originalLog;
  }
});

test('native index-only runs preserve receipts and require separate writer admission', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'atlas-batch-a-cli-'));
  const frontend = path.join(directory, 'frontend');
  mkdirSync(frontend);
  writeFileSync(path.join(directory, 'input.ts'), 'export function example() { return 1; }');
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const child = spawnSync(process.execPath, [
        '--import', import.meta.resolve('tsx'),
        fileURLToPath(new URL('../batch-a-structural-materializer.mts', import.meta.url)),
        '--file=input.ts',
      ], {
        cwd: frontend,
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, DATABASE_URL: 'postgresql://127.0.0.1:1/blocked' },
      });
      assert.ifError(child.error);
      assert.equal(child.status, 0, child.stderr);
      assert.match(child.stdout, /Database writes skipped: INDEX_ONLY_NO_APPLY/);
    }
    const deniedApply = spawnSync(process.execPath, [
      '--import', import.meta.resolve('tsx'),
      fileURLToPath(new URL('../batch-a-structural-materializer.mts', import.meta.url)),
      '--file=input.ts', '--apply',
    ], { cwd: frontend, encoding: 'utf8', timeout: 15000 });
    assert.ifError(deniedApply.error);
    assert.equal(deniedApply.status, 2, deniedApply.stderr);
    assert.match(deniedApply.stdout, /CANONICAL_WRITER_ADMISSION_REQUIRED/);
    const output = path.join(frontend, 'reports', 'batch-a');
    const reports = readdirSync(output).filter(name => name.startsWith('batch-a-structural-audit-'));
    const snapshots = readdirSync(output).filter(name => name.startsWith('batch-a-snapshot-'));
    assert.equal(reports.length, 3);
    assert.equal(snapshots.length, 6);
    for (const name of reports) {
      const report = JSON.parse(readFileSync(path.join(output, name), 'utf8'));
      assert.equal(report.databaseInitialized, false);
      assert.equal(report.writesPerformed, false);
      assert.equal(report.gates.find((gate: { gate_id: string }) => gate.gate_id === 'A1').status, 'PASS');
      assert.equal(report.gates.find((gate: { gate_id: string }) => gate.gate_id === 'A3').status, 'PASS');
    }
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
