// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildCandidateFeatureMatrix } from './retrieval-candidate-feature-matrix-v1.js';

describe('RetrievalCandidateFeatureMatrixV1 In-Memory Projection', () => {
  it('builds [C, 25] feature matrix and presence mask without recomputing features', () => {
    const candidates = [
      {
        packet_key: 'packet:03e3bacd7a74',
        semantic_similarity_768: 0.92,
        lexical_score: 0.85,
        authority_norm: 0.78,
        // execution_utility (col 18) left undefined
      },
      {
        packet_key: 'packet:41ae4f183768',
        semantic_similarity_768: 0.88,
        execution_utility: 0.95, // col 18 defined
      },
    ];

    const matrix = buildCandidateFeatureMatrix(candidates);

    expect(matrix.candidate_count).toBe(2);
    expect(matrix.feature_count).toBe(25);
    expect(matrix.candidate_packet_keys).toEqual(['packet:03e3bacd7a74', 'packet:41ae4f183768']);

    expect(matrix.presence_mask[0 * 25 + 18]).toBe(0);
    expect(matrix.candidate_features[0 * 25 + 18]).toBe(0.0);
    expect(matrix.presence_mask[1 * 25 + 18]).toBe(1);
    expect(matrix.candidate_features[1 * 25 + 18]).toBeCloseTo(0.95, 4);
  });

  it('treats absent evidence as missing but rejects explicit non-finite evidence', () => {
    const missing = buildCandidateFeatureMatrix([{ packet_key: 'packet:missing' }]);
    expect(missing.presence_mask[0]).toBe(0);
    expect(missing.candidate_features[0]).toBe(0);

    expect(() => buildCandidateFeatureMatrix([
      { packet_key: 'packet:bad', semantic_similarity_768: Number.POSITIVE_INFINITY },
    ])).toThrow('CANDIDATE_FEATURE_NON_FINITE:packet:bad:semantic_similarity_768');

    expect(() => buildCandidateFeatureMatrix([
      { packet_key: 'packet:nan', lexical_score: Number.NaN },
    ])).toThrow('CANDIDATE_FEATURE_NON_FINITE:packet:nan:lexical_score');
  });

  it('requires a stable packet identity for every tensor row', () => {
    expect(() => buildCandidateFeatureMatrix([{ packet_key: '' }])).toThrow('CANDIDATE_PACKET_KEY_REQUIRED:0');
  });
});
