import assert from 'node:assert/strict';
import test from 'node:test';

test('structural query result fixture preserves spans and non-authoritative boundary', () => {
  const result = {
    schema: 'atlas.structural-query-result.v1',
    matches: [{
      observationId: 'obs-1',
      ruleId: 'calls-candidate-ordinal',
      observationKind: 'call_expression',
      sourceRef: 'src/example.ts',
      sourceRevision: 'sha256:source',
      byteStart: 10,
      byteEnd: 42,
      captures: { callee: 'CandidateOrdinal' },
      confidence: 1,
      matchReason: ['NODE_KIND', 'TARGET_SYMBOL'],
      rank: 1,
      candidateOrdinal: null,
    }],
    canonicalAuthority: false,
    promotionEligible: false,
    executable: false,
  };
  assert.equal(result.schema, 'atlas.structural-query-result.v1');
  assert.deepEqual([result.matches[0].byteStart, result.matches[0].byteEnd], [10, 42]);
  assert.equal(result.matches[0].candidateOrdinal, null);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.executable, false);
});

