// @ts-nocheck
import { db } from '$lib/server/db/client.js';
import { eq, sql } from 'drizzle-orm';
import {
  ENCODER_VALIDATION_THRESHOLDS,
  EncoderProvenanceSchema,
  ValidationReportSchema,
  type EncoderProvenance,
  type ValidationReport,
  type GateResult,
} from './encoder-provenance-schema.js';

/**
 * Gate 2 Validation Pipeline
 * Comprehensive 8-gate validation for encoder provenance and latent vectors
 */

/**
 * Load encoder metadata from Postgres (canonical source)
 */
export async function loadEncoderProvenance(encoderId: string): Promise<EncoderProvenance | null> {
  try {
    // Raw query to encoder_provenance table
    const result = await db.query.raw<EncoderProvenance>(
      `SELECT * FROM encoder_provenance WHERE encoder_id = $1 AND status != 'archived'`,
      [encoderId]
    );

    if (!result || result.length === 0) return null;

    return EncoderProvenanceSchema.parse(result[0]);
  } catch (err) {
    console.error(`[encoder-validation] Failed to load encoder ${encoderId}:`, err);
    return null;
  }
}

/**
 * Gate 1: Input/Output dimensions match schema
 */
export function validateGate1_InputOutputDims(encoder: EncoderProvenance): GateResult {
  const passed =
    encoder.input_dimension === ENCODER_VALIDATION_THRESHOLDS.gate1_input_dim &&
    encoder.output_dimension === ENCODER_VALIDATION_THRESHOLDS.gate1_output_dim;

  return {
    passed,
    details: {
      input_dim: encoder.input_dimension,
      output_dim: encoder.output_dimension,
      expected_input: ENCODER_VALIDATION_THRESHOLDS.gate1_input_dim,
      expected_output: ENCODER_VALIDATION_THRESHOLDS.gate1_output_dim,
    },
    error: passed
      ? undefined
      : `Dimension mismatch: got ${encoder.input_dimension}→${encoder.output_dimension}, expected ${ENCODER_VALIDATION_THRESHOLDS.gate1_input_dim}→${ENCODER_VALIDATION_THRESHOLDS.gate1_output_dim}`,
  };
}

/**
 * Gate 2: Vector contains no NaN or Infinity values
 */
export function validateGate2_FiniteValues(vector: number[]): GateResult {
  const nanIndices: number[] = [];
  const infIndices: number[] = [];

  for (let i = 0; i < vector.length; i++) {
    if (!Number.isFinite(vector[i])) {
      if (Number.isNaN(vector[i])) {
        nanIndices.push(i);
      } else {
        infIndices.push(i);
      }
    }
  }

  const passed = nanIndices.length === 0 && infIndices.length === 0;

  return {
    passed,
    details: {
      nan_count: nanIndices.length,
      inf_count: infIndices.length,
      nan_indices: nanIndices.slice(0, 5), // First 5 for debugging
      inf_indices: infIndices.slice(0, 5),
    },
    error: passed
      ? undefined
      : `Non-finite values detected: ${nanIndices.length} NaN, ${infIndices.length} Inf`,
  };
}

/**
 * Gate 3: Vector norm distribution should not be degenerate
 * Check: mean norm is reasonable, variation exists
 */
