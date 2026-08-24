import { z } from 'zod';

export const EmbeddingGemmaExecutorReceiptV1Schema = z.object({
  schema: z.literal('atlas.embeddinggemma-executor-receipt.v1'),
  modelId: z.literal('google/embeddinggemma-300m'),
  modelRevision: z.string().min(1),
  artifactPath: z.string().min(1),
  artifactChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  artifactSizeBytes: z.number().int().positive(),
  executor: z.enum(['llama.cpp', 'sentence-transformers', 'onnxruntime', 'fastembed']),
  executorRevision: z.string().min(1),
  backend: z.enum(['CUDA', 'CPU', 'DIRECTML']),
  quantization: z.enum(['F32', 'F16', 'BF16', 'Q8_0', 'Q4_0', 'OTHER']),
  nativeDimension: z.literal(768),
  pooling: z.literal('MEAN'),
  normalization: z.literal('L2'),
  maxInputTokens: z.number().int().positive().max(2048),
  retrievalQueryPromptRevision: z.string().min(1),
  codeQueryPromptRevision: z.string().min(1),
  documentPromptRevision: z.string().min(1),
  classificationPromptRevision: z.string().min(1),
  finiteOutputPass: z.boolean(),
  nativeDimensionPass: z.boolean(),
  normErrorMax: z.number().finite().min(0),
  repeatedRequestStable: z.boolean(),
  coldWarmStable: z.boolean(),
  referenceExecutor: z.string().min(1).nullable(),
  cosineParity: z.number().finite().min(-1).max(1).nullable(),
  recallAt10: z.number().finite().min(0).max(1).nullable(),
  recallAt50: z.number().finite().min(0).max(1).nullable(),
  recallAt100: z.number().finite().min(0).max(1).nullable(),
  projectedRepresentations: z.array(z.enum([
    'retrieval_query_768',
    'retrieval_query_mrl_512',
    'retrieval_query_mrl_256',
    'retrieval_query_mrl_128',
    'code_query_768',
    'code_query_mrl_512',
    'code_query_mrl_256',
    'code_query_mrl_128',
    'classification_768',
    'classification_mrl_512',
    'classification_mrl_256',
    'classification_mrl_128',
  ])).min(1),
  persistedRepresentationAuthority: z.enum([
    'semantic_768',
    'semantic_mrl_512',
    'semantic_mrl_256',
    'semantic_mrl_128',
    'semantic_512',
    'UNRESOLVED',
  ]),
  persistenceAuthoritySource: z.string().min(1),
  canonicalDefaultChanged: z.literal(false),
  qdrantWritesPerformed: z.literal(false),
  postgresWritesPerformed: z.literal(false),
  createdAt: z.string().datetime(),
}).strict();

export type EmbeddingGemmaExecutorReceiptV1 = z.infer<typeof EmbeddingGemmaExecutorReceiptV1Schema>;

export function executorReceiptReadyForParity(receipt: EmbeddingGemmaExecutorReceiptV1): boolean {
  const parsed = EmbeddingGemmaExecutorReceiptV1Schema.parse(receipt);
  return parsed.finiteOutputPass
    && parsed.nativeDimensionPass
    && parsed.normErrorMax <= 1e-4
    && parsed.repeatedRequestStable
    && parsed.coldWarmStable;
}
