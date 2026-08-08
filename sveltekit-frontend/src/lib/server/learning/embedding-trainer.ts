/**
 * Embedding Trainer — Separate retrieval learning from policy learning
 *
 * Supports multiple embedding training frameworks interchangeably:
 * - SentenceTransformers (frozen head, contrastive, Matryoshka)
 * - Quaterion (similarity learning with caching, small data support)
 *
 * Derives retrieval labels from execution evidence:
 * - Positive: query positive, hard negative (current index ranked highly but execution failed)
 * - Negative: arbitrary random negatives
 *
 * Architecture:
 *   EmbeddingTrainer (interchangeable)
 *     -> SentenceTransformers
 *     -> Quaterion
 *     -> Custom PyTorch
 *
 * Training data must answer: Which representation actually caused this successful run?
 */

export type EmbeddingTrainerType =
  | 'sentence_transformers'
  | 'quaterion'
  | 'custom_pytorch';

export interface EmbeddingTrainingPair {
  anchor_id: string;
  negative_id: string;
  score: number; // 0.0 to 1.0
  label_type: 'positive' | 'hard_negative' | 'weak_positive' | 'negative';
  evidence: {
    query_id: string;
    source_revisions: string[];
    successful_runs: number;
    failed_runs: number;
  };
}

export interface EmbeddingTrainerConfig {
  type: EmbeddingTrainerType;
  model_name: string;
  device: string;
  batch_size: number;
  learning_rate: number;
  epochs: number;
  // Matryoshka projection dimensions
  projection_dims: number[];
  // Caching for small data support
  cache_dir?: string;
  // Training data source
  data_source: 'agent_runs' | 'manual' | 'synthetic';
}

export interface EmbeddingTrainerStats {
  total_pairs: number;
  positive_pairs: number;
  hard_negative_pairs: number;
  weak_positive_pairs: number;
  negative_pairs: number;
  training_loss: number;
  validation_loss: number;
  evaluation_mrr: number;
  evaluation_recall_at_10: number;
  evaluation_recall_at_50: number;
  evaluation_ndcg_at_10: number;
  evaluation_ndcg_at_50: number;
  hard_negative_separation: number;
}

/**
 * Create an embedding trainer instance
 */
export function createEmbeddingTrainer(config: EmbeddingTrainerConfig) {
  return {
    config,
    stats: null as EmbeddingTrainerStats | null,
    train: async (data: EmbeddingTrainingPair[]) => {
      // Implementation depends on trainer type
      throw new Error('EmbeddingTrainer.train() not implemented - use specific trainer implementation');
    },
    validate: async () => {
      // Validate training data quality
      throw new Error('EmbeddingTrainer.validate() not implemented - use specific trainer implementation');
    },
    evaluate: async (test_set: EmbeddingTrainingPair[]) => {
      // Evaluate on test set
      throw new Error('EmbeddingTrainer.evaluate() not implemented - use specific trainer implementation');
    },
  };
}

/**
 * Generate retrieval labels from execution evidence
 *
 * Examples:
 *   y = {
 *     packet_A: { packet_B: 0.95, packet_C: 0.07, packet_D: 0.85 }
 *   }
 *
 * Labels:
 *   - RelationshipSimilarity: 1.0 (same exact implementation)
 *   - same_exact_implementation: 1.00
 *   - same_successful_repair_pattern: 0.95
 *   - same_bug_mechanism: 0.90
 *   - related_framework_operation: 0.85
 *   - vocabulary_similar_but_behavior_differs: 0.65
 *   - contradictory_function: 0.20
 *   - 0.00
 */
export function generateRetrievalLabels(
  query_id: string,
  candidates: Array<{
    packet_key: string;
    source_ref: string;
    score: number;
    evidence: {
      successful_runs: number;
      failed_runs: number;
      co_success: number;
    };
  }>
): Record<string, number> {
  const labels: Record<string, number> = {};

  for (const candidate of candidates) {
    const { packet_key, source_ref, score, evidence } = candidate;

    // Calculate co-success rate
    const totalRuns = evidence.successful_runs + evidence.failed_runs;
    const coSuccessRate = totalRuns > 0 ? evidence.successful_runs / totalRuns : 0;

    // Assign label based on evidence
    if (coSuccessRate >= 0.9) {
      labels[packet_key] = 1.0; // same exact implementation
    } else if (coSuccessRate >= 0.7) {
      labels[packet_key] = 0.95; // same successful repair pattern
    } else if (coSuccessRate >= 0.5) {
      labels[packet_key] = 0.90; // same bug mechanism
    } else if (coSuccessRate >= 0.3) {
      labels[packet_key] = 0.85; // related framework operation
    } else if (coSuccessRate > 0) {
      labels[packet_key] = 0.65; // vocabulary similar but behavior differs
    } else {
      labels[packet_key] = score; // Use original score for contradictory
    }
  }

  return labels;
}

/**
 * Generate hard negatives from failed runs
 *
 * Powerful negatives are things your current index ranked highly
 * that execution proved were wrong. Much better than arbitrary random negatives.
 */
export function generateHardNegatives(
  _query_id: string,
  candidates: Array<{
    packet_key: string;
    source_ref: string;
    score: number;
    evidence: {
      successful_runs: number;
      failed_runs: number;
    };
  }>
): Array<{
  packet_key: string;
  source_ref: string;
  score: number;
  reason: 'hard_negative' | 'weak_positive' | 'negative';
}> {
  const hardNegatives: Array<{
    packet_key: string;
    source_ref: string;
    score: number;
    reason: 'hard_negative' | 'weak_positive' | 'negative';
  }> = [];

  for (const candidate of candidates) {
    const { packet_key, source_ref, score, evidence } = candidate;

    if (evidence.failed_runs > 0 && evidence.successful_runs === 0) {
      hardNegatives.push({
        packet_key,
        source_ref,
        score,
        reason: 'hard_negative',
      });
    } else if (evidence.failed_runs > evidence.successful_runs) {
      hardNegatives.push({
        packet_key,
        source_ref,
        score,
        reason: 'weak_positive',
      });
    } else {
      hardNegatives.push({
        packet_key,
        source_ref,
        score,
        reason: 'negative',
      });
    }
  }

  return hardNegatives;
}
