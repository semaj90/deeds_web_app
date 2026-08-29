import assert from 'node:assert/strict';
import test from 'node:test';

test('structural lane result keeps scores local and fusion disabled', () => {
  const result = {
    schema: 'atlas.structural-lane-result.v1',
    lane: 'structural_cst_ast',
    scoreSemantics: 'LANE_LOCAL_DIAGNOSTIC_ONLY',
    fusionReady: false,
    canonicalAuthority: false,
    promotionEligible: false,
    hits: [{
      observationId: 'obs-1', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source',
      byteStart: 1, byteEnd: 5, candidateOrdinal: 0, canonicalId: 'candidate-0',
      packetKey: 'packet-0', identityStatus: 'RESOLVED_EXACT', structuralRank: 1,
      confidence: 1, matchReason: ['TARGET_SYMBOL'],
    }],
  };
  assert.equal(result.scoreSemantics, 'LANE_LOCAL_DIAGNOSTIC_ONLY');
  assert.equal(result.fusionReady, false);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.hits[0].candidateOrdinal, 0);
});

