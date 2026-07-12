import { z } from 'zod';

/**
 * Gate 2: Autoencoder Provenance Validation Schema
 * Enforces 8 validation gates for latent vector quality & encoder trustworthiness
 */

// 8 validation gates (all must pass for encoder approval)
export const ValidationGateSchema = z.object({
  gate1_input_output_dims: z.object({
    passed: z.boolean(),
    input_dim: z.number().positive().optional(),
    output_dim: z.number().positive().optional(),
    note: z.string().optional(),
  }),
  gate2_finite_values: z.object({
    passed: z.boolean(),
    nan_count: z.number().nonnegative().optional(),
    inf_count: z.number().nonnegative().optional(),
    note: z.string().optional(),
  }),
  gate3_norm_distribution: z.object({
    passed: z.boolean(),
    mean_norm: z.number().optional(),
    std_norm: z.number().optional(),
    min_norm: z.number().optional(),
    max_norm: z.number().optional(),
    note: z.string().optional(),
  }),
  gate4_reconstruction_error: z.object({
    passed: z.boolean(),
    mse: z.number().nonnegative(),
    mae: z.number().nonnegative().optional(),
    threshold: z.number().nonnegative(),
    percentile_95: z.number().nonnegative().optional(),
    note: z.string().optional(),
  }),
  gate5_neighbor_preservation: z.object({
    passed: z.boolean(),
    spearman_correlation: z.number().min(-1).max(1).optional(),
    recall_at_k: z.record(z.string(), z.number()).optional(), // {"recall@10": 0.95, "recall@50": 0.90}
    threshold: z.number().optional(),
    note: z.string().optional(),
  }),
  gate6_cluster_stability: z.object({
    passed: z.boolean(),
    silhouette_score: z.number().min(-1).max(1).optional(),
    centroid_drift: z.number().nonnegative().optional(), // Max distance between AE centroid and original
    threshold: z.number().optional(),
    note: z.string().optional(),
  }),
  gate7_version_checkpoint: z.object({
    passed: z.boolean(),
    checkpoint_hash: z.string().optional(),
    expected_hash: z.string().optional(),
    note: z.string().optional(),
  }),
  gate8_training_metadata: z.object({
    passed: z.boolean(),
    model_id_set: z.boolean().optional(),
    trained_at_set: z.boolean().optional(),
    loss_values_set: z.boolean().optional(),
    normalization_params_set: z.boolean().optional(),
    note: z.string().optional(),
  }),
});

export type ValidationGate = z.infer<typeof ValidationGateSchema>;

