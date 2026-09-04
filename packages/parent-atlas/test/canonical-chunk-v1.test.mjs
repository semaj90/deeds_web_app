import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import {
  adaptStructuralChunkToCanonicalChunkV1,
  canonicalChunkReplayChecksumV1,
  rejectUnprovenStructuredSegmentationV1,
  segmentMarkdownSourceV1,
} from '../dist/core/canonical-chunk-v1.js';

function hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const SOURCE_REV = 'sha256:' + 'a'.repeat(64);
const WORKSPACE_REV = 'sha256:' + 'b'.repeat(64);

function markdownFixture() {
  return Buffer.from('Preamble π\n# Alpha\nBody α\n## Beta\nBody β\n# Gamma\nBody γ\n', 'utf8');
}

test('markdown segmentation uses exact UTF-8 byte spans and heading paths', () => {
  const bytes = markdownFixture();
  const chunks = segmentMarkdownSourceV1({
    namespace: 'OPENSPEC',
    sourceRef: 'repo://openspec/example.md',
    sourceRevision: SOURCE_REV,
    workspaceRevision: WORKSPACE_REV,
    sourceBytes: bytes,
  });

  assert.equal(chunks.length, 4);
  assert.deepEqual(chunks.map((chunk) => chunk.headingPath), [[], ['Alpha'], ['Alpha', 'Beta'], ['Gamma']]);
  for (const chunk of chunks) {
    assert.equal(chunk.textChecksum, `sha256:${hex(bytes.subarray(chunk.startByte, chunk.endByte))}`);
    assert.equal(chunk.identityAuthority, 'SOURCE_GROUNDED_DESCRIPTOR');
  }
  assert.equal(Buffer.from(bytes.subarray(chunks[1].startByte, chunks[1].endByte)).toString('utf8').startsWith('# Alpha\n'), true);
});

test('markdown replay is deterministic for IDs spans checksums provenance and aggregate checksum', () => {
  const bytes = markdownFixture();
  const input = {
    namespace: 'DOCUMENT',
    sourceRef: 'repo://docs/example.md',
    sourceRevision: SOURCE_REV,
    workspaceRevision: WORKSPACE_REV,
    sourceBytes: bytes,
  };
  const first = segmentMarkdownSourceV1(input);
  const second = segmentMarkdownSourceV1(input);
  assert.deepEqual(first, second);
  assert.equal(canonicalChunkReplayChecksumV1(first), canonicalChunkReplayChecksumV1(second));
});

test('structural adapter preserves upstream provenance and exact byte slice checksum', () => {
  const bytes = Buffer.from('const π = 1;\nfunction f() { return π; }\n', 'utf8');
  const start = bytes.indexOf(Buffer.from('function', 'utf8'));
  const end = bytes.length;
  const chunk = {
    upstream_node_id: 'node-1',
    upstream_file_id: 'file-1',
    upstream_symbol_id: 'symbol-1',
    upstream_chunk_id: 'chunk-1',
    source_ref: 'repo://src/example.ts',
    language: 'typescript',
    node_type: 'function_declaration',
    kind: 'function',
    symbol_name: 'f',
    parent_route: [],
    byte_start: start,
    byte_end: end,
    start_line: 1,
    end_line: 1,
    content_hash: hex(bytes.subarray(start, end)),
    calls: [],
    imports: [],
    exports: [],
  };

  const descriptor = adaptStructuralChunkToCanonicalChunkV1({
    chunk,
    sourceBytes: bytes,
    sourceRevision: SOURCE_REV,
    workspaceRevision: WORKSPACE_REV,
    chunkerRevision: 'treesitter-chunker:test:v1',
  });

  assert.equal(descriptor.upstreamChunkId, 'chunk-1');
  assert.equal(descriptor.upstreamNodeId, 'node-1');
  assert.equal(descriptor.upstreamSymbolId, 'symbol-1');
  assert.equal(descriptor.identityAuthority, 'UPSTREAM_STRUCTURAL_PROVENANCE');
  assert.equal(descriptor.textChecksum, `sha256:${hex(bytes.subarray(start, end))}`);
});

test('structural adapter fails closed when producer checksum does not match exact bytes', () => {
  const bytes = Buffer.from('abc', 'utf8');
  assert.throws(() => adaptStructuralChunkToCanonicalChunkV1({
    chunk: {
      upstream_node_id: 'node-1',
      upstream_file_id: 'file-1',
      upstream_chunk_id: 'chunk-1',
      source_ref: 'repo://src/example.ts',
      language: 'typescript',
      node_type: 'identifier',
      kind: 'symbol',
      parent_route: [],
      byte_start: 0,
      byte_end: 3,
      start_line: 0,
      end_line: 0,
      content_hash: '0'.repeat(64),
      calls: [],
      imports: [],
      exports: [],
    },
    sourceBytes: bytes,
    sourceRevision: SOURCE_REV,
    workspaceRevision: WORKSPACE_REV,
    chunkerRevision: 'treesitter-chunker:test:v1',
  }), /STRUCTURAL_CHUNK_TEXT_CHECKSUM_MISMATCH/);
});

test('JSON and YAML structured segmentation remain typed-reject until exact byte support is proven', () => {
  assert.throws(() => rejectUnprovenStructuredSegmentationV1('JSON'), /STRUCTURED_BYTE_SEGMENTATION_UNPROVEN:JSON/);
  assert.throws(() => rejectUnprovenStructuredSegmentationV1('YAML'), /STRUCTURED_BYTE_SEGMENTATION_UNPROVEN:YAML/);
});
