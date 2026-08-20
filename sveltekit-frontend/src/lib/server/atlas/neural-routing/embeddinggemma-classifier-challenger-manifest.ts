import type { EncoderTrainingManifestV1 } from './encoder-manifest.js';

/**
 * Challenger only: does not replace DEFAULT_INTENT_ENCODER_MANIFEST until
 * classifier-specific MRL/calibration metrics pass. Classification embeddings
 * share the EmbeddingGemma model artifact with retrieval embeddings but use a
 * distinct task prompt and representation identity.
 */
export const EMBEDDINGGEMMA_INTENT_CLASSIFIER_CHALLENGER_MANIFEST: EncoderTrainingManifestV1 & {
  nativeRepresentationId: 'classification_768';
  preferredRouterRepresentationId: 'classification_mrl_128';
  mrlDimensions: readonly [128, 256, 512, 768];
  persistedSemanticAuthorityChanged: false;
  canonicalDefaultChanged: false;
} = {
  schemaVersion: 'atlas.encoder-training-manifest.v1',
  encoderId: 'parent-atlas-intent-domain-embeddinggemma-challenger-v1',
  task: 'intent_domain_classifier',
  baseModel: 'google/embeddinggemma-300m',
  adaptation: 'lora',
  trainSplitRevision: 'UNBOUND',
  validationSplitRevision: 'UNBOUND',
  featureContractRevision: 'atlas.retrieval-router-tensor.v1',
  toolRegistryRevision: 'UNBOUND',
  maxSequenceLength: 512,
  batchSize: 16,
  gradientAccumulationSteps: 2,
  precision: 'fp16',
  targetModules: [],
  rankBudget: 32,
  quantization: 'none',
  metrics: ['tool_recall_at_1', 'tool_recall_at_3', 'tool_recall_at_5', 'mrr', 'ndcg_at_5', 'execution_success_at_k', 'ece', 'brier'],
  promotionGates: {
    minToolRecallAt5: 0.98,
    minExecutionSuccessAtK: 0.95,
    maxEce: 0.05,
    maxRegressionRate: 0.02,
  },
  nativeRepresentationId: 'classification_768',
  preferredRouterRepresentationId: 'classification_mrl_128',
  mrlDimensions: [128, 256, 512, 768],
  persistedSemanticAuthorityChanged: false,
  canonicalDefaultChanged: false,
};
