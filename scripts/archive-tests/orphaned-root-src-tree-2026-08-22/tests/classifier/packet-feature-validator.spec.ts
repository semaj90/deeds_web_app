import { describe, it, expect } from 'vitest';
import { validateClassifierFeatureVector } from '$lib/server/classifier/packet-feature-validator';
import type { ClassifierFeatureVector } from '$lib/server/classifier/ast-keyword-types';

describe('Packet Feature Validator', () => {
  it('should pass validation for complete valid vector', () => {
    const vector: ClassifierFeatureVector = {
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

    const errors = validateClassifierFeatureVector(vector);
    expect(errors).toHaveLength(0);
  });

  it('should reject missing packet_key', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: '',
      source_ref: 'src/lib/auth.ts',
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors).toContain('missing packet_key');
  });

  it('should reject missing source_ref', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: '',
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors).toContain('missing source_ref');
  });

  it('should reject som_row out of bounds (too low)', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      som_row: -1,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.some(e => e.includes('som_row'))).toBe(true);
  });

  it('should reject som_row out of bounds (too high)', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      som_row: 20,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.some(e => e.includes('som_row'))).toBe(true);
  });

  it('should accept som_row at boundaries', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      som_row: 0,
      som_col: 19,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.filter(e => e.includes('som_row') || e.includes('som_col'))).toHaveLength(0);
  });

  it('should reject som_col out of bounds', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      som_col: 25,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.some(e => e.includes('som_col'))).toBe(true);
  });

  it('should reject bm25_score out of range', () => {
    const vectors = [
      { bm25_score: -0.1 },
      { bm25_score: 1.1 }
    ];

    for (const bm25_override of vectors) {
      const vector: ClassifierFeatureVector = {
        packet_key: 'ace:packet:001',
        source_ref: 'src/lib/auth.ts',
        has_content_vec: 1,
        has_summary_vec: 1,
        has_keyword_vec: 0,
        ...bm25_override
      };

      const errors = validateClassifierFeatureVector(vector);
      expect(errors.some(e => e.includes('bm25_score'))).toBe(true);
    }
  });

  it('should accept bm25_score at boundaries', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      bm25_score: 0,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.filter(e => e.includes('bm25_score'))).toHaveLength(0);
  });

  it('should reject ast_domain_confidence out of range', () => {
    const vectors = [
      { ast_domain_confidence: -0.1 },
      { ast_domain_confidence: 1.1 }
    ];

    for (const conf_override of vectors) {
      const vector: ClassifierFeatureVector = {
        packet_key: 'ace:packet:001',
        source_ref: 'src/lib/auth.ts',
        has_content_vec: 1,
        has_summary_vec: 1,
        has_keyword_vec: 0,
        ...conf_override
      };

      const errors = validateClassifierFeatureVector(vector);
      expect(errors.some(e => e.includes('ast_domain_confidence'))).toBe(true);
    }
  });

  it('should accept ast_domain_confidence at boundaries', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      ast_domain_confidence: 1.0,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.filter(e => e.includes('ast_domain_confidence'))).toHaveLength(0);
  });

  it('should reject negative pagerank', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      pagerank: -0.1,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.some(e => e.includes('pagerank'))).toBe(true);
  });

  it('should accept pagerank at zero', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      pagerank: 0,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.filter(e => e.includes('pagerank'))).toHaveLength(0);
  });

  it('should reject negative days_old', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      days_old: -1,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.some(e => e.includes('days_old'))).toBe(true);
  });

  it('should accept days_old at zero', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      days_old: 0,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.filter(e => e.includes('days_old'))).toHaveLength(0);
  });

  it('should allow null/undefined optional fields', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: 'ace:packet:001',
      source_ref: 'src/lib/auth.ts',
      som_row: null,
      som_col: null,
      community_id: null,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.filter(e => e.includes('som_') || e.includes('community'))).toHaveLength(0);
  });

  it('should report multiple errors at once', () => {
    const vector: ClassifierFeatureVector = {
      packet_key: '',
      source_ref: '',
      som_row: 25,
      bm25_score: 1.5,
      ast_domain_confidence: -0.1,
      has_content_vec: 1,
      has_summary_vec: 1,
      has_keyword_vec: 0
    };

    const errors = validateClassifierFeatureVector(vector);
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(errors.some(e => e.includes('packet_key'))).toBe(true);
    expect(errors.some(e => e.includes('source_ref'))).toBe(true);
    expect(errors.some(e => e.includes('som_row'))).toBe(true);
    expect(errors.some(e => e.includes('bm25_score'))).toBe(true);
  });
});