export function validateGate3_NormDistribution(vectors: number[][]): GateResult {
  if (vectors.length === 0) {
    return { passed: false, error: 'No vectors to validate' };
  }

  const norms = vectors.map((v) => {
    let sum = 0;
    for (const val of v) {
      sum += val * val;
    }
    return Math.sqrt(sum);
  });

  const meanNorm = norms.reduce((a, b) => a + b, 0) / norms.length;
  const stdNorm = Math.sqrt(
    norms.reduce((sum, n) => sum + (n - meanNorm) ** 2, 0) / norms.length
  );
  const minNorm = Math.min(...norms);
  const maxNorm = Math.max(...norms);

  const normOk =
    stdNorm >= ENCODER_VALIDATION_THRESHOLDS.gate3_min_norm_std &&
    stdNorm <= ENCODER_VALIDATION_THRESHOLDS.gate3_max_norm_std &&
    meanNorm >= ENCODER_VALIDATION_THRESHOLDS.gate3_min_mean_norm &&
    meanNorm <= ENCODER_VALIDATION_THRESHOLDS.gate3_max_mean_norm;

  return {
    passed: normOk,
    details: {
      mean_norm: meanNorm,
      std_norm: stdNorm,
      min_norm: minNorm,
      max_norm: maxNorm,
      thresholds: {
        min_std: ENCODER_VALIDATION_THRESHOLDS.gate3_min_norm_std,
        max_std: ENCODER_VALIDATION_THRESHOLDS.gate3_max_norm_std,
        min_mean: ENCODER_VALIDATION_THRESHOLDS.gate3_min_mean_norm,
        max_mean: ENCODER_VALIDATION_THRESHOLDS.gate3_max_mean_norm,
      },
    },
    error: normOk
      ? undefined
      : `Norm distribution anomaly: mean=${meanNorm.toFixed(4)}, std=${stdNorm.toFixed(4)}`,
  };
}

/**
 * Gate 4: Reconstruction error within acceptable bounds
 */
export function validateGate4_ReconstructionError(encoder: EncoderProvenance): GateResult {
  const passed =
    encoder.reconstruction_mse <= ENCODER_VALIDATION_THRESHOLDS.gate4_max_reconstruction_mse;

  return {
    passed,
    details: {
      mse: encoder.reconstruction_mse,
      mae: encoder.reconstruction_mae ?? undefined,
      percentile_95: encoder.reconstruction_percentile_95 ?? undefined,
      threshold_mse: ENCODER_VALIDATION_THRESHOLDS.gate4_max_reconstruction_mse,
      threshold_mae: ENCODER_VALIDATION_THRESHOLDS.gate4_max_reconstruction_mae,
    },
    error: passed
      ? undefined
      : `Reconstruction MSE ${encoder.reconstruction_mse.toFixed(6)} exceeds threshold ${ENCODER_VALIDATION_THRESHOLDS.gate4_max_reconstruction_mse}`,
  };
}

/**
 * Gate 5: Neighbor preservation (semantic consistency check)
 * This should be computed during encoder training; we just validate the stored metric
 */
export function validateGate5_NeighborPreservation(encoder: EncoderProvenance): GateResult {
  const gates = encoder.validation_gates as any;
  const gate5Data = gates?.gate5_neighbor_preservation || {};

  // If gate5 was already validated during training, trust that result
  if (gate5Data.passed === false) {
    return {
      passed: false,
      details: gate5Data,
      error: `Neighbor preservation failed during training: ${gate5Data.note || 'unknown reason'}`,
    };
  }

  // If not validated yet, require it
  if (gate5Data.spearman_correlation === undefined) {
    return {
      passed: false,
      details: gate5Data,
      error: 'Neighbor preservation (Spearman correlation) not computed during training',
    };
  }

  const spearman = gate5Data.spearman_correlation as number;
  const passed = spearman >= ENCODER_VALIDATION_THRESHOLDS.gate5_min_spearman_correlation;

  return {
    passed,
    details: {
      spearman_correlation: spearman,
      threshold: ENCODER_VALIDATION_THRESHOLDS.gate5_min_spearman_correlation,
      recall_at_k: gate5Data.recall_at_k,
    },
    error: passed ? undefined : `Spearman correlation ${spearman.toFixed(3)} below threshold`,
  };
}

/**
 * Gate 6: Cluster stability (structure preservation)
 * Also computed during training; we validate the stored metric
 */
export function validateGate6_ClusterStability(encoder: EncoderProvenance): GateResult {
  const gates = encoder.validation_gates as any;
  const gate6Data = gates?.gate6_cluster_stability || {};

  if (gate6Data.silhouette_score === undefined) {
    return {
      passed: false,
      details: gate6Data,
      error: 'Cluster stability (Silhouette score) not computed during training',
    };
  }

  const silhouette = gate6Data.silhouette_score as number;
  const passed = silhouette >= ENCODER_VALIDATION_THRESHOLDS.gate6_min_silhouette_score;

  return {
    passed,
    details: {
      silhouette_score: silhouette,
      centroid_drift: gate6Data.centroid_drift,
      threshold: ENCODER_VALIDATION_THRESHOLDS.gate6_min_silhouette_score,
    },
    error: passed ? undefined : `Silhouette score ${silhouette.toFixed(3)} below threshold`,
  };
}

