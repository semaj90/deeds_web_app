import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAtlasRerankerPairs } from './compile-atlas-reranker-pairs.mjs';

const candidate = (overrides = {}) => ({
  candidateOrdinal: 1,
  packetKey: 'packet:1',
  sourceRef: 'src/example.ts',
  sourceRevision: 'rev-1',
  candidateSnapshotRevision: 'rev-1',
  featureRevision: 'features-1',
  candidateText: 'function example() {}',
  retrievalRank: 1,
  evidenceKinds: ['SOURCE'],
  ...overrides
});

test('compiles revisioned pairs and removes outcome labels from candidate features', () => {
  const result = compileAtlasRerankerPairs([{
    queryId: 'query-1',
    queryRevision: 'query-rev-1',
    workspaceRevision: 'workspace-1',
    candidateSnapshotRevision: 'rev-1',
    queryText: 'where is example?',
    candidates: [candidate({ candidateSnapshotRevision: undefined, repairSuccess: true, exactPromotionOutcome: true })]
  }]);
  assert.equal(result.pairs.length, 1);
  assert.equal(result.pairs[0].candidate.repairSuccess, undefined);
  assert.equal(result.pairs[0].repairSuccess, true);
  assert.ok(['train', 'validation', 'test'].includes(result.pairs[0].split));
});

test('rejects stale, invalid, and synthesis-only candidates without failing the batch', () => {
  const result = compileAtlasRerankerPairs([{
    queryId: 'query-1', queryRevision: 'query-rev-1', queryText: 'q',
    candidates: [
      candidate({ sourceRevision: 'old', candidateSnapshotRevision: 'new' }),
      candidate({ packetKey: '', candidateOrdinal: 2 }),
      candidate({ packetKey: 'packet:3', candidateOrdinal: 3, evidenceKinds: ['DERIVED_SYNTHESIS'] })
    ]
  }]);
  assert.equal(result.pairs.length, 0);
  assert.equal(result.excluded.STALE_SOURCE_REVISION, 1);
  assert.equal(result.excluded.INVALID_PACKETKEY, 1);
  assert.equal(result.excluded.SYNTHESIS_ONLY_EVIDENCE, 1);
});
