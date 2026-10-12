import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  compareCurrentChunkingV1,
  inspectChunkSourceAttributionV1,
} from './chunk-source-attribution-diagnostic-v1.mjs';

const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

test('distinguishes byte matches from producer attribution and admission', () => {
  const sourceBytes = Buffer.from('α source chunk\nother bytes', 'utf8');
  const result = inspectChunkSourceAttributionV1({
    sourceRef: 'src/example.ts',
    expectedSourceRevision: digest(sourceBytes),
    sourceBytes,
    rows: [{
      canonicalChunkId: 'fullrepo:src/example.ts:0',
      sourceRevision: digest(sourceBytes),
      content: 'α source chunk',
      contentHash: digest('src/example.ts:0:α source chunk'),
      qdrantId: null,
      metadata: { chunk_source: 'AST_MANIFEST', ast_status: 'PARSED', symbol_name: 'parseAlpha' },
    }],
  });

  assert.equal(result.status, 'SOURCE_CHUNK_BYTES_MATCH_NOT_ADMITTED');
  assert.equal(result.rows[0].exactSourceOccurrenceCount, 1);
  assert.deepEqual(result.rows[0].uniqueSourceByteRange, {
    startChar: 0,
    endChar: 'α source chunk'.length,
    startByte: 0,
    endByte: Buffer.byteLength('α source chunk', 'utf8'),
  });
  assert.equal(result.rows[0].indexerContentHashFormulaMatch, true);
  assert.equal(result.rows[0].chunkSource, 'AST_MANIFEST');
  assert.deepEqual(result.rows[0].metadataKeys, ['ast_status', 'chunk_source', 'symbol_name']);
  assert.equal(result.rows[0].astStatus, 'PARSED');
  assert.equal(result.rows[0].symbolName, 'parseAlpha');
  assert.equal(result.contentProducerAttribution, 'NOT_PROVEN_BY_LINEAGE_PRODUCER_REVISION');
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.evidenceAdmitted, false);
  assert.equal(Object.hasOwn(result.rows[0], 'content'), false);
});

test('keeps transformed or ambiguous stored content unresolved', () => {
  const sourceBytes = Buffer.from('repeat\nrepeat\nsource', 'utf8');
  const result = inspectChunkSourceAttributionV1({
    sourceRef: 'src/example.ts',
    expectedSourceRevision: digest(sourceBytes),
    sourceBytes,
    rows: [
      { canonicalChunkId: 'fullrepo:src/example.ts:0', sourceRevision: digest(sourceBytes), content: 'repeat', contentHash: digest('src/example.ts:0:repeat') },
      { canonicalChunkId: 'fullrepo:src/example.ts:1', sourceRevision: digest(sourceBytes), content: 'transformed', contentHash: digest('src/example.ts:1:transformed') },
    ],
  });

  assert.equal(result.status, 'CHUNK_SOURCE_ATTRIBUTION_INCOMPLETE');
  assert.deepEqual(result.rows.map((row) => row.exactSourceOccurrenceCount), [2, 0]);
  assert.deepEqual(result.rows.map((row) => row.uniqueSourceByteRange), [null, null]);
});

test('blocks stale source bytes before classifying chunks', () => {
  const sourceBytes = Buffer.from('current');
  const result = inspectChunkSourceAttributionV1({
    sourceRef: 'src/example.ts',
    expectedSourceRevision: digest(Buffer.from('stale')),
    sourceBytes,
    rows: [],
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'SOURCE_REVISION_MISMATCH');
});

test('compares stored text with current deterministic chunker without emitting content', () => {
  const sourceText = Array.from({ length: 8 }, (_, index) => `${index}: ${'x'.repeat(42)}`).join('\n\n');
  const expectedFirstChunk = `${sourceText.split('\n\n')[0]}\n\n${sourceText.split('\n\n')[1]}`;
  const result = compareCurrentChunkingV1({
    sourceRef: 'src/example.ts',
    sourceText,
    size: 100,
    overlap: 10,
    strategy: 'LARGE_TEXT',
    rows: [
      { canonicalChunkId: 'fullrepo:src/example.ts:0', content: expectedFirstChunk },
      { canonicalChunkId: 'fullrepo:src/example.ts:1', content: 'different content' },
      { canonicalChunkId: 'fullrepo:src/example.ts:99', content: 'out of range' },
    ],
  });

  assert.equal(result.status, 'CURRENT_CHUNKER_REPRODUCTION_MISMATCH');
  assert.equal(result.generatedChunkCount, 4);
  assert.deepEqual(result.rows.map((row) => row.status), [
    'CURRENT_CHUNKER_TEXT_MATCH',
    'CURRENT_CHUNKER_TEXT_MISMATCH',
    'CURRENT_CHUNKER_TEXT_MISMATCH',
  ]);
  assert.equal(result.producerAttribution, 'NOT_ESTABLISHED_BY_REPRODUCTION');
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.evidenceAdmitted, false);
  assert.equal(Object.hasOwn(result.rows[0], 'content'), false);
});

test('can compare historical code-unit windows without treating a match as provenance', () => {
  const result = compareCurrentChunkingV1({
    sourceRef: 'src/example.txt',
    sourceText: 'abcdefghij',
    size: 4,
    overlap: 1,
    maxChunks: 10,
    strategy: 'LEGACY_SLIDING_WINDOW',
    rows: [
      { canonicalChunkId: 'fullrepo:src/example.txt:0', content: 'abcd' },
      { canonicalChunkId: 'fullrepo:src/example.txt:1', content: 'defg' },
    ],
  });

  assert.equal(result.status, 'CURRENT_CHUNKER_REPRODUCTION_MATCH');
  assert.equal(result.algorithm, 'INDEX_FULL_REPO_LEGACY_SLIDING_WINDOW_V1');
  assert.equal(result.producerAttribution, 'NOT_ESTABLISHED_BY_REPRODUCTION');
  assert.equal(result.canonicalAuthority, false);
});

test('reports replacement-character counts without exposing chunk text', () => {
  const sourceBytes = Buffer.from('current source', 'utf8');
  const replacementText = 'legacy\ufffdchunk';
  const result = inspectChunkSourceAttributionV1({
    sourceRef: 'src/example.ts',
    expectedSourceRevision: digest(sourceBytes),
    sourceBytes,
    rows: [{
      canonicalChunkId: 'fullrepo:src/example.ts:0',
      sourceRevision: digest(sourceBytes),
      content: replacementText,
    }],
  });

  assert.equal(result.rows[0].unicodeReplacementCharacterCount, 1);
  assert.equal(Object.hasOwn(result.rows[0], 'content'), false);
});