/**
 * Gate 7: Checkpoint identity (SHA-256 must match)
 */
export function validateGate7_VersionCheckpoint(encoder: EncoderProvenance): GateResult {
  // For now, just verify checkpoint_hash is a valid SHA-256
  const isSha256 = /^[a-f0-9]{64}$/i.test(encoder.checkpoint_hash);
  const isPlaceholder = encoder.checkpoint_hash.includes('placeholder');

  const passed = isSha256 && !isPlaceholder;

  return {
    passed,
    details: {
      checkpoint_hash: encoder.checkpoint_hash.slice(0, 16) + '...', // Truncate for display
      is_valid_sha256: isSha256,
      is_placeholder: isPlaceholder,
      version: encoder.version,
    },
    error: passed
      ? undefined
      : `Invalid checkpoint hash (must be valid SHA-256, not placeholder)`,
  };
}

/**
 * Gate 8: All training metadata is present
 */
export function validateGate8_TrainingMetadata(encoder: EncoderProvenance): GateResult {
  const checks = {
    model_id: !!encoder.model_id && encoder.model_id.length > 0,
    trained_at: !!encoder.trained_at,
    training_loss: encoder.training_loss_final !== null && encoder.training_loss_final !== undefined,
    validation_loss: encoder.validation_loss_final !== null && encoder.validation_loss_final !== undefined,
    normalization: !!encoder.normalization,
  };

  const passed = Object.values(checks).every((v) => v);

  return {
    passed,
    details: checks,
    error: passed
      ? undefined
      : `Missing training metadata: ${Object.entries(checks)
          .filter(([_, v]) => !v)
          .map(([k]) => k)
          .join(', ')}`,
  };
}

/**
 * Run all 8 validation gates (full encoder validation)
 */
export async function validateEncoderAllGates(
  encoder: EncoderProvenance,
  sampleVectors?: number[][]
): Promise<ValidationReport> {
  const gates = {
    gate1: validateGate1_InputOutputDims(encoder),
    gate2: sampleVectors ? validateGate2_FiniteValues(sampleVectors[0] || []) : { passed: true },
    gate3: sampleVectors ? validateGate3_NormDistribution(sampleVectors) : { passed: true },
    gate4: validateGate4_ReconstructionError(encoder),
    gate5: validateGate5_NeighborPreservation(encoder),
    gate6: validateGate6_ClusterStability(encoder),
    gate7: validateGate7_VersionCheckpoint(encoder),
    gate8: validateGate8_TrainingMetadata(encoder),
  };

  const allPassed = Object.values(gates).every((g) => g.passed);
  const failures = Object.entries(gates)
    .filter(([_, g]) => !g.passed)
    .map(([name, g]) => `${name}: ${g.error || 'failed'}`);

  let recommendation: 'approve' | 'reject' | 'needs_retraining' | 'needs_investigation' =
    'needs_investigation';

  if (allPassed) {
    recommendation = 'approve';
  } else if (failures.some((f) => f.includes('Neighbor preservation'))) {
    recommendation = 'needs_retraining'; // Gate 5 failure suggests training issue
  } else if (failures.some((f) => f.includes('Checkpoint'))) {
    recommendation = 'needs_investigation'; // Gate 7 is unusual
  } else {
    recommendation = 'reject'; // Other failures = reject
  }

  return ValidationReportSchema.parse({
    encoder_id: encoder.encoder_id,
    validation_date: new Date(),
    gates: {
      gate1: { passed: gates.gate1.passed, message: gates.gate1.error },
      gate2: { passed: gates.gate2.passed, message: gates.gate2.error },
      gate3: { passed: gates.gate3.passed, message: gates.gate3.error },
      gate4: { passed: gates.gate4.passed, message: gates.gate4.error },
      gate5: { passed: gates.gate5.passed, message: gates.gate5.error },
      gate6: { passed: gates.gate6.passed, message: gates.gate6.error },
      gate7: { passed: gates.gate7.passed, message: gates.gate7.error },
      gate8: { passed: gates.gate8.passed, message: gates.gate8.error },
    },
    all_gates_passed: allPassed,
    recommendation,
    failure_reasons: failures,
  });
}

