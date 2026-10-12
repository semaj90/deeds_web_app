import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { qualifyChunkLineageRowsV1, qualifyChunkSourceSpanV1, verifyChunkSourceSpanReadbackV1 } from './chunk-source-span-v1.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

test('qualifies exact producer byte offsets after multibyte UTF-8 without admission', () => {
  const source = Buffer.from('π🙂 export function run() {}', 'utf8');
  const content = Buffer.from('export function run() {}', 'utf8');
  const startByte = source.indexOf(content);
  const result = qualifyChunkSourceSpanV1({
    sourceBytes: source,
    chunkContent: content.toString('utf8'),
    sourceRef: 'src/run.ts',
    startByte,
    endByte: startByte + content.length,
  });
  assert.equal(result.status, 'BYTE_MATCH_NOT_ADMITTED');
  assert.equal(result.startByte, startByte);
  assert.equal(result.sourceRevision, digest(source));
  assert.equal(result.sourceSpanDigest, digest(content));
  assert.equal(result.evidenceAdmitted, false);
  assert.equal(result.sourceAuthority, 'NOT_VERIFIED');
});

test('derives only one exact content occurrence', () => {
  const sourceBytes = Buffer.from('prefix unique suffix', 'utf8');
  const result = qualifyChunkSourceSpanV1({ sourceBytes, chunkContent: 'unique', sourceRef: 'a.ts' });
  assert.equal(result.status, 'BYTE_MATCH_NOT_ADMITTED');
  assert.equal(result.method, 'UNIQUE_EXACT_CONTENT_MATCH');
  assert.equal(result.startByte, 7);
});

test('rejects repeated or transformed chunk content', () => {
  const sourceBytes = Buffer.from('same gap same', 'utf8');
  assert.equal(qualifyChunkSourceSpanV1({ sourceBytes, chunkContent: 'same', sourceRef: 'a.ts' }).reason,
    'CHUNK_CONTENT_AMBIGUOUS_IN_SOURCE');
  assert.equal(qualifyChunkSourceSpanV1({ sourceBytes, chunkContent: 'other', sourceRef: 'a.ts' }).reason,
    'CHUNK_CONTENT_NOT_FOUND_IN_SOURCE');
});

test('rejects invalid claims, out-of-range spans, and UTF-8 boundary cuts', () => {
  const sourceBytes = Buffer.from('π value', 'utf8');
  assert.equal(qualifyChunkSourceSpanV1({ sourceBytes, chunkContent: 'value', sourceRef: 'a.ts', startByte: 0 }).reason,
    'CLAIMED_SOURCE_SPAN_INVALID');
  assert.equal(qualifyChunkSourceSpanV1({ sourceBytes, chunkContent: 'value', sourceRef: 'a.ts', startByte: 0, endByte: 1 }).reason,
    'CLAIMED_SOURCE_SPAN_CONTENT_MISMATCH');
  assert.equal(qualifyChunkSourceSpanV1({ sourceBytes, chunkContent: 'π', sourceRef: 'a.ts', startByte: 1, endByte: 3 }).reason,
    'CLAIMED_SOURCE_SPAN_CONTENT_MISMATCH');
  assert.equal(qualifyChunkSourceSpanV1({ sourceBytes: Buffer.from([0xff]), chunkContent: 'x', sourceRef: 'a.ts' }).reason,
    'SOURCE_BYTES_NOT_VALID_UTF8');
});

test('independently verifies descriptor scope, raw bytes, and exact chunk digest', () => {
  const sourceBytes = Buffer.from('first repeated repeated', 'utf8');
  const chunkBytes = Buffer.from('repeated', 'utf8');
  const startByte = sourceBytes.lastIndexOf(chunkBytes);
  const descriptor = qualifyChunkSourceSpanV1({
    sourceBytes, chunkContent: chunkBytes.toString('utf8'), sourceRef: 'src/a.ts',
    startByte, endByte: startByte + chunkBytes.length,
  });
  const input = {
    descriptor, sourceBytes, chunkBytes,
    expectedSourceRef: 'src/a.ts', expectedSourceRevision: digest(sourceBytes),
  };
  assert.equal(verifyChunkSourceSpanReadbackV1(input).verified, true);
  assert.equal(verifyChunkSourceSpanReadbackV1({ ...input, expectedSourceRef: 'src/b.ts' }).reason,
    'SPAN_DESCRIPTOR_SCOPE_INVALID');
  assert.equal(verifyChunkSourceSpanReadbackV1({ ...input, chunkBytes: Buffer.from('altered') }).reason,
    'SPAN_READBACK_CONTENT_MISMATCH');
  assert.equal(verifyChunkSourceSpanReadbackV1({ ...input, descriptor: { ...descriptor, sourceSpanDigest: digest('wrong') } }).reason,
    'SPAN_READBACK_DIGEST_MISMATCH');
});

test('qualifies only unique exact chunk bytes from the expected source revision', () => {
  const sourceBytes = Buffer.from('π\nfunction run() {}\n', 'utf8');
  const sourceRevision = digest(sourceBytes);
  const result = qualifyChunkLineageRowsV1({
    sourceBytes,
    sourceRef: 'src/run.ts',
    sourceRevision,
    chunks: [{ canonicalChunkId: 'chunk:run', content: 'function run() {}', contentVariantCount: 1 }],
  });
  assert.equal(result.status, 'SOURCE_CHUNKS_QUALIFIED_NOT_ADMITTED');
  assert.equal(result.qualifiedChunks[0].sourceRevision, sourceRevision);
  assert.equal(result.qualifiedChunks[0].canonicalAuthority, false);
  assert.equal(result.evidenceAdmitted, false);
});

test('blocks stale source, stale chunk bytes, duplicate identities, and ambiguous stored content', () => {
  const sourceBytes = Buffer.from('function current() {}\n');
  const sourceRevision = digest(sourceBytes);
  const result = qualifyChunkLineageRowsV1({
    sourceBytes,
    sourceRef: 'src/run.ts',
    sourceRevision,
    chunks: [
      { canonicalChunkId: 'chunk:stale', content: 'function historical() {}', contentVariantCount: 1 },
      { canonicalChunkId: 'chunk:ambiguous', content: 'function current() {}', contentVariantCount: 2 },
      { canonicalChunkId: 'chunk:dup', content: 'function current() {}', contentVariantCount: 1 },
      { canonicalChunkId: 'chunk:dup', content: 'function current() {}', contentVariantCount: 1 },
    ],
  });
  assert.equal(result.status, 'PARTIAL_SOURCE_CHUNK_QUALIFICATION_NOT_ADMITTED');
  assert.equal(result.qualifiedChunks.length, 0);
  assert.deepEqual(result.blockedChunks.map((chunk) => chunk.reason), [
    'CHUNK_CONTENT_NOT_FOUND_IN_SOURCE',
    'CHUNK_CONTENT_AMBIGUOUS',
    'CHUNK_ID_MISSING_OR_DUPLICATE',
  ]);
  assert.equal(qualifyChunkLineageRowsV1({
    sourceBytes,
    sourceRef: 'src/run.ts',
    sourceRevision: digest(Buffer.from('other')),
    chunks: [],
  }).reason, 'CHUNK_LINEAGE_SOURCE_REVISION_MISMATCH');
});
