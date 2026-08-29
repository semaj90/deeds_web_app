import { z } from 'zod';

export const EMBEDDING_MODEL_MANIFEST_SCHEMA_V1 = 'atlas.embedding-model-manifest.v1' as const;

export const EmbeddingModelManifestV1Schema = z.object({
  schema: z.literal(EMBEDDING_MODEL_MANIFEST_SCHEMA_V1),
  modelId: z.string().min(1),
  modelRevision: z.string().min(1),
  modelChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  tokenizerRevision: z.string().min(1),
  tokenizerChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i).nullable(),
  representationId: z.literal('semantic_768'),
  dimensions: z.literal(768),
  metric: z.literal('COSINE'),
  pooling: z.literal('MEAN'),
  normalization: z.literal('L2'),
  maxInputTokens: z.number().int().positive().max(2048),
  promptRevision: z.string().min(1),
  supportedRoles: z.array(z.enum([
    'RETRIEVAL_QUERY', 'RETRIEVAL_DOCUMENT', 'CODE_RETRIEVAL_QUERY',
    'CLASSIFICATION_QUERY', 'CLUSTERING_QUERY',
  ])).min(1),
  canonicalWriter: z.enum(['OLLAMA', 'UNRESOLVED']),
  executorIds: z.array(z.enum([
    'OLLAMA', 'ONNX_DIRECTML', 'ONNX_WEBGPU', 'FASTEMBED_CUDA', 'PYTORCH_CUDA',
  ])).min(1),
  canonicalAuthority: z.literal(false),
}).strict();

export type EmbeddingModelManifestV1 = z.infer<typeof EmbeddingModelManifestV1Schema>;
