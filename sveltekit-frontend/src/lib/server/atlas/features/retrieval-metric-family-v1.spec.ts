// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  RETRIEVAL_METRIC_FAMILY_V1,
  assertMetricAllowedForFamily,
  canonicalSimilarityFromMetric,
  metricHigherIsBetter,
  retrievalMetricBindingV1Schema,
} from './retrieval-metric-family-v1.js';

const base = {
  schema: RETRIEVAL_METRIC_FAMILY_V1,
  signalId: 'semantic:query:candidate',
  representationId: 'semantic_768',
  representationRevision: 'semantic:rev:1',
  producerRevision: 'metric-producer:v1',
  evidenceRefs: ['candidate:0'],
};

describe('RetrievalMetricFamilyV1', () => {
  it('accepts normalized dense cosine evidence', () => {
    expect(retrievalMetricBindingV1Schema.parse({
      ...base,
      family: 'DENSE_CONTINUOUS',
      metric: 'COSINE',
      normalized: true,
    })).toMatchObject({ family: 'DENSE_CONTINUOUS', metric: 'COSINE' });
  });

  it('rejects Hamming on dense semantic vectors', () => {
    expect(() => retrievalMetricBindingV1Schema.parse({
      ...base,
      family: 'DENSE_CONTINUOUS',
      metric: 'HAMMING',
      normalized: true,
    })).toThrow(/METRIC_FAMILY_MISMATCH/);
  });

  it('accepts Hamming only for an explicit binary fingerprint representation', () => {
    expect(retrievalMetricBindingV1Schema.parse({
      ...base,
      signalId: 'structural:fingerprint',
      family: 'BINARY_FINGERPRINT',
      metric: 'HAMMING',
      representationId: 'structural_sign_256',
      representationRevision: 'structural-sign:rev:1',
      normalized: null,
    })).toMatchObject({ family: 'BINARY_FINGERPRINT', metric: 'HAMMING' });
  });

  it('accepts concept Jaccard as a sparse-set signal and keeps it separate from dense semantic score', () => {
    expect(retrievalMetricBindingV1Schema.parse({
      ...base,
      signalId: 'concept:jaccard',
      family: 'SPARSE_SET',
      metric: 'JACCARD',
      representationId: 'concept_ids',
      representationRevision: 'ontology:rev:1',
      normalized: null,
    })).toMatchObject({ family: 'SPARSE_SET', metric: 'JACCARD' });
  });

  it('does not silently convert uncalibrated distances into similarity', () => {
    expect(metricHigherIsBetter('EUCLIDEAN_L2')).toBe(false);
    expect(metricHigherIsBetter('HAMMING')).toBe(false);
    expect(() => canonicalSimilarityFromMetric('HAMMING', 7)).toThrow(
      /DISTANCE_METRIC_REQUIRES_EXPLICIT_CALIBRATION/,
    );
    expect(canonicalSimilarityFromMetric('COSINE', 0.7)).toBe(0.7);
  });

  it('exposes an explicit family assertion helper', () => {
    expect(() => assertMetricAllowedForFamily('SPARSE_SET', 'JACCARD')).not.toThrow();
    expect(() => assertMetricAllowedForFamily('SPARSE_SET', 'COSINE')).toThrow(/METRIC_FAMILY_MISMATCH/);
  });
});
