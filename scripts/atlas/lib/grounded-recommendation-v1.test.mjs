import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedRecommendationV1 } from './grounded-recommendation-v1.mjs';

test('recommendation cites only identity- and revision-bound retrieval cards', () => {
  const result = buildGroundedRecommendationV1({
    intent: 'repair',
    domain: 'retrieval',
    cards: [
      { title: 'Source', summary: 'Relevant code', sourceRef: 'scripts/atlas/search.mjs#L3-L8', packetBindings: [{ sourceRevision: 'sha256:abc', sha256: 'abc', packetKey: 'packet:123' }], identityBound: true, retrievalUsable: true, retrievalSources: ['postgres_fts', 'qdrant'] },
      { title: 'Unbound', sourceRef: 'src/guess.ts', identityBound: false, retrievalUsable: true, packetBindings: [{ sourceRevision: 'sha256:def' }] },
      { title: 'Stale metadata', sourceRef: 'src/stale.ts', identityBound: true, retrievalUsable: true, packetBindings: [] },
    ],
  });
  assert.equal(result.retrievalEvidenceCount, 1);
  assert.equal(result.evidence[0].source_ref, 'scripts/atlas/search.mjs#L3-L8');
  assert.deepEqual(result.evidence[0].retrieval_sources, ['postgres_fts', 'qdrant']);
  assert.deepEqual(result.patch_targets, ['scripts/atlas/search.mjs']);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.safe_next_command, 'git diff --check');
});

test('empty or unsafe retrieval results produce no patch target or command', () => {
  const result = buildGroundedRecommendationV1({ cards: [
    { sourceRef: '../secrets.ts', packetBindings: [{ sourceRevision: 'sha256:x' }], identityBound: true, retrievalUsable: true },
  ] });
  assert.equal(result.evidence.length, 1);
  assert.deepEqual(result.patch_targets, []);
  assert.equal(result.safe_next_command, 'git diff --check');
  const empty = buildGroundedRecommendationV1({});
  assert.equal(empty.retrievalEvidenceCount, 0);
  assert.deepEqual(empty.patch_targets, []);
  assert.equal(empty.safe_next_command, null);
});
