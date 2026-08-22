import { describe, expect, it } from 'vitest';

import {
  buildCandidateOrdinalSetV1,
  verifyCandidateOrdinalSetV1,
} from './candidate-ordinal-set-v1.js';

const checksum = 'a'.repeat(64);

function build() {
  return buildCandidateOrdinalSetV1({
    requestId: 'request-1',
    candidateSnapshotRevision: 'candidate-snapshot:v1',
    ordinalMapChecksum: checksum,
    representationRevision: 'semantic_768@v1',
    approximate: true,
    hits: [
      {
        candidateOrdinal: 3,
        score: 0.91,
        rank: 1,
        executor: 'QDRANT',
        evidenceRefs: ['qdrant:receipt:1'],
      },
      {
        candidateOrdinal: 7,
        score: 0.87,
        rank: 2,
        executor: 'QDRANT',
        evidenceRefs: ['qdrant:receipt:2'],
      },
    ],
  });
}

describe('CandidateOrdinalSetV1', () => {
  it('moves ordinal/score/rank metadata without raw vectors or executor ids', () => {
    const result = build();
    expect(result.representationId).toBe('semantic_768');
    expect(result.rawVectorsIncluded).toBe(false);
    expect(result.executorIdsIncluded).toBe(false);
    expect(result.candidateOrdinalIsIdentityAuthority).toBe(false);
    expect(result.exactPromotionRequired).toBe(true);
    expect(verifyCandidateOrdinalSetV1(result)).toEqual(result);
  });

  it('rejects duplicate ordinals within one result set', () => {
    expect(() => buildCandidateOrdinalSetV1({
      requestId: 'request-1',
      candidateSnapshotRevision: 'candidate-snapshot:v1',
      ordinalMapChecksum: checksum,
      representationRevision: 'semantic_768@v1',
      approximate: false,
      hits: [
        { candidateOrdinal: 2, score: 0.9, rank: 1, executor: 'CUVS_EXACT', evidenceRefs: [] },
        { candidateOrdinal: 2, score: 0.8, rank: 2, executor: 'CUVS_EXACT', evidenceRefs: [] },
      ],
    })).toThrow('CANDIDATE_ORDINAL_SET_DUPLICATE:2');
  });

  it('detects tampering', () => {
    const result = build();
    expect(() => verifyCandidateOrdinalSetV1({ ...result, representationRevision: 'semantic_768@other' }))
      .toThrow('CANDIDATE_ORDINAL_SET_CHECKSUM_MISMATCH');
  });
});
