import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { computeHeadTailDigest } from './fast-hierarchical-dedupe-scan-v1.mjs';

function mockFile(context, content, { chunkSize = Infinity, eof = false, changed = false } = {}) {
  const metadata = { size: content.length, dev: 1, ino: 2, mtimeMs: 3, ctimeMs: 4, isFile: () => true };
  let statCalls = 0;
  context.mock.method(fs, 'openSync', () => 123);
  context.mock.method(fs, 'fstatSync', () => ({
    ...metadata,
    mtimeMs: changed && statCalls++ > 0 ? 5 : 3,
  }));
  const read = context.mock.method(fs, 'readSync', (descriptor, buffer, offset, length, position) => {
    if (eof) return 0;
    return content.copy(buffer, offset, position, Math.min(position + length, position + chunkSize));
  });
  const close = context.mock.method(fs, 'closeSync', () => {});
  return { read, close };
}

const digest = (content) => createHash('sha256').update(content).digest('hex').slice(0, 32);

test('fingerprint retries short reads and closes the handle', (context) => {
  const content = Buffer.from('bounded UTF-8 evidence: café');
  const { read, close } = mockFile(context, content, { chunkSize: 3 });
  assert.equal(computeHeadTailDigest('fixture', content.length), digest(content));
  assert.ok(read.mock.callCount() > 1);
  assert.equal(close.mock.callCount(), 1);
});

test('large-file fingerprint reads only the bounded head and tail', (context) => {
  const content = Buffer.alloc(20000, 7);
  const { read } = mockFile(context, content);
  assert.equal(computeHeadTailDigest('fixture', content.length), digest(Buffer.alloc(8192, 7)));
  assert.equal(read.mock.calls.reduce((total, call) => total + call.result, 0), 8192);
});

test('empty-file fingerprint is deterministic without reads', (context) => {
  const { read } = mockFile(context, Buffer.alloc(0));
  assert.equal(computeHeadTailDigest('fixture', 0), digest(Buffer.alloc(0)));
  assert.equal(read.mock.callCount(), 0);
});

test('premature EOF refuses the sample and still closes the handle', (context) => {
  const { close } = mockFile(context, Buffer.from('evidence'), { eof: true });
  assert.throws(() => computeHeadTailDigest('fixture', 8), /SAMPLE_READBACK_INCOMPLETE/);
  assert.equal(close.mock.callCount(), 1);
});

test('stale caller size refuses the sample before reading', (context) => {
  const { read, close } = mockFile(context, Buffer.from('evidence'));
  assert.throws(() => computeHeadTailDigest('fixture', 9), /SAMPLE_FILE_SIZE_MISMATCH/);
  assert.equal(read.mock.callCount(), 0);
  assert.equal(close.mock.callCount(), 1);
});

test('metadata change during sampling refuses the fingerprint', (context) => {
  mockFile(context, Buffer.from('evidence'), { changed: true });
  assert.throws(() => computeHeadTailDigest('fixture', 8), /SAMPLE_FILE_CHANGED_DURING_READ/);
});

test('invalid sizes are rejected before opening a file', () => {
  for (const size of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => computeHeadTailDigest('unused', size), /INVALID_SAMPLE_FILE_SIZE/);
  }
});
