import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBatchV1,
  buildBatchV1,
  canonicalJson,
  emptyCheckpointV1,
  readChangesPageV1,
} from './couchdb-readonly-checkpoint-reader-v1.mjs';

const results = [
  { id: 'doc-a', changes: [{ rev: '2-aaa' }], seq: '10', deleted: false },
  { id: 'doc-b', changes: [{ rev: '3-bbb' }], seq: '11', deleted: true },
];

test('canonical JSON ignores property order', () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

test('a batch records tombstones and never claims writes', () => {
  const batch = buildBatchV1({ database: 'dag_cache', since: '0', results, lastSeq: '11' });
  assert.equal(batch.recordCount, 2);
  assert.equal(batch.tombstones, 1);
  assert.equal(batch.writesPerformed, false);
  assert.match(batch.captureDigest, /^sha256:[0-9a-f]{64}$/);
});

test('applying a batch advances the checkpoint; replaying it is a no-op', () => {
  const batch = buildBatchV1({ database: 'dag_cache', since: '0', results, lastSeq: '11' });
  const first = applyBatchV1(emptyCheckpointV1('dag_cache'), batch);
  assert.equal(first.status, 'APPLIED');
  assert.equal(first.checkpoint.lastSeq, '11');
  const replay = applyBatchV1(first.checkpoint, batch);
  assert.equal(replay.status, 'REPLAY_NOOP');
  assert.deepEqual(replay.checkpoint, first.checkpoint);
});

test('a tampered record is refused and the checkpoint does not advance', () => {
  const batch = buildBatchV1({ database: 'dag_cache', since: '0', results, lastSeq: '11' });
  const tampered = { ...batch, records: batch.records.map((r) => (r.id === 'doc-a' ? { ...r, rev: '9-zzz' } : r)) };
  const cp = emptyCheckpointV1('dag_cache');
  const out = applyBatchV1(cp, tampered);
  assert.equal(out.status, 'REFUSED');
  assert.equal(out.reason, 'DIGEST_MISMATCH');
  assert.deepEqual(out.checkpoint, cp);
});

test('a batch that does not start at the checkpoint is refused as a sequence gap', () => {
  const batch = buildBatchV1({ database: 'dag_cache', since: '5', results, lastSeq: '11' });
  const out = applyBatchV1(emptyCheckpointV1('dag_cache'), batch);
  assert.equal(out.status, 'REFUSED');
  assert.equal(out.reason, 'SEQUENCE_GAP');
});

test('an interrupted page fetch throws and never produces a batch', async () => {
  const fetchFn = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(
    readChangesPageV1({ fetchFn, baseUrl: 'http://127.0.0.1:5984', database: 'dag_cache', since: '0', limit: 10, authorization: 'Basic x' }),
    /HTTP 503/,
  );
});

test('the reader issues only GET requests with credentials in a header, not in the URL', async () => {
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url, method: init.method, auth: init.headers.Authorization });
    return { ok: true, status: 200, json: async () => ({ results: [], last_seq: '0' }) };
  };
  await readChangesPageV1({ fetchFn, baseUrl: 'http://127.0.0.1:5984', database: 'dag_cache', since: '0', limit: 10, authorization: 'Basic x' });
  assert.equal(seen[0].method, 'GET');
  assert.equal(seen[0].auth, 'Basic x');
  assert.ok(!seen[0].url.includes('@'));
});
