import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { streamJsonlBatchesV1 } from './stream-jsonl-batches-v1.mjs';

async function collect(chunks, options) {
  const batches = [];
  for await (const batch of streamJsonlBatchesV1(Readable.from(chunks), options)) batches.push(batch);
  return batches;
}

test('streams CRLF JSONL into bounded batches and preserves UTF-8 across chunk boundaries', async () => {
  const bytes = Buffer.from('{"name":"café"}\r\n{"id":2}\n{"id":3}', 'utf8');
  const batches = await collect([bytes.subarray(0, 11), bytes.subarray(11, 15), bytes.subarray(15)], { batchRecords: 2 });
  assert.equal(batches.length, 2);
  assert.deepEqual(batches.map(batch => batch.records), [[{ name: 'café' }, { id: 2 }], [{ id: 3 }]]);
  assert.deepEqual(batches.map(batch => batch.recordCount), [2, 1]);
  assert.deepEqual(batches.map(batch => batch.batchIndex), [0, 1]);
  assert.match(batches[0].checksum, /^sha256:[0-9a-f]{64}$/);
});

test('rejects oversized records, malformed JSON, non-object rows and invalid UTF-8', async () => {
  await assert.rejects(() => collect(['{"long":"123456"}\n'], { maxLineBytes: 8 }), /JSONL_LINE_TOO_LARGE/);
  await assert.rejects(() => collect(['{"a":}\n']), /JSONL_INVALID_JSON:1/);
  await assert.rejects(() => collect(['[1,2]\n']), /JSONL_RECORD_MUST_BE_OBJECT:1/);
  await assert.rejects(() => collect([Buffer.from([0xff, 10])]), /JSONL_INVALID_UTF8:1/);
});

test('enforces implementation hard bounds and skips blank lines without hiding malformed rows', async () => {
  await assert.rejects(() => collect(['{}\n'], { batchRecords: 2_001 }), /JSONL_BATCH_RECORDS_INVALID/);
  const batches = await collect(['\r\n{}\n\n'], { batchRecords: 1 });
  assert.equal(batches.length, 1);
  assert.equal(batches[0].firstLine, 2);
  assert.equal(batches[0].lastLine, 2);
});
