import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeRecords } from './verify-lowrank-task-rpc-v1.mjs';

// Build one 64-byte record with the same layout the producer writes:
// u32 morton | u32 ordinal | u16 cluster | 2 reserved | f32 pos[3] | f64 score | f32 feature[8]
function record(ordinal, { reserved = 0, score = 0.25 } = {}) {
  const buf = Buffer.alloc(64);
  buf.writeUInt32LE(7, 0);
  buf.writeUInt32LE(ordinal, 4);
  buf.writeUInt16LE(3, 8);
  buf.writeUInt16LE(reserved, 10);
  buf.writeFloatLE(0.1, 12);
  buf.writeFloatLE(0.2, 16);
  buf.writeFloatLE(0.3, 20);
  buf.writeDoubleLE(score, 24);
  for (let k = 0; k < 8; k++) buf.writeFloatLE(k, 32 + 4 * k);
  return buf;
}

test('decodes well-formed records with exact field values', () => {
  const buf = Buffer.concat([record(0), record(1, { score: 0.75 })]);
  const recs = decodeRecords(buf, 2);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].ordinal, 0);
  assert.equal(recs[1].ordinal, 1);
  assert.equal(recs[1].finalScore, 0.75);
  assert.equal(recs[0].cluster, 3);
  assert.equal(recs[0].feature[7], 7);
});

test('rejects a truncated buffer', () => {
  const buf = Buffer.concat([record(0), record(1)]).subarray(0, 127);
  assert.throws(() => decodeRecords(buf, 2), /RECORD_TRUNCATED_OR_EXTRA/);
});

test('rejects extra trailing bytes', () => {
  const buf = Buffer.concat([record(0), Buffer.alloc(8)]);
  assert.throws(() => decodeRecords(buf, 1), /RECORD_TRUNCATED_OR_EXTRA/);
});

test('rejects an out-of-order ordinal', () => {
  const buf = Buffer.concat([record(0), record(5)]);
  assert.throws(() => decodeRecords(buf, 2), /ORDINAL_MISMATCH_AT_1/);
});

test('rejects nonzero reserved bytes', () => {
  const buf = record(0, { reserved: 1 });
  assert.throws(() => decodeRecords(buf, 1), /RESERVED_NONZERO_AT_0/);
});
