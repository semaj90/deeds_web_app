// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { RETRIEVAL_METRIC_FAMILY_V1 } from './retrieval-metric-family-v1.js';
import {
  CANDIDATE_METRIC_EVIDENCE_V1,
  candidateMetricEvidenceV1Schema,
  groupMetricEvidenceByCandidateOrdinal,
  type CandidateMetricEvidenceV1,
} from './candidate-metric-evidence-v1.js';

const baseBinding = {
  schema: RETRIEVAL_METRIC_FAMILY_V1,
  signalId: 'concept:jaccard',
  family: 'SPARSE_SET' as const,
  metric: 'JACCARD' as const,
  representationId: 'concept_ids',
  representationRevision: 'ontology:rev:1',
  normalized: null,
  producerRevision: 'concept-jaccard:v1',
  evidenceRefs: ['ontology:tuple:1'],
};

const row: CandidateMetricEvidenceV1 = {
  schema: CANDIDATE_METRIC_EVIDENCE_V1,
  requestId: 'request:1',
  candidateOrdinal: 4,
  canonicalId: 'fullrepo:src/example.ts:1',
  workspaceRevision: 'sha256:' + 'a'.repeat(64),
  sourceRevision: 'sha256:' + 'b'.repeat(64),
  binding: baseBinding,
  rawValue: 0.5,
  calibratedSimilarity: null,
  calibrationRevision: null,
};

describe('CandidateMetricEvidenceV1', () => {
  it('preserves typed Jaccard evidence without forcing calibration', () => {
    expect(candidateMetricEvidenceV1Schema.parse(row)).toMatchObject({
      candidateOrdinal: 4,
      rawValue: 0.5,
      calibratedSimilarity: null,
    });
  });

  it('requires a calibration revision whenever a calibrated value exists', () => {
    expect(() => candidateMetricEvidenceV1Schema.parse({
      ...row,
      calibratedSimilarity: 0.75,
      calibrationRevision: null,
    })).toThrow(/CALIBRATION_VALUE_AND_REVISION_MUST_COHERENTLY_COEXIST/);
  });

  it('rejects negative distance values', () => {
    expect(() => candidateMetricEvidenceV1Schema.parse({
      ...row,
      binding: {
        ...baseBinding,
        signalId: 'structural:hamming',
        family: 'BINARY_FINGERPRINT',
        metric: 'HAMMING',
        representationId: 'structural_sign_256',
        representationRevision: 'structural:rev:1',
        normalized: null,
      },
      rawValue: -1,
    })).toThrow(/DISTANCE_METRIC_NEGATIVE:HAMMING/);
  });

  it('groups independent evidence signals by CandidateOrdinal without changing identity', () => {
    const other = candidateMetricEvidenceV1Schema.parse({
      ...row,
      binding: {
        ...baseBinding,
        signalId: 'semantic:cosine',
        family: 'DENSE_CONTINUOUS',
        metric: 'COSINE',
        representationId: 'semantic_768',
        representationRevision: 'semantic:rev:1',
        normalized: true,
      },
      rawValue: 0.82,
    });

    const grouped = groupMetricEvidenceByCandidateOrdinal([row, other]);
    expect(grouped.get(4)).toHaveLength(2);
    expect(new Set(grouped.get(4)?.map((item) => item.binding.family))).toEqual(
      new Set(['SPARSE_SET', 'DENSE_CONTINUOUS']),
    );
  });
});
