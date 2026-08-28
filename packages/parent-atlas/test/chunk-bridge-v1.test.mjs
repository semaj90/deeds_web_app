import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChunkBridge, summarizeChunkBridge, ChunkBridgeClassification as C } from '../../../scripts/atlas/lib/chunk-bridge-v1.mjs';

const packet = { source_ref: 'src/a.ts', content_hash: 'abc', workspace_revision: 'sha256:w', source_revision: 'sha256:s' };
const chunk = { id: 'chunk-1', source_ref: 'src/a.ts', content_hash: 'abc', representation_revision: 'semantic_768:v1' };

test('accepts one exact source and content binding with revisions', () => {
  assert.equal(classifyChunkBridge({ packet, chunks: [chunk] }).classification, C.EXACT_CHUNK_IDENTITY);
});

test('rejects source-only ambiguity', () => {
  assert.equal(classifyChunkBridge({ packet, chunks: [{ ...chunk, content_hash: 'other' }] }).classification, C.SOURCE_ONLY_AMBIGUOUS);
});

test('rejects missing revision evidence', () => {
  assert.equal(classifyChunkBridge({ packet: { ...packet, workspace_revision: null }, chunks: [chunk] }).classification, C.REVISION_UNPROVEN);
});

test('summarizes only exact eligible rows as promotable', () => {
  const summary = summarizeChunkBridge([
    { classification: C.EXACT_CHUNK_IDENTITY },
    { classification: C.SOURCE_ONLY_AMBIGUOUS },
  ]);
  assert.equal(summary.eligibleExactChunkIdentity, 1);
  assert.equal(summary.promotionEligible, true);
});
