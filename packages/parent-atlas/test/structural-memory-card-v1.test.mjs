import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStructuralMemoryCardV1,
  StructuralMemoryCardV1Schema,
} from '../dist/core/structural-memory-card-v1.js';

const input = {
  sourceRef: 'src/search.ts',
  sourceRevision: 'sha256:' + 'a'.repeat(64),
  workspaceRevision: 'sha256:' + 'b'.repeat(64),
  sourceSpan: { startByte: 12, endByte: 42, startLine: 2, endLine: 4 },
  canonicalIdentityRefs: [{ kind: 'symbol_version_id', value: 'symbol-version:search:r1' }],
  relationships: [{ referenceId: 'ref:call-search', kind: 'call', resolutionStatus: 'canonical', targetStableSymbolId: 'symbol:search' }],
  syntaxStatus: 'CLEAN',
  upstreamTreeNodeIds: ['treesitter-node:17'],
  upstreamChunkIds: ['chunker:chunk-5'],
  representationRevision: 'structural-memory-card:v1',
  producerRevision: 'atlas-test:1',
};

test('builds deterministic, revision-qualified noncanonical structural memory evidence', () => {
  const first = buildStructuralMemoryCardV1(input);
  const replay = buildStructuralMemoryCardV1({ ...input, sourceSpan: { ...input.sourceSpan } });
  assert.deepEqual(first, replay);
  assert.match(first.evidenceChecksum, /^[a-f0-9]{64}$/);
  assert.equal(first.canonicalAuthority, false);
  assert.equal(first.writesPerformed, false);
  assert.equal(first.upstreamTreeNodeIds[0], 'treesitter-node:17');
});

test('revision and representation changes alter the evidence checksum', () => {
  const first = buildStructuralMemoryCardV1(input);
  assert.notEqual(buildStructuralMemoryCardV1({ ...input, sourceRevision: 'sha256:' + 'c'.repeat(64) }).evidenceChecksum, first.evidenceChecksum);
  assert.notEqual(buildStructuralMemoryCardV1({ ...input, representationRevision: 'structural-memory-card:v2' }).evidenceChecksum, first.evidenceChecksum);
});

test('rejects reversed spans, absent canonical references, and unresolved canonical relations', () => {
  assert.throws(() => buildStructuralMemoryCardV1({ ...input, sourceSpan: { ...input.sourceSpan, endByte: 1 } }));
  assert.throws(() => buildStructuralMemoryCardV1({ ...input, canonicalIdentityRefs: [] }));
  assert.throws(() => buildStructuralMemoryCardV1({
    ...input,
    relationships: [{ referenceId: 'ref:unresolved', kind: 'call', resolutionStatus: 'canonical' }],
  }));
});

test('rejects any attempt to grant authority or claim writes', () => {
  const card = buildStructuralMemoryCardV1(input);
  assert.throws(() => StructuralMemoryCardV1Schema.parse({ ...card, canonicalAuthority: true }));
  assert.throws(() => StructuralMemoryCardV1Schema.parse({ ...card, writesPerformed: true }));
});
