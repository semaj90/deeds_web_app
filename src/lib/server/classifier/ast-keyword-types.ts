/**
 * AST + Keyword enrichment types for classifier feature vectors
 * Part of the 11-feature XGBoost lane recommendation pipeline.
 */

export type Domain = 'auth' | 'ui' | 'retrieval' | 'network' | 'database' | 'cache' | 'agent' | 'graph' | 'ml' | 'general';

export interface AstFeatureSignals {
  source_ref: string;
  language: 'typescript' | 'svelte' | 'javascript' | 'python' | 'go' | 'unknown';
  symbols: string[];
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
  interfaces: string[];
  keyword_counts: Record<string, number>;
  predicted_domain: Domain;
  domain_confidence: number;
  extracted_at: number;
}

/**
 * 11-feature vector for XGBoost classifier.
 * Features 0-9 are existing. Feature 10 is ast_domain_confidence.
 */
export interface ClassifierFeatureVector {
  packet_key: string;
  source_ref: string;
  pagerank: number;
  som_row: number | null;
  som_col: number | null;
  community_id: number | null;
  days_old: number;
  has_content_vec: 0 | 1;
  has_summary_vec: 0 | 1;
  has_keyword_vec: 0 | 1;
  graph_degree: number;
  bm25_score: number;
  ast_domain_confidence: number;
}

export const VALID_DOMAINS = ['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml', 'general'] as const;

export function isDomain(v: unknown): v is Domain {
  return typeof v === 'string' && (VALID_DOMAINS as readonly string[]).includes(v);
}
