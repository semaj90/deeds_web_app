import { describe, it, expect } from 'vitest';
import { toXgboostVector, FEATURE_NAMES, FEATURE_COUNT } from '$lib/server/classifier/classifier-feature-vector';
import type { ClassifierFeatureVector } from '$lib/server/classifier/ast-keyword-types';

describe('Classifier Feature Vector', () => {
  it('should export correct feature count', () => {
    expect(FEATURE_COUNT).toBe(11);
  });

  it('should export all feature names in order', () => {
    const expectedNames = [
      'pagerank',
      'som_row',
      'som_col',
      'community_id',
      'days_old',
      'has_content_vec',
      'has_summary_vec',
      'has_keyword_vec',
      'graph_degree',
      'bm25_score',
      'ast_domain_confidence'
    ];
    expect(FEATURE_NAMES).toEqual(expectedNames);
  });

  it('should encode vector with all features present', () => {
    const features: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      pagerank: 0.75,
      som_row: 5,
      som_col: 10,
      community_id: 3,
      days_old: 45,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0,
      graph_degree: 12,
      bm25_score: 0.85,
      ast_domain_confidence: 0.92
    };

    const vector = toXgboostVector(features);

    expect(vector).toHaveLength(11);
    expect(vector[0]).toBe(0.75); // pagerank
    expect(vector[1]).toBe(5); // som_row
    expect(vector[2]).toBe(10); // som_col
    expect(vector[3]).toBe(3); // community_id
    expect(vector[4]).toBe(45); // days_old
    expect(vector[5]).toBe(1); // has_content_vec
    expect(vector[6]).toBe(1); // has_summary_vec
    expect(vector[7]).toBe(0); // has_keyword_vec
    expect(vector[8]).toBe(12); // graph_degree
    expect(vector[9]).toBe(0.85); // bm25_score
    expect(vector[10]).toBe(0.92); // ast_domain_confidence
  });

  it('should fill missing values with defaults', () => {
    const features: ClassifierFeatureVector = {
      packet_key: 'ace:packet:002',
      source_ref: 'src/lib/ui.ts',
      has_content_vec: 0,
      has_summary_vec: 0,
      has_keyword_vec: 1
    };

    const vector = toXgboostVector(features);

    expect(vector).toHaveLength(11);
    expect(vector[0]).toBe(0); // pagerank default
    expect(vector[1]).toBe(-1); // som_row default (null)
    expect(vector[2]).toBe(-1); // som_col default (null)
    expect(vector[3]).toBe(-1); // community_id default (null)
    expect(vector[4]).toBe(9999); // days_old default (large number for missing)
    expect(vector[8]).toBe(0); // graph_degree default
    expect(vector[9]).toBe(0); // bm25_score default
    expect(vector[10]).toBe(0); // ast_domain_confidence default
  });

  it('should handle null som coordinates', () => {
    const features: ClassifierFeatureVector = {
      packet_key: 'ace:packet:003',
      source_ref: 'src/lib/search.ts',
      som_row: null,
      som_col: null,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 1
    };

    const vector = toXgboostVector(features);

    expect(vector[1]).toBe(-1); // som_row
    expect(vector[2]).toBe(-1); // som_col
  });

  it('should handle undefined community_id', () => {
    const features: ClassifierFeatureVector = {
      packet_key: 'ace:packet:004',
      source_ref: 'src/lib/graph.ts',
      community_id: undefined,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 1
    };

    const vector = toXgboostVector(features);

    expect(vector[3]).toBe(-1); // community_id default for undefined
  });

  it('should maintain feature order consistency', () => {
    const features1: ClassifierFeatureVector = {
      packet_key: 'ace:packet:005',
      source_ref: 'src/lib/auth.ts',
      pagerank: 0.5,
      som_row: 8,
      som_col: 12,
      community_id: 2,
      days_old: 30,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0,
      graph_degree: 8,
      bm25_score: 0.70,
      ast_domain_confidence: 0.88
    };

    const features2: ClassifierFeatureVector = {
      packet_key: 'ace:packet:006',
      source_ref: 'src/lib/retrieval.ts',
      pagerank: 0.5,
      som_row: 8,
      som_col: 12,
      community_id: 2,
      days_old: 30,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0,
      graph_degree: 8,
      bm25_score: 0.70,
      ast_domain_confidence: 0.88
    };

    const vector1 = toXgboostVector(features1);
    const vector2 = toXgboostVector(features2);

    // Same feature values should produce identical vectors
    expect(vector1).toEqual(vector2);
  });

  it('should produce valid XGBoost input ranges', () => {
    const features: ClassifierFeatureVector = {
      packet_key: 'ace:packet:007',
      source_ref: 'src/lib/test.ts',
      pagerank: 1.0,
      som_row: 19,
      som_col: 19,
      community_id: 100,
      days_old: 365,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 1,
      graph_degree: 1000,
      bm25_score: 1.0,
      ast_domain_confidence: 1.0
    };

    const vector = toXgboostVector(features);

    // All values should be numeric
    expect(vector.every(v => typeof v === 'number')).toBe(true);
    // No NaN or Infinity
    expect(vector.every(v => isFinite(v))).toBe(true);
  });
});
