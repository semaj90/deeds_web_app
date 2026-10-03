import assert from 'node:assert/strict';
import test from 'node:test';
import { buildManifest, reassembleLedger, serializeLedger, splitLedger } from './build-workboard-report-manifest-v1.mjs';

function fixture(n = 200) {
  return {
    schema: 'x.v1',
    generatedAt: '2026-10-03T00:00:00.000Z',
    summary: { open: 3 },
    changes: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}` })),
    taskInventory: Array.from({ length: n }, (_, i) => ({ taskKey: `c:${i}`, text: 'x'.repeat(200), n: i })),
    writes: { performed: false }
  };
}
const run = (ledger, opts) => {
  const text = serializeLedger(ledger);
  const split = splitLedger(ledger, opts);
  const manifest = buildManifest(text, ledger, split);
  return { text, split, manifest, contents: new Map(split.shards.map((s) => [s.id, s.content])) };
};

test('round trip reproduces the source bytes and key order', () => {
  const { text, manifest, contents } = run(fixture(), { shardBytes: 4096, sectionBytes: 1024 });
  assert.equal(serializeLedger(reassembleLedger(manifest, contents)), text);
  assert.deepEqual(manifest.keyOrder, Object.keys(fixture()));
});

test('deterministic: same input gives identical manifest', () => {
  const a = run(fixture(), { shardBytes: 4096, sectionBytes: 1024 }).manifest;
  const b = run(fixture(), { shardBytes: 4096, sectionBytes: 1024 }).manifest;
  assert.deepEqual(a, b);
});

test('large row arrays shard by byte cap with no row lost or duplicated', () => {
  const { manifest, contents } = run(fixture(300), { shardBytes: 4096, sectionBytes: 1024 });
  const taskShards = manifest.shards.filter((s) => s.key === 'taskInventory');
  assert.ok(taskShards.length > 1);
  assert.ok(taskShards.every((s) => s.bytes <= 4096));
  assert.equal(taskShards.reduce((n, s) => n + s.rowCount, 0), 300);
  const keys = taskShards.flatMap((s) => contents.get(s.id).split('\n').filter(Boolean).map((l) => JSON.parse(l).taskKey));
  assert.equal(new Set(keys).size, 300);
});

test('tampered shard fails closed', () => {
  const { manifest, contents } = run(fixture(), { shardBytes: 4096, sectionBytes: 1024 });
  const id = manifest.shards[1].id;
  contents.set(id, `${contents.get(id)} `);
  assert.throws(() => reassembleLedger(manifest, contents), /checksum mismatch/);
});

test('missing shard fails closed', () => {
  const { manifest, contents } = run(fixture(), { shardBytes: 4096, sectionBytes: 1024 });
  contents.delete('core');
  assert.throws(() => reassembleLedger(manifest, contents), /missing shard core/);
});

test('manifest is non-authoritative and counts tasks', () => {
  const { manifest } = run(fixture(7), { shardBytes: 4096, sectionBytes: 1024 });
  assert.equal(manifest.canonicalAuthority, false);
  assert.equal(manifest.counts.tasks, 7);
});

test('CRLF sources are recorded and verified against the canonical serialization', () => {
  const ledger = fixture(5);
  const crlf = serializeLedger(ledger).replace(/\n/g, '\r\n');
  const manifest = buildManifest(crlf, ledger, splitLedger(ledger, { shardBytes: 4096, sectionBytes: 1024 }));
  assert.equal(manifest.source.eol, 'CRLF');
  assert.notEqual(manifest.source.sha256, manifest.source.canonicalSha256);
});
