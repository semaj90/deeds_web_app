/**
 * Validation gates for classifier feature vectors.
 * Ensures data quality before XGBoost prediction.
 */

import type { ClassifierFeatureVector } from './ast-keyword-types.js';

export function validateClassifierFeatureVector(v: ClassifierFeatureVector): string[] {
  const errors: string[] = [];

  if (!v.packet_key) errors.push('missing packet_key');
  if (!v.source_ref) errors.push('missing source_ref');

  if (v.som_row !== null && v.som_row !== undefined && (v.som_row < 0 || v.som_row > 19)) {
    errors.push(`som_row ${v.som_row} out of 20x20 bounds [0,19]`);
  }
  if (v.som_col !== null && v.som_col !== undefined && (v.som_col < 0 || v.som_col > 19)) {
    errors.push(`som_col ${v.som_col} out of 20x20 bounds [0,19]`);
  }

  if (v.bm25_score !== undefined && (v.bm25_score < 0 || v.bm25_score > 1)) {
    errors.push(`bm25_score ${v.bm25_score} must be normalized [0,1]`);
  }

  if (v.ast_domain_confidence !== undefined && (v.ast_domain_confidence < 0 || v.ast_domain_confidence > 1)) {
    errors.push(`ast_domain_confidence ${v.ast_domain_confidence} must be [0,1]`);
  }

  if (v.pagerank !== undefined && v.pagerank < 0) {
    errors.push(`pagerank ${v.pagerank} must be >= 0`);
  }

  if (v.days_old !== undefined && v.days_old < 0) {
    errors.push(`days_old ${v.days_old} must be >= 0`);
  }

  return errors;
}