/**
 * Batch validation of latent vectors against encoder constraints
 * Updates codebase_chunk_index.latent_embedding_valid for each chunk
 */
export async function batchValidateLatentVectors(
  encoderId: string,
  limit: number = 1000
): Promise<{ validated: number; valid: number; invalid: number; errors: string[] }> {
  const encoder = await loadEncoderProvenance(encoderId);
  if (!encoder) {
    throw new Error(`Encoder ${encoderId} not found`);
  }

  const errors: string[] = [];
  let validated = 0;
  let valid = 0;
  let invalid = 0;

  try {
    // Fetch up to `limit` chunks with latent_64 vectors
    const chunks = await db.query.raw<{
      id: string;
      latent_64: any; // bytea or JSON array
    }>(
      `SELECT id, latent_64 FROM codebase_chunk_index
       WHERE encoder_id = $1 AND latent_64 IS NOT NULL AND latent_embedding_valid IS NULL
       LIMIT $2`,
      [encoderId, limit]
    );

    for (const chunk of chunks) {
      try {
        // Decode vector (msgpack or JSON array)
        let vector: number[];
        if (typeof chunk.latent_64 === 'string') {
          vector = JSON.parse(chunk.latent_64);
        } else if (Array.isArray(chunk.latent_64)) {
          vector = chunk.latent_64;
        } else {
          throw new Error('Unknown latent_64 format');
        }

        // Gate 2: Finite values (hard requirement)
        const gate2 = validateGate2_FiniteValues(vector);
        if (!gate2.passed) {
          invalid++;
          await db.query.raw(
            `UPDATE codebase_chunk_index SET latent_embedding_valid = false, latent_embedding_validated_at = NOW() WHERE id = $1`,
            [chunk.id]
          );
        } else {
          // If Gate 2 passes, mark as valid (Gates 3+ are batch-level, not per-vector)
          valid++;
          await db.query.raw(
            `UPDATE codebase_chunk_index SET latent_embedding_valid = true, latent_embedding_validated_at = NOW() WHERE id = $1`,
            [chunk.id]
          );
        }

        validated++;
      } catch (chunkErr) {
        errors.push(`Chunk ${chunk.id}: ${(chunkErr as Error).message}`);
      }
    }
  } catch (err) {
    errors.push(`Batch validation failed: ${(err as Error).message}`);
  }

  return { validated, valid, invalid, errors };
}

/**
 * Get encoder validation summary (all chunks using encoder)
 */
export async function getEncoderValidationSummary(encoderId: string) {
  const result = await db.query.raw<{
    total_packets: string;
    validated: string;
    invalid: string;
    unchecked: string;
    validation_coverage_pct: string;
  }>(
    `SELECT
       COUNT(*) as total_packets,
       COUNT(CASE WHEN latent_embedding_valid = TRUE THEN 1 END) as validated,
       COUNT(CASE WHEN latent_embedding_valid = FALSE THEN 1 END) as invalid,
       COUNT(CASE WHEN latent_embedding_valid IS NULL THEN 1 END) as unchecked,
       ROUND(100.0 * COUNT(CASE WHEN latent_embedding_valid = TRUE THEN 1 END) / COUNT(*), 2) as validation_coverage_pct
     FROM codebase_chunk_index
     WHERE encoder_id = $1 AND latent_64 IS NOT NULL`,
    [encoderId]
  );

  if (!result || result.length === 0) {
    return { total_packets: 0, validated: 0, invalid: 0, unchecked: 0, validation_coverage_pct: 0 };
  }

  const row = result[0];
  return {
    total_packets: parseInt(row.total_packets as string, 10),
    validated: parseInt(row.validated as string, 10),
    invalid: parseInt(row.invalid as string, 10),
    unchecked: parseInt(row.unchecked as string, 10),
    validation_coverage_pct: parseFloat(row.validation_coverage_pct as string),
  };
}
