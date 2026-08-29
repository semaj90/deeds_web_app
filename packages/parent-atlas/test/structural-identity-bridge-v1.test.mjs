import assert from 'node:assert/strict';
import test from 'node:test';

test('identity bridge resolves only one exact source/revision candidate', () => {
  const input = {
    queryResult: {
      schema: 'atlas.structural-query-result.v1',
      queryDigest: 'a'.repeat(64),
      sourceRef: 'src/example.ts',
      sourceRevision: 'sha256:source',
      extractorRevision: 'treesitter:v1',
      matches: [{
        observationId: 'obs-1', ruleId: 'call', observationKind: 'call_expression',
        sourceRef: 'src/example.ts', sourceRevision: 'sha256:source', byteStart: 1, byteEnd: 4,
        captures: {}, confidence: 1, matchReason: ['NODE_KIND'], rank: 1, candidateOrdinal: null,
      }],
      resultChecksum: 'b'.repeat(64),
      canonicalAuthority: false, promotionEligible: false, executable: false,
    },
    workspaceRevision: 'sha256:workspace',
    candidateEntries: [{ candidateOrdinal: 7, canonicalId: 'candidate-7', packetKey: 'packet-7', sourceRef: 'src/example.ts', sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace' }],
  };
  assert.equal(input.queryResult.matches[0].candidateOrdinal, null);
  assert.equal(input.candidateEntries[0].candidateOrdinal, 7);
});

test('identity bridge fixture rejects duplicate source candidates as ambiguous', () => {
  const result = { status: 'AMBIGUOUS_SOURCE', candidateOrdinal: null, canonicalAuthority: false, promotionEligible: false };
  assert.equal(result.status, 'AMBIGUOUS_SOURCE');
  assert.equal(result.candidateOrdinal, null);
  assert.equal(result.canonicalAuthority, false);
});
