import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChunkCorpusJsonl } from './export-external-doc-chunks-jsonl-v1.mjs';
import { createHash } from 'node:crypto';

function envelope(text, overrides = {}) {
  const checksum = createHash('sha256').update(text, 'utf8').digest('hex');
  return {
    sourceId: 'fixture',
    page: {
      url: 'https://example.test/docs',
      evidenceRevision: 'page-rev-1',
      contentHash: 'document-checksum',
      crawlRevision: 'crawl-rev-1',
      parserRevision: 'parser-rev-1'
    },
    chunks: [{
      chunkId: 'chunk-1',
      evidenceRevision: 'chunk-rev-1',
      chunkChecksum: checksum,
      ordinal: 0,
      startByte: 0,
      endByte: Buffer.byteLength(text, 'utf8'),
      startChar: 0,
      endChar: text.length,
      text,
      ...overrides
    }]
  };
}

test('preserves byte coordinates and emits stable non-authoritative rows', () => {
    const text = 'API: café';
    const first = buildChunkCorpusJsonl([envelope(text)]);
    const second = buildChunkCorpusJsonl([envelope(text)]);
    const row = JSON.parse(first.jsonl.trim());

    assert.equal(first.jsonl, second.jsonl);
    assert.equal(row.canonicalAuthority, false);
    assert.equal(row.startByte, 0);
    assert.equal(row.endByte, Buffer.byteLength(text, 'utf8'));
    assert.equal(row.text, text);
    assert.deepEqual(first.receipt, second.receipt);
    assert.equal(first.receipt.rowCount, 1);
    assert.equal(first.receipt.sourceCount, 1);
    assert.equal(first.receipt.embeddingPerformed, false);
    assert.equal(first.receipt.datastoreWrites, 0);
});

test('rejects chunk checksum and byte-span drift', () => {
  assert.throws(() => buildChunkCorpusJsonl([envelope('text', { chunkChecksum: 'bad' })]), /CHUNK_CHECKSUM_MISMATCH/);
  assert.throws(() => buildChunkCorpusJsonl([envelope('café', { endByte: 4 })]), /CHUNK_BYTE_SPAN_LENGTH_MISMATCH/);
});

test('rejects duplicate chunk identities across envelopes', () => {
  const first = envelope('one');
  const second = envelope('two');
  second.sourceId = 'other';
  assert.throws(() => buildChunkCorpusJsonl([first, second]), /DUPLICATE_CHUNK_ID/);
});
