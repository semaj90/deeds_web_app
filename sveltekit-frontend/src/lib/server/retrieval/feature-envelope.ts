/**
 * Phase 2F.1: FeatureEnvelope Type System
 *
 * Unified interface for tracking independent retrieval signals during evaluation.
 * Enables 6 ablation configurations by exposing individual signal scores and
 * allowing configurable blending strategies (RRF, weighted sum, learned weights).
 *
 * Core principle: Each signal is computed independently, stored independently,
 * and can be included/excluded from the final ranking without recomputation.
 */

import { z } from 'zod';

// ============================================================================
// SIGNAL DEFINITIONS (Independent Scores)
// ============================================================================

/**
 * Dense vector signal (Qdrant ANN)
 * Semantic similarity via 768-dim embeddings
 */
export const DenseSignalSchema = z.object({
  name: z.literal('dense'),
  // Raw cosine similarity from Qdrant [-1, 1], normalized to [0, 1]
  score: z.number().min(0).max(1),
  // Qdrant point ID for traceability
  qdrant_point_id: z.string(),
  // Distance metric used (e.g., "cosine", "dot")
  metric: z.enum(['cosine', 'dot', 'euclid']),
  // Confidence in this score [0, 1]
  confidence: z.number().min(0).max(1),
});

export type DenseSignal = z.infer<typeof DenseSignalSchema>;

/**
 * Lexical signal (BM25 Full-Text Search)
 * Keyword overlap and term frequency-inverse document frequency
 */
export const LexicalSignalSchema = z.object({
  name: z.literal('lexical'),
  // BM25 relevance score, normalized to [0, 1]
  score: z.number().min(0).max(1),
  // Matching terms found in chunk
  matched_terms: z.array(z.string()).default([]),
  // Query coverage [0, 1] (fraction of query terms matched)
  query_coverage: z.number().min(0).max(1),
  // Confidence in this score [0, 1]
  confidence: z.number().min(0).max(1),
});

export type LexicalSignal = z.infer<typeof LexicalSignalSchema>;

/**
 * AST Structure signal
 * Symbol kind match, function/class/interface relevance
 */
export const ASTSignalSchema = z.object({
  name: z.literal('ast'),
  // Match score based on symbol kind and relevance [0, 1]
  score: z.number().min(0).max(1),
  // Kind of AST node (function, class, interface, type, variable, etc.)
  kind: z.string().optional(),
  // Symbol name if available
  symbol: z.string().optional(),
  // Line range if available
  line_start: z.number().optional(),
  line_end: z.number().optional(),
  // Confidence [0, 1]
  confidence: z.number().min(0).max(1),
});

export type ASTSignal = z.infer<typeof ASTSignalSchema>;

/**
 * Metadata signal
 * Tags, domain, language, file path relevance
 */
export const MetadataSignalSchema = z.object({
  name: z.literal('metadata'),
  // Composite score from tags, domain, language, path [0, 1]
  score: z.number().min(0).max(1),
  // Tags that matched query domain/keywords
  matched_tags: z.array(z.string()).default([]),
  // Programming language if applicable
  language: z.string().optional(),
  // Domain classification (e.g., "networking", "algorithms")
  domain: z.string().optional(),
  // Confidence [0, 1]
  confidence: z.number().min(0).max(1),
});

export type MetadataSignal = z.infer<typeof MetadataSignalSchema>;

/**
 * Authority signal
 * PageRank, community detection, central node status
 */
export const AuthoritySignalSchema = z.object({
  name: z.literal('authority'),
  // Normalized authority score [0, 1]
  score: z.number().min(0).max(1),
  // PageRank if computed
  page_rank: z.number().optional(),
  // Community ID if available
  community_id: z.number().optional(),
  // Is this node central to its community?
  is_central: z.boolean().optional(),
  // Confidence [0, 1]
  confidence: z.number().min(0).max(1),
});

export type AuthoritySignal = z.infer<typeof AuthoritySignalSchema>;

/**
 * Recency signal
 * How recently this chunk was modified/indexed
 */
