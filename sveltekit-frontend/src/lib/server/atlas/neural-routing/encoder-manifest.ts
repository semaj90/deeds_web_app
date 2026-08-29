import { z } from 'zod';

export const EncoderTrainingManifestV1Schema = z.object({
  schemaVersion: z.literal('atlas.encoder-training-manifest.v1'),
  encoderId: z.string().min(1),
  task: z.enum(['intent_domain_classifier', 'tool_cross_encoder']),
  baseModel: z.string().min(1),
  adaptation: z.enum(['full_finetune', 'lora', 'adalora', 'qlora']),
  trainSplitRevision: z.string().min(1),
  validationSplitRevision: z.string().min(1),
  featureContractRevision: z.string().min(1),
  toolRegistryRevision: z.string().min(1),
  maxSequenceLength: z.number().int().positive(),
  batchSize: z.number().int().positive(),
  gradientAccumulationSteps: z.number().int().positive(),
  precision: z.enum(['fp32', 'fp16', 'bf16']),
  targetModules: z.array(z.string()).default([]),
  rankBudget: z.number().int().nonnegative().nullable(),
  quantization: z.enum(['none', 'int8', 'nf4']).default('none'),
  metrics: z.array(z.enum([
    'tool_recall_at_1',
    'tool_recall_at_3',
    'tool_recall_at_5',
    'mrr',
    'ndcg_at_5',
    'execution_success_at_k',
    'ece',
    'brier',
  ])).min(1),
  promotionGates: z.object({
    minToolRecallAt5: z.number().min(0).max(1),
    minExecutionSuccessAtK: z.number().min(0).max(1),
    maxEce: z.number().min(0).max(1),
    maxRegressionRate: z.number().min(0).max(1),
  }).strict(),
}).strict();

export type EncoderTrainingManifestV1 = z.infer<typeof EncoderTrainingManifestV1Schema>;

/**
 * EmbeddingGemma classification encoder. It produces classification features,
 * not canonical retrieval vectors or semantic Qdrant writes.
 */
export const DEFAULT_INTENT_ENCODER_MANIFEST: EncoderTrainingManifestV1 = EncoderTrainingManifestV1Schema.parse({
  schemaVersion: 'atlas.encoder-training-manifest.v1',
  encoderId: 'parent-atlas-intent-domain-v1',
  task: 'intent_domain_classifier',
  baseModel: 'google/embeddinggemma-300m',
  adaptation: 'lora',
  trainSplitRevision: 'UNBOUND',
  validationSplitRevision: 'UNBOUND',
  featureContractRevision: 'atlas.candidate-feature-matrix.v1',
  toolRegistryRevision: 'UNBOUND',
  maxSequenceLength: 2048,
  batchSize: 32,
  gradientAccumulationSteps: 1,
  precision: 'fp32',
  targetModules: [],
  rankBudget: 32,
  quantization: 'none',
  metrics: ['tool_recall_at_1', 'tool_recall_at_3', 'tool_recall_at_5', 'ece', 'brier'],
  promotionGates: {
    minToolRecallAt5: 0.98,
    minExecutionSuccessAtK: 0.95,
    maxEce: 0.05,
    maxRegressionRate: 0.02,
  },
});

/**
 * Cross-encoder remains a separate joint query-document task. Dense MRL
 * embeddings are not a functional substitute; promotion requires its own
 * reranker evaluation/license gate.
 */
export const DEFAULT_TOOL_CROSS_ENCODER_MANIFEST: EncoderTrainingManifestV1 = EncoderTrainingManifestV1Schema.parse({
  schemaVersion: 'atlas.encoder-training-manifest.v1',
  encoderId: 'parent-atlas-tool-cross-encoder-v1',
  task: 'tool_cross_encoder',
  baseModel: 'mixedbread-ai/mxbai-rerank-base-v2',
  adaptation: 'lora',
  trainSplitRevision: 'UNBOUND',
  validationSplitRevision: 'UNBOUND',
  featureContractRevision: 'atlas.candidate-feature-matrix.v1',
  toolRegistryRevision: 'UNBOUND',
  maxSequenceLength: 384,
  batchSize: 16,
  gradientAccumulationSteps: 2,
  precision: 'fp16',
  targetModules: [],
  rankBudget: 32,
  quantization: 'none',
  metrics: ['tool_recall_at_1', 'tool_recall_at_3', 'tool_recall_at_5', 'mrr', 'ndcg_at_5', 'execution_success_at_k', 'ece'],
  promotionGates: {
    minToolRecallAt5: 0.99,
    minExecutionSuccessAtK: 0.97,
    maxEce: 0.05,
    maxRegressionRate: 0.02,
  },
});

export const QueryRouterTrainingManifestV1Schema = z.object({
  schemaVersion: z.literal('atlas.query-router-training-manifest.v1'),
  routerId: z.literal('parent-atlas-query-router-v1'),
  status: z.enum(['IMPLEMENTED_UNPROVEN', 'SHADOW', 'PROVEN', 'PROMOTED']),
  embedding: z.object({
    modelId: z.literal('google/embeddinggemma-300m'),
    promptMode: z.literal('classification'),
    promptRevision: z.literal('embeddinggemma-classification-prompt-google-model-card-v1'),
    sourceRepresentationId: z.literal('classification_768'),
    representationId: z.literal('classification_mrl_128'),
    sourceDimension: z.literal(768),
    dimension: z.literal(128),
    projectionMethod: z.literal('MRL_PREFIX_TRUNCATE_L2'),
  }).strict(),
  deterministicFeatureRevision: z.literal('atlas.query-feature-projection.v1'),
  tensorRevision: z.literal('atlas.query-router-tensor.v1'),
  tensorDimension: z.literal(154),
  framework: z.literal('pytorch'),
  architectureRevision: z.literal('atlas.query-router-mlp.v1'),
  outputs: z.array(z.enum(['domain', 'operation', 'retrieval_needs', 'budget'])).length(4),
  trainSplitRevision: z.string().min(1),
  validationSplitRevision: z.string().min(1),
  seed: z.number().int().nonnegative(),
  evidenceAuthority: z.literal(false),
  canonicalOwnerChanged: z.literal(false),
}).strict();

export type QueryRouterTrainingManifestV1 = z.infer<typeof QueryRouterTrainingManifestV1Schema>;

export const DEFAULT_QUERY_ROUTER_TRAINING_MANIFEST: QueryRouterTrainingManifestV1 =
  QueryRouterTrainingManifestV1Schema.parse({
    schemaVersion: 'atlas.query-router-training-manifest.v1',
    routerId: 'parent-atlas-query-router-v1',
    status: 'IMPLEMENTED_UNPROVEN',
    embedding: {
      modelId: 'google/embeddinggemma-300m',
      promptMode: 'classification',
      promptRevision: 'embeddinggemma-classification-prompt-google-model-card-v1',
      sourceRepresentationId: 'classification_768',
      representationId: 'classification_mrl_128',
      sourceDimension: 768,
      dimension: 128,
      projectionMethod: 'MRL_PREFIX_TRUNCATE_L2',
    },
    deterministicFeatureRevision: 'atlas.query-feature-projection.v1',
    tensorRevision: 'atlas.query-router-tensor.v1',
    tensorDimension: 154,
    framework: 'pytorch',
    architectureRevision: 'atlas.query-router-mlp.v1',
    outputs: ['domain', 'operation', 'retrieval_needs', 'budget'],
    trainSplitRevision: 'UNBOUND',
    validationSplitRevision: 'UNBOUND',
    seed: 42,
    evidenceAuthority: false,
    canonicalOwnerChanged: false,
  });
