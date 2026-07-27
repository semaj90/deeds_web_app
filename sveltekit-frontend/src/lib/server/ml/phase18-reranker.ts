/**
 * Phase 18: XGBoost Reranker
 *
 * Inference wrapper for trained XGBoost ranking model.
 * Consumes Phase 17 extracted features and returns learned ranking score.
 *
 * Input: ExtractedFeatures from Phase 17
 * Output: rerank_score [0, 1]
 *
 * Phase 18 Status: Training phase (model training in progress)
 * Phase 19 Status: Inference integration (coming next)
 */

import type { ExtractedFeatures } from './phase17-schema';

// ══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ══════════════════════════════════════════════════════════════

export interface Phase18RerankerInput {
  packetKey: string;
  sourceRef: string;
  featureId: string;
  features: ExtractedFeatures;
}

export interface Phase18RerankerOutput {
  packetKey: string;
  rerankScore: number; // [0, 1]
  confidence: number; // [0, 1] — model confidence
  reason?: string; // Optional explanation
}

// ══════════════════════════════════════════════════════════════
// FEATURE TRANSFORMATION
// ══════════════════════════════════════════════════════════════

/**
 * Convert Phase 17 ExtractedFeatures to XGBoost feature vector
 * Returns 14-dimensional feature vector in model input order
 */
export function transformPhase17ToXGBoostFeatures(
  features: ExtractedFeatures
): number[] {
  // Feature order must match training dataset:
  // [qdrant_score, cluster_score, topological_score, fusion_score,
  //  authority_score, member_count, summary_length, source_ref_depth,
  //  is_core_library, is_test_file, has_packets, packet_count, avg_packet_authority]

  return [
    features.qdrant_score,
    features.cluster_score,
    features.topological_score,
    features.fusion_score,
    features.metadata.authority_score,
    features.metadata.member_count,
    features.metadata.summary_length,
    features.metadata.source_ref_depth,
    features.metadata.is_core_library ? 1 : 0,
    features.metadata.is_test_file ? 1 : 0,
    features.metadata.has_packets ? 1 : 0,
    features.metadata.packet_count,
    features.metadata.avg_packet_authority,
  ];
}

// ══════════════════════════════════════════════════════════════
// INFERENCE (Placeholder — waiting for Phase 18 training)
// ══════════════════════════════════════════════════════════════

/**
 * Predict ranking score for a packet using trained XGBoost model
 *
 * Phase 18 Status: Awaiting model training completion
 * Fallback: Returns Phase 17 authority_score as placeholder
 */
export async function predictRerankerScore(
  input: Phase18RerankerInput,
  modelPath?: string
): Promise<Phase18RerankerOutput> {
  try {
    // Convert Phase 17 features to XGBoost input format
    const xgbFeatures = transformPhase17ToXGBoostFeatures(input.features);

    // TODO: Phase 18 training produces model file (phase18_reranker.onnx or .json)
    // TODO: Load model at startup (cache in module scope)
    // TODO: Call model.predict(xgbFeatures) to get rerank_score

    // Placeholder: Return Phase 17 authority_score as fallback
    // (This ensures Phase 19 integration can proceed while Phase 18 trains)
    const fallbackScore = input.features.metadata.authority_score;

    return {
      packetKey: input.packetKey,
      rerankScore: fallbackScore,
      confidence: 0.5, // Placeholder confidence
      reason: '[Phase 18 Training In Progress] Using Phase 17 authority_score as fallback',
    };
  } catch (err) {
    // Inference error: return fallback
    console.error('[Phase18] Reranker inference failed:', err);

    return {
      packetKey: input.packetKey,
      rerankScore: input.features.metadata.authority_score,
      confidence: 0.0,
      reason: '[Phase 18 Error] Fallback to Phase 17 authority_score',
    };
  }
}

// ══════════════════════════════════════════════════════════════
// BATCH INFERENCE (for retrieval pipeline)
// ══════════════════════════════════════════════════════════════

/**
 * Rerank a batch of packets using Phase 18 model
 * Returns results sorted by rerankScore (descending)
 */
export async function rerankerBatch(
  inputs: Phase18RerankerInput[],
  modelPath?: string
): Promise<Phase18RerankerOutput[]> {
  const results = await Promise.all(
    inputs.map((input) => predictRerankerScore(input, modelPath))
  );

  // Sort by rerank_score descending
  return results.sort((a, b) => b.rerankScore - a.rerankScore);
}

// ══════════════════════════════════════════════════════════════
// RERANKER STATUS
// ══════════════════════════════════════════════════════════════

export interface RerankerStatus {
  phase: string;
  isReady: boolean;
  modelLoaded: boolean;
  fallbackActive: boolean;
  message: string;
}

export function getRerankerStatus(): RerankerStatus {
  return {
    phase: 'Phase 18 (Training)',
    isReady: false, // Awaiting model training
    modelLoaded: false,
    fallbackActive: true,
    message: 'Phase 18 XGBoost model training in progress. Using Phase 17 authority_score as fallback for Phase 19 integration.',
  };
}