export const RecencySignalSchema = z.object({
  name: z.literal('recency'),
  // Freshness score [0, 1] (1 = very recent, 0 = stale)
  score: z.number().min(0).max(1),
  // Timestamp of last modification
  last_modified: z.date().optional(),
  // Days since modification
  days_since_update: z.number().optional(),
  // Confidence [0, 1]
  confidence: z.number().min(0).max(1),
});

export type RecencySignal = z.infer<typeof RecencySignalSchema>;

// ============================================================================
// ENVELOPE: Unified Container for All Signals
// ============================================================================

/**
 * FeatureEnvelope v1
 *
 * Canonical container for a single ranked result with all signals exposed.
 * Allows ablation studies by including/excluding signals at blend time.
 *
 * Key invariants:
 * - All signals are optional (may not be computed for all chunks)
 * - All scores are normalized [0, 1]
 * - Confidence scores reflect extraction quality
 * - chunk_id must reference real codebase_chunk_index row
 */
export const FeatureEnvelopeSchema = z.object({
  // ─────────────────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────────────────
  chunk_id: z.string().describe('Foreign key to codebase_chunk_index.id'),
  query_id: z.string().optional().describe('Evaluation query ID if in test context'),

  // ─────────────────────────────────────────────────────────
  // Independent Signals (each computed separately)
  // ─────────────────────────────────────────────────────────
  dense: DenseSignalSchema.optional().describe('Qdrant ANN semantic similarity'),
  lexical: LexicalSignalSchema.optional().describe('BM25 full-text search'),
  ast: ASTSignalSchema.optional().describe('AST symbol structure matching'),
  metadata: MetadataSignalSchema.optional().describe('Tags, domain, language, path'),
  authority: AuthoritySignalSchema.optional().describe('PageRank, centrality, community'),
  recency: RecencySignalSchema.optional().describe('Freshness, modification date'),

  // ─────────────────────────────────────────────────────────
  // Computed Blends (derived from signals above)
  // ─────────────────────────────────────────────────────────
  /**
   * RRF (Reciprocal Rank Fusion) blend
   * Default: equal weight on available signals
   * Formula: sum(1 / (k + rank_i)) for each signal i
   * where k=60 (standard RRF parameter)
   */
  rrf_score: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('RRF fusion of all signals'),

  /**
   * Weighted blend (configurable weights)
   * Default Phase 2F.1 baseline: 0.50 dense + 0.50 lexical
   */
  weighted_score: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Weighted sum of signals (weights TBD per ablation)'),

  /**
   * Learned blend (ML reranker, placeholder for Phase 2F.2+)
   */
  learned_score: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Learned reranker score (placeholder)'),

  // ─────────────────────────────────────────────────────────
  // Metadata for Traceability
  // ─────────────────────────────────────────────────────────
  source_ref: z.string().optional().describe('File path or reference ID'),
  relative_path: z.string().optional().describe('Relative path in codebase'),
  summary: z.string().optional().describe('Brief chunk summary for human review'),

  // Extraction provenance
  created_at: z.date().default(() => new Date()),
  evaluated_at: z.date().optional(),

  // ─────────────────────────────────────────────────────────
  // Ablation Configuration ID
  // ─────────────────────────────────────────────────────────
  /**
   * Tracks which ablation configuration produced this result
   * Enables filtering results by config in analysis
   */
  ablation_config_id: z
    .enum(['dense_only', 'lexical_only', 'rrf_50_50', 'dense_heavy', 'lexical_heavy', 'all_signals'])
    .optional()
    .describe('Which ablation configuration was used'),
});

export type FeatureEnvelope = z.infer<typeof FeatureEnvelopeSchema>;

// ============================================================================
// ABLATION CONFIGURATIONS (6 variants)
// ============================================================================

/**
 * AblationConfig: Specifies which signals to include and how to blend
 */
export const AblationConfigSchema = z.object({
  id: z.enum(['dense_only', 'lexical_only', 'rrf_50_50', 'dense_heavy', 'lexical_heavy', 'all_signals']),
  name: z.string(),
  description: z.string(),

  // Signal inclusion flags
  include_dense: z.boolean(),
  include_lexical: z.boolean(),
  include_ast: z.boolean(),
  include_metadata: z.boolean(),
  include_authority: z.boolean(),
  include_recency: z.boolean(),

  // Blending strategy
  blend_strategy: z.enum(['rrf', 'weighted_sum', 'learned']),

  // Weights if using weighted_sum (sum must equal 1.0)
  weights: z
    .object({
      dense: z.number().default(0),
      lexical: z.number().default(0),
      ast: z.number().default(0),
      metadata: z.number().default(0),
      authority: z.number().default(0),
      recency: z.number().default(0),
    })
    .optional(),
});

