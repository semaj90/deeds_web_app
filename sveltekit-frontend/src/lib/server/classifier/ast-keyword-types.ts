/**
 * Canonical type definitions for AST keyword feature extraction.
 * Bridge between rg/ast-grep extraction and XGBoost classifier input.
 */

export type Domain = 'auth' | 'ui' | 'retrieval' | 'network' | 'database' | 'cache' | 'agent' | 'graph' | 'ml' | 'general';

export const VALID_DOMAINS: readonly Domain[] = [
  'auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml', 'general'
] as const;

export function isDomain(value: unknown): value is Domain {
  return typeof value === 'string' && VALID_DOMAINS.includes(value as Domain);
}

export interface AstFeatureSignals {
  source_ref: string;
  language?: string;
  symbols: string[];
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
  interfaces: string[];
  keyword_counts: Record<Domain, number>;
  predicted_domain: Domain;
  domain_confidence: number;
  extracted_at: Date;
}

export interface ClassifierFeatureVector {
  packet_key: string;
  source_ref: string;
  // Existing 10 features
  pagerank?: number;
  som_row?: number | null;
  som_col?: number | null;
  community_id?: number | null;
  days_old?: number;
  has_content_vec: number;
  has_summary_vec: number;
  has_keyword_vec: number;
  graph_degree?: number;
  bm25_score?: number;
  // New 11th feature
  ast_domain_confidence?: number;
}

export interface PacketAstKeywordFeatures {
  id: number;
  packet_key: string;
  source_ref: string;
  predicted_domain: Domain;
  domain_confidence: number;
  domain_detection_method: 'keyword' | 'ast_grep' | 'hybrid';
  keywords: string[];
  keyword_count: number;
  keyword_coverage: number;
  symbols: string[];
  symbol_count: number;
  imports: string[];
  imports_count: number;
  exports: string[];
  exports_count: number;
  functions: string[];
  functions_count: number;
  classes: string[];
  classes_count: number;
  interfaces: string[];
  interfaces_count: number;
  keyword_counts: Record<Domain, number>;
  extracted_at: Date;
  extraction_source: 'rg' | 'ast-grep' | 'langextract';
  extraction_version: string;
  validation_errors: string[];
  is_valid: boolean;
  validation_gate: Date | null;
  status: 'pending' | 'extracted' | 'validated' | 'backfilled';
  updated_at: Date;
}
