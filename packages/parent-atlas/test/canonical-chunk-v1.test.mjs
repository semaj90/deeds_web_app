import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaptExistingCanonicalChunkV1,
  computeCanonicalChunkSetChecksumV1,
  computeCanonicalChunkTextChecksumV1,
  verifyCanonicalChunkSpanV1,
} from '../dist/core/canonical-chunk-v1.js';

const SOURCE_REVISION = `sha256:${'a'.repeat(64)}`;
const WORKSPACE_REVISION = `sha256:${'b'.repeat(64)}`;
const sourceBytes = Buffer.from('const café = 1;\nexport function demo() {}\n', 'utf8');
const startByte = Buffer.byteLength('const café = 1;\n', 'utf8');
const endByte = sourceBytes.byteLength;
const textChecksum = computeCanonicalChunkTextChecksumV1(sourceBytes, startByte, endByte);

function fixture(overrides = {}) {
  return adaptExistingCanonicalChunkV1({
    binding: {
      chunkId: 'fullrepo:packages/example.ts:1',
      canonicalSourceRef: 'packages/example.ts',
      sourceRevision: SOURCE_REVISION,
      workspaceRevision: WORKSPACE_REVISION,
      startByte,
      endByte,
      chunkContentHash: textChecksum,
      stableSymbolId: 'symbol:demo',
      symbolVersionId: 'symbol-version:demo:v1',
      treeNodeId: 'tree:demo',
      ...overrides,
    },
    chunkerRevision: 'existing-gis-graphify-owner:v1',
    astPath: ['program', 'export_statement', 'function_declaration'],
  });
}

test('reuses the existing canonical chunk and symbol identity without deriving replacements', () => {
  const chunk = fixture();
  assert.equal(chunk.chunkId, 'fullrepo:packages/example.ts:1');
  assert.equal(chunk.identityAuthority, 'EXISTING_CANONICAL_OWNER');
  assert.equal(chunk.symbolVersionId, 'symbol-version:demo:v1');
  assert.equal(chunk.treeNodeId, 'tree:demo');
  assert.equal(chunk.startByte, startByte);
  assert.equal(chunk.endByte, endByte);
});

test('verifies byte-accurate UTF-8 span checksum rather than JavaScript character offsets', () => {
  const chunk = fixture();
  assert.equal(verifyCanonicalChunkSpanV1(chunk, sourceBytes), true);
  const changed = Buffer.from('const café = 1;\nexport function demo() { return 1; }\n', 'utf8');
  assert.equal(verifyCanonicalChunkSpanV1(chunk, changed), false);
});

test('rejects invalid byte spans', () => {
  assert.throws(() => fixture({ startByte: endByte, endByte: startByte }), /endByte must be greater than startByte/);
  assert.throws(() => computeCanonicalChunkTextChecksumV1(sourceBytes, -1, endByte), /CANONICAL_CHUNK_BYTE_SPAN_INVALID/);
});

test('replay checksum is deterministic regardless of input enumeration order', () => {
  const first = fixture();
  const secondBytes = Buffer.from('# Heading\nBody\n', 'utf8');
  const second = adaptExistingCanonicalChunkV1({
    binding: {
      chunkId: 'existing:docs/example.md:0',
      canonicalSourceRef: 'docs/example.md',
      sourceRevision: `sha256:${'c'.repeat(64)}`,
      workspaceRevision: WORKSPACE_REVISION,
      startByte: 0,
      endByte: secondBytes.byteLength,
      chunkContentHash: computeCanonicalChunkTextChecksumV1(secondBytes, 0, secondBytes.byteLength),
      stableSymbolId: null,
      symbolVersionId: null,
      treeNodeId: null,
    },
    chunkerRevision: 'existing-doc-owner:v1',
    headingPath: ['Heading'],
  });

  assert.equal(
    computeCanonicalChunkSetChecksumV1([first, second]),
    computeCanonicalChunkSetChecksumV1([second, first]),
  );
});

test('tampered content checksum fails exact span verification', () => {
  const chunk = fixture({ chunkContentHash: `sha256:${'d'.repeat(64)}` });
  assert.equal(verifyCanonicalChunkSpanV1(chunk, sourceBytes), false);
});