export type AblationConfig = z.infer<typeof AblationConfigSchema>;

/**
 * Six standard ablation configurations for Phase 2F.1
 */
export const ABLATION_CONFIGS: Record<string, AblationConfig> = {
  dense_only: {
    id: 'dense_only',
    name: 'Dense Vector Only',
    description: 'Qdrant ANN semantic similarity alone',
    include_dense: true,
    include_lexical: false,
    include_ast: false,
    include_metadata: false,
    include_authority: false,
    include_recency: false,
    blend_strategy: 'weighted_sum',
    weights: { dense: 1.0, lexical: 0, ast: 0, metadata: 0, authority: 0, recency: 0 },
  },

  lexical_only: {
    id: 'lexical_only',
    name: 'Lexical (BM25) Only',
    description: 'Full-text search keyword matching alone',
    include_dense: false,
    include_lexical: true,
    include_ast: false,
    include_metadata: false,
    include_authority: false,
    include_recency: false,
    blend_strategy: 'weighted_sum',
    weights: { dense: 0, lexical: 1.0, ast: 0, metadata: 0, authority: 0, recency: 0 },
  },

  rrf_50_50: {
    id: 'rrf_50_50',
    name: 'RRF: Dense + Lexical (50/50)',
    description: 'Reciprocal Rank Fusion of dense and lexical signals',
    include_dense: true,
    include_lexical: true,
    include_ast: false,
    include_metadata: false,
    include_authority: false,
    include_recency: false,
    blend_strategy: 'rrf',
    weights: { dense: 0.5, lexical: 0.5, ast: 0, metadata: 0, authority: 0, recency: 0 },
  },

  dense_heavy: {
    id: 'dense_heavy',
    name: 'Dense-Heavy Blend',
    description: 'Weighted: 70% dense + 30% lexical',
    include_dense: true,
    include_lexical: true,
    include_ast: false,
    include_metadata: false,
    include_authority: false,
    include_recency: false,
    blend_strategy: 'weighted_sum',
    weights: { dense: 0.7, lexical: 0.3, ast: 0, metadata: 0, authority: 0, recency: 0 },
  },

  lexical_heavy: {
    id: 'lexical_heavy',
    name: 'Lexical-Heavy Blend',
    description: 'Weighted: 30% dense + 70% lexical',
    include_dense: true,
    include_lexical: true,
    include_ast: false,
    include_metadata: false,
    include_authority: false,
    include_recency: false,
    blend_strategy: 'weighted_sum',
    weights: { dense: 0.3, lexical: 0.7, ast: 0, metadata: 0, authority: 0, recency: 0 },
  },

  all_signals: {
    id: 'all_signals',
    name: 'All Signals (RRF)',
    description: 'RRF fusion of all 6 signals with equal weight',
    include_dense: true,
    include_lexical: true,
    include_ast: true,
    include_metadata: true,
    include_authority: true,
    include_recency: true,
    blend_strategy: 'rrf',
    weights: {
      dense: 1.0,
      lexical: 1.0,
      ast: 1.0,
      metadata: 1.0,
      authority: 1.0,
      recency: 1.0,
    },
  },
};

// ============================================================================
// BLENDING FUNCTIONS
// ============================================================================

/**
 * Compute RRF (Reciprocal Rank Fusion) score from individual signal scores
 *
 * Formula: sum(1 / (k + rank_i)) for each signal i
 * k = 60 (standard RRF parameter, prevents division by zero)
 *
 * @param envelope FeatureEnvelope with signal scores
 * @param config Which signals to include
 * @returns Normalized RRF score [0, 1]
 */
