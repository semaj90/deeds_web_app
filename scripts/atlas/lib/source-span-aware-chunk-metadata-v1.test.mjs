import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachUniqueSourceSpanV1,
  chunkTextAtUtf8BoundariesV1,
} from './source-span-aware-chunk-metadata-v1.mjs';

test('attaches exact UTF-8 offsets for a unique multibyte chunk', () => {
  const source = '前置き\r\nexport function café() { return "雪"; }\r\n末尾';
  const chunk = { text: 'export function café() { return "雪"; }' };
  const result = attachUniqueSourceSpanV1(source, chunk);
  const bytes = Buffer.from(source, 'utf8');

  assert.equal(bytes.subarray(result.sourceByteStart, result.sourceByteEnd).toString('utf8'), chunk.text);
  assert.equal(result.start, source.indexOf(chunk.text));
  assert.equal(result.end, result.start + chunk.text.length);
});

test('does not invent byte offsets for duplicate chunk text', () => {
  const chunk = { text: 'duplicate content', start: 0, end: 17, sourceByteStart: 0, sourceByteEnd: 17 };
  const result = attachUniqueSourceSpanV1('duplicate content\n\nduplicate content', chunk);

  assert.equal(result.start, undefined);
  assert.equal(result.end, undefined);
  assert.equal(result.sourceByteStart, undefined);
  assert.equal(result.sourceByteEnd, undefined);
});

test('does not retain fabricated offsets when chunk text is absent', () => {
  const result = attachUniqueSourceSpanV1('source bytes', {
    text: 'normalized chunk', start: 0, end: 16, sourceByteStart: 0, sourceByteEnd: 16,
  });

  assert.equal(result.start, undefined);
  assert.equal(result.sourceByteStart, undefined);
});

test('keeps surrogate pairs intact and emits exact UTF-8 byte ranges', () => {
  const source = 'abc😀def🧠ghi';
  const chunks = chunkTextAtUtf8BoundariesV1(source, 4, 1);
  const bytes = Buffer.from(source, 'utf8');

  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    const chunkBytes = Buffer.from(chunk.text, 'utf8');
    assert.equal(bytes.subarray(chunk.sourceByteStart, chunk.sourceByteEnd).toString('utf8'), chunk.text);
    assert.equal(chunkBytes.toString('utf8'), chunk.text);
  }
  for (let index = 1; index < chunks.length; index += 1) {
    assert.ok(chunks[index].start <= chunks[index - 1].end);
    assert.ok(chunks[index].start > chunks[index - 1].start);
  }
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks.at(-1).end, source.length);
});

test('keeps a complete code point when it exceeds the requested window width', () => {
  const chunks = chunkTextAtUtf8BoundariesV1('😀x', 1, 0);

  assert.deepEqual(chunks.map((chunk) => chunk.text), ['😀', 'x']);
});

test('advances without gaps across varied sizes and overlaps around multibyte text', () => {
  const source = 'a😀雪🧠é\r\nend';
  const bytes = Buffer.from(source, 'utf8');

  for (let size = 1; size <= 8; size += 1) {
    for (let overlap = 0; overlap < size; overlap += 1) {
      const chunks = chunkTextAtUtf8BoundariesV1(source, size, overlap);
      let coveredThrough = 0;
      for (const chunk of chunks) {
        assert.ok(chunk.start <= coveredThrough, `gap at size=${size}, overlap=${overlap}`);
        assert.ok(chunk.start >= 0 && chunk.end <= source.length);
        assert.equal(bytes.subarray(chunk.sourceByteStart, chunk.sourceByteEnd).toString('utf8'), chunk.text);
        assert.ok(chunk.start >= coveredThrough - overlap - 1);
        coveredThrough = Math.max(coveredThrough, chunk.end);
      }
      assert.equal(coveredThrough, source.length, `incomplete coverage at size=${size}, overlap=${overlap}`);
    }
  }
});

test('rejects malformed UTF-16 and invalid window settings', () => {
  assert.throws(() => chunkTextAtUtf8BoundariesV1('\ud83d', 4, 1), /SOURCE_OR_WINDOW_CONFIGURATION_INVALID/);
  assert.throws(() => chunkTextAtUtf8BoundariesV1('valid', 4, 4), /SOURCE_OR_WINDOW_CONFIGURATION_INVALID/);
});
