/**
 * Convert ClassifierFeatureVector to XGBoost input array.
 * Feature order MUST match training CSV order.
 *
 * Features [0-9]: existing
 * Feature [10]: ast_domain_confidence (new)
 */

import type { ClassifierFeatureVector } from './ast-keyword-types.js';

export function toXgboostVector(features: ClassifierFeatureVector): number[] {
  return [
    features.pagerank ?? 0,
    features.som_row ?? -1,
    features.som_col ?? -1,
    features.community_id ?? -1,
    features.days_old ?? 9999,
    features.has_content_vec,
    features.has_summary_vec,
    features.has_keyword_vec,
    features.graph_degree ?? 0,
    features.bm25_score ?? 0,
    features.ast_domain_confidence ?? 0
  ];
}

export const FEATURE_NAMES = [
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
] as const;

export const FEATURE_COUNT = FEATURE_NAMES.length;