export function computeRRFScore(envelope: FeatureEnvelope, config: AblationConfig): number {
  const k = 60;
  const scores: number[] = [];

  // Collect scores from enabled signals
  if (config.include_dense && envelope.dense?.score !== undefined) {
    scores.push(envelope.dense.score);
  }
  if (config.include_lexical && envelope.lexical?.score !== undefined) {
    scores.push(envelope.lexical.score);
  }
  if (config.include_ast && envelope.ast?.score !== undefined) {
    scores.push(envelope.ast.score);
  }
  if (config.include_metadata && envelope.metadata?.score !== undefined) {
    scores.push(envelope.metadata.score);
  }
  if (config.include_authority && envelope.authority?.score !== undefined) {
    scores.push(envelope.authority.score);
  }
  if (config.include_recency && envelope.recency?.score !== undefined) {
    scores.push(envelope.recency.score);
  }

  if (scores.length === 0) return 0;

  // Compute RRF: sum of reciprocal ranks
  let rrf_sum = 0;
  for (const score of scores) {
    // Convert score [0,1] to rank-like metric
    // Higher score = lower rank = higher RRF contribution
    const rank = Math.max(1, Math.ceil((1 - score) * 100)); // Estimate rank from score
    rrf_sum += 1 / (k + rank);
  }

  // Normalize to [0, 1]
  const max_rrf = scores.length / (k + 1);
  return Math.min(1, rrf_sum / max_rrf);
}

/**
 * Compute weighted sum score from individual signal scores
 *
 * @param envelope FeatureEnvelope with signal scores
 * @param config Which signals and what weights to use
 * @returns Normalized weighted score [0, 1]
 */
export function computeWeightedScore(envelope: FeatureEnvelope, config: AblationConfig): number {
  if (!config.weights) return 0;

  let weighted_sum = 0;
  let weight_sum = 0;

  if (config.include_dense && envelope.dense?.score !== undefined) {
    weighted_sum += envelope.dense.score * config.weights.dense;
    weight_sum += config.weights.dense;
  }
  if (config.include_lexical && envelope.lexical?.score !== undefined) {
    weighted_sum += envelope.lexical.score * config.weights.lexical;
    weight_sum += config.weights.lexical;
  }
  if (config.include_ast && envelope.ast?.score !== undefined) {
    weighted_sum += envelope.ast.score * config.weights.ast;
    weight_sum += config.weights.ast;
  }
  if (config.include_metadata && envelope.metadata?.score !== undefined) {
    weighted_sum += envelope.metadata.score * config.weights.metadata;
    weight_sum += config.weights.metadata;
  }
  if (config.include_authority && envelope.authority?.score !== undefined) {
    weighted_sum += envelope.authority.score * config.weights.authority;
    weight_sum += config.weights.authority;
  }
  if (config.include_recency && envelope.recency?.score !== undefined) {
    weighted_sum += envelope.recency.score * config.weights.recency;
    weight_sum += config.weights.recency;
  }

  return weight_sum > 0 ? weighted_sum / weight_sum : 0;
}

/**
 * Apply ablation configuration: compute final score based on enabled signals
 *
 * @param envelope FeatureEnvelope to score
 * @param config Ablation configuration
 * @returns Updated envelope with final score set
 */
export function applyAblationConfig(envelope: FeatureEnvelope, config: AblationConfig): FeatureEnvelope {
  let final_score = 0;

  if (config.blend_strategy === 'rrf') {
    final_score = computeRRFScore(envelope, config);
  } else if (config.blend_strategy === 'weighted_sum') {
    final_score = computeWeightedScore(envelope, config);
  }

  return {
    ...envelope,
    weighted_score: config.blend_strategy === 'weighted_sum' ? final_score : envelope.weighted_score,
    rrf_score: config.blend_strategy === 'rrf' ? final_score : envelope.rrf_score,
    ablation_config_id: config.id,
  };
}

// ============================================================================
// EXPORT: Type Guards & Validation
// ============================================================================

export function isValidFeatureEnvelope(data: unknown): data is FeatureEnvelope {
  try {
    FeatureEnvelopeSchema.parse(data);
    return true;
  } catch {
    return false;
  }
}

export function parseFeatureEnvelope(data: unknown): FeatureEnvelope | null {
  try {
    return FeatureEnvelopeSchema.parse(data);
  } catch {
    return null;
  }
}
