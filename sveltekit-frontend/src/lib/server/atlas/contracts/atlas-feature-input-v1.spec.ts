// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { AtlasFeatureInputV1Schema, projectToAtlasFeatureInputs } from './atlas-feature-input-v1.js';
import { buildCandidateFeatureMatrix } from '../../retrieval/retrieval-candidate-feature-matrix-v1.js';
import { CANDIDATE_FEATURE_NAMES } from './feature-extraction-v1.js';

describe('AtlasFeatureInputV1', () => {
  it('accepts a valid input row', () => {
    const row = {
      matrixRevision: 'rev-1',
      candidateOrdinal: 0,
      canonicalId: 'cand:1',
      featureNames: CANDIDATE_FEATURE_NAMES,
      values: new Array(CANDIDATE_FEATURE_NAMES.length).fill(0),
      presenceMask: new Array(CANDIDATE_FEATURE_NAMES.length).fill(0),
      evidenceRefs: [],
    };
    const parsed = AtlasFeatureInputV1Schema.parse(row);
    expect(parsed.matrixSchema).toBe('atlas.atlas-feature-input.v1');
  });

  it('rejects unknown top-level fields (strict)', () => {
    const row = {
      matrixRevision: 'rev-1',
      candidateOrdinal: 0,
      canonicalId: 'cand:1',
      featureNames: CANDIDATE_FEATURE_NAMES,
      values: new Array(CANDIDATE_FEATURE_NAMES.length).fill(0),
      presenceMask: new Array(CANDIDATE_FEATURE_NAMES.length).fill(0),
      extra: true,
    };
    expect(() => AtlasFeatureInputV1Schema.parse(row)).toThrow();
  });

  it('rejects a values array of the wrong length', () => {
    const row = {
      matrixRevision: 'rev-1',
      candidateOrdinal: 0,
      canonicalId: 'cand:1',
      featureNames: CANDIDATE_FEATURE_NAMES,
      values: [1, 2, 3],
      presenceMask: new Array(CANDIDATE_FEATURE_NAMES.length).fill(0),
    };
    expect(() => AtlasFeatureInputV1Schema.parse(row)).toThrow();
  });

  it('rejects a presenceMask value outside {0, 1}', () => {
    const presenceMask = new Array(CANDIDATE_FEATURE_NAMES.length).fill(0);
    presenceMask[0] = 2;
    const row = {
      matrixRevision: 'rev-1',
      candidateOrdinal: 0,
      canonicalId: 'cand:1',
      featureNames: CANDIDATE_FEATURE_NAMES,
      values: new Array(CANDIDATE_FEATURE_NAMES.length).fill(0),
      presenceMask,
    };
    expect(() => AtlasFeatureInputV1Schema.parse(row)).toThrow();
  });
});

describe('projectToAtlasFeatureInputs — read-only reshape of the existing matrix', () => {
  it('projects one AtlasFeatureInputV1 per candidate row, preserving values and presence mask verbatim', () => {
    const matrix = buildCandidateFeatureMatrix([
      { packet_key: 'cand:1', semantic_similarity_768: 0.9, lexical_score: 0.5 },
      { packet_key: 'cand:2', ast_signal: 0.7 },
    ]);
    const inputs = projectToAtlasFeatureInputs(matrix, 'rev-1');

    expect(inputs).toHaveLength(2);
    expect(inputs[0].candidateOrdinal).toBe(0);
    expect(inputs[0].canonicalId).toBe('cand:1');
    expect(inputs[1].candidateOrdinal).toBe(1);
    expect(inputs[1].canonicalId).toBe('cand:2');

    const semanticIdx = CANDIDATE_FEATURE_NAMES.indexOf('semantic_similarity_768');
    expect(inputs[0].values[semanticIdx]).toBeCloseTo(0.9);
    expect(inputs[0].presenceMask[semanticIdx]).toBe(1);

    // A feature never supplied for cand:1 (e.g. ast_signal) must be present=0, value=0 —
    // not silently treated as "the feature is 0.0 because that's a real observation".
    const astIdx = CANDIDATE_FEATURE_NAMES.indexOf('ast_signal');
    expect(inputs[0].presenceMask[astIdx]).toBe(0);
    expect(inputs[0].values[astIdx]).toBe(0);
  });

  it('does not mint any feature value not already present in the source matrix', () => {
    const matrix = buildCandidateFeatureMatrix([{ packet_key: 'cand:1' }]);
    const inputs = projectToAtlasFeatureInputs(matrix, 'rev-1');
    // Every feature is absent -> every presenceMask entry must be 0.
    expect(inputs[0].presenceMask.every((p) => p === 0)).toBe(true);
  });

  it('attaches evidenceRefs from the optional lookup map, defaulting to empty', () => {
    const matrix = buildCandidateFeatureMatrix([
      { packet_key: 'cand:1' },
      { packet_key: 'cand:2' },
    ]);
    const evidenceRefsByCandidate = new Map([['cand:1', ['src/foo.ts#L1-10']]]);
    const inputs = projectToAtlasFeatureInputs(matrix, 'rev-1', evidenceRefsByCandidate);
    expect(inputs[0].evidenceRefs).toEqual(['src/foo.ts#L1-10']);
    expect(inputs[1].evidenceRefs).toEqual([]);
  });

  it('throws if the source matrix feature_count does not match CANDIDATE_FEATURE_NAMES length', () => {
    const matrix = buildCandidateFeatureMatrix([{ packet_key: 'cand:1' }]);
    const corrupted = { ...matrix, feature_count: 10 };
    expect(() => projectToAtlasFeatureInputs(corrupted, 'rev-1')).toThrow(/expected feature_count/);
  });
});