// Encoder provenance (canonical source, from Postgres)
export const EncoderProvenanceSchema = z.object({
  id: z.number(),
  encoder_id: z.string().min(1).max(255),
  encoder_type: z.enum(['autoencoder', 'pca', 'vae', 'ae_mlp', 'ae_cnn']),
  input_dimension: z.number().int().positive(),
  output_dimension: z.number().int().positive(),

  // Training metadata
  model_id: z.string().min(1).max(255),
  checkpoint_hash: z.string().length(64), // SHA-256 hex
  trained_at: z.coerce.date(),
  training_duration_seconds: z.number().nonnegative().optional().nullable(),
  training_loss_final: z.number().optional().nullable(),
  validation_loss_final: z.number().optional().nullable(),

  // Normalization
  normalization: z.enum(['l2', 'minmax', 'zscore', 'none']),
  normalization_params: z.record(z.any()).optional().nullable(),

  // Reconstruction accuracy
  reconstruction_mse: z.number().nonnegative(),
  reconstruction_mae: z.number().nonnegative().optional().nullable(),
  reconstruction_percentile_95: z.number().nonnegative().optional().nullable(),

  // Validation gates
  validation_gates: z.record(z.any()), // JSONB from DB
  validation_passed: z.boolean(),
  validation_passed_at: z.coerce.date().optional().nullable(),

  // Status & lifecycle
  status: z.enum(['candidate', 'active', 'deprecated', 'archived']),
  approved_by: z.string().optional().nullable(),
  approved_at: z.coerce.date().optional().nullable(),

  // Version
  version: z.number().int().nonnegative(),
  previous_encoder_id: z.string().optional().nullable(),

  // Metadata
  notes: z.string().optional().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type EncoderProvenance = z.infer<typeof EncoderProvenanceSchema>;

// Latent vector validation result (per-chunk)
export const LatentVectorValidationResultSchema = z.object({
  chunk_id: z.string().uuid(),
  encoder_id: z.string().min(1),
  latent_vector: z.array(z.number()).length(64), // 64-dim vector
  validation_passed: z.boolean(),

  // Per-vector gate results (subset of encoder gates)
  gate2_finite_values: z.boolean(), // Vector has no NaN/Infinity
  gate3_norm: z.number().nonnegative(), // Vector norm
  gate4_reconstruction_ok: z.boolean(), // Reconstruction error OK
  gate5_neighbors_preserved: z.boolean(), // Neighbors match 768-dim

  validation_date: z.coerce.date(),
  validation_notes: z.string().optional(),
});

export type LatentVectorValidationResult = z.infer<typeof LatentVectorValidationResultSchema>;

// Summary statistics for encoder across all chunks using it
export const EncoderValidationSummarySchema = z.object({
  encoder_id: z.string(),
  total_packets: z.number().nonnegative(),
  packets_validated: z.number().nonnegative(),
  packets_invalid: z.number().nonnegative(),
  packets_unchecked: z.number().nonnegative(),
  validation_coverage_pct: z.number().min(0).max(100),
  encoder_status: z.enum(['candidate', 'active', 'deprecated', 'archived']),
  encoder_validation_passed: z.boolean(),
  last_validation_date: z.coerce.date().optional(),
});

export type EncoderValidationSummary = z.infer<typeof EncoderValidationSummarySchema>;

/**
 * Hardcoded validation thresholds (Phase 8.6 acceptance criteria)
 * These are the CRITICAL gates that must pass before encoder is approved
 */
export const ENCODER_VALIDATION_THRESHOLDS = {
  // Gate 1: Dimensions must match schema
  gate1_input_dim: 768,
  gate1_output_dim: 64,

  // Gate 2: No NaN/Infinity allowed (hard fail)
  gate2_max_nan_count: 0,
  gate2_max_inf_count: 0,

  // Gate 3: Norm distribution should not be degenerate
  gate3_min_norm_std: 0.001, // Must have some variation
  gate3_max_norm_std: 10.0, // But not extreme variation
  gate3_min_mean_norm: 0.1, // Shouldn't be all zeros
  gate3_max_mean_norm: 100.0, // Shouldn't be all huge

  // Gate 4: Reconstruction error (empirically tuned)
  gate4_max_reconstruction_mse: 0.05, // Phase 8.6 acceptance: MSE < 0.05
  gate4_max_reconstruction_mae: 0.1,
  gate4_max_reconstruction_p95: 0.2,

  // Gate 5: Neighbor preservation (semantic consistency)
  gate5_min_spearman_correlation: 0.70, // Correlate 768d neighbors with 64d neighbors
  gate5_min_recall_at_10: 0.80, // Top 10 neighbors should match 768d
  gate5_min_recall_at_50: 0.70, // Top 50 neighbors should mostly match

  // Gate 6: Cluster stability (structure preservation)
  gate6_min_silhouette_score: 0.3, // Minimal cluster quality
  gate6_max_centroid_drift: 0.1, // AE centroid shouldn't drift far from original

  // Gate 7: Checkpoint identity (non-negotiable)
  // Must match exact SHA-256 hash

  // Gate 8: All training metadata must be present
};

// Type-safe gate result
export type GateResult = {
  passed: boolean;
  details?: Record<string, any>;
  error?: string;
};

/**
 * Phase 8.6 Validation Summary
 * Reports which gates passed/failed and recommendation
 */
export const ValidationReportSchema = z.object({
  encoder_id: z.string(),
  validation_date: z.coerce.date(),

  // All 8 gates
  gates: z.object({
    gate1: z.object({ passed: z.boolean(), message: z.string().optional() }),
    gate2: z.object({ passed: z.boolean(), message: z.string().optional() }),
    gate3: z.object({ passed: z.boolean(), message: z.string().optional() }),
    gate4: z.object({ passed: z.boolean(), message: z.string().optional() }),
    gate5: z.object({ passed: z.boolean(), message: z.string().optional() }),
    gate6: z.object({ passed: z.boolean(), message: z.string().optional() }),
    gate7: z.object({ passed: z.boolean(), message: z.string().optional() }),
    gate8: z.object({ passed: z.boolean(), message: z.string().optional() }),
  }),

  // Overall decision
  all_gates_passed: z.boolean(),
  recommendation: z.enum(['approve', 'reject', 'needs_retraining', 'needs_investigation']),
  failure_reasons: z.array(z.string()),

  // Operational notes
  notes: z.string().optional(),
});

export type ValidationReport = z.infer<typeof ValidationReportSchema>;
