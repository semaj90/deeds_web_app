import { z } from 'zod';

export const RetrievalExecutorAlignmentV1Schema = z.object({
  schema: z.literal('atlas.retrieval-executor-alignment.v1'),
  logicalLane: z.literal('semantic_768'),
  canonicalCollection: z.literal('codebase_chunks_768_v2'),
  canonicalVector: z.literal('content'),
  dimension: z.literal(768),
  distance: z.literal('Cosine'),
  normalization: z.literal('L2'),
  requiredPayloadFields: z.array(z.string().min(1)).min(1),
  recommendedPayloadIndexes: z.array(z.string().min(1)),
  quantization: z.object({
    canonicalStorage: z.literal('FP32'),
    qdrant: z.enum(['UNPROVEN', 'SCALAR_OPTIONAL', 'PRODUCT_OPTIONAL']),
    turbovec: z.enum(['UNPROVEN', 'CHALLENGER_4BIT', 'CHALLENGER_2BIT']),
    diskannVamana: z.enum(['UNPROVEN', 'CHALLENGER_DISK_BACKED']),
  }),
  executors: z.array(z.object({
    id: z.enum(['qdrant_hnsw', 'cuvs_brute_force', 'cuvs_cagra', 'turbovec', 'diskann_vamana']),
    role: z.enum(['PERSISTENT_SERVING', 'EXACT_ORACLE', 'GPU_CHALLENGER', 'CPU_CHALLENGER', 'SSD_CHALLENGER']),
    addsFusionVote: z.literal(false),
    ownsCanonicalIdentity: z.literal(false),
    requiresOrdinalMap: z.literal(true),
  })).min(1),
  rtxGpu: z.object({
    deviceClass: z.literal('RTX_3060_TI_8GB'),
    materialization: z.literal('ORDINAL_GATHER_ONLY'),
    rawVectorsOverRpc: z.literal(false),
    devicePointersOverRpc: z.literal(false),
    gpuPeakBytes: z.literal('NOT_PROVEN'),
  }),
  canonicalWritesAllowed: z.literal(false),
});

export type RetrievalExecutorAlignmentV1 = z.infer<typeof RetrievalExecutorAlignmentV1Schema>;

export function buildRetrievalExecutorAlignmentV1(): RetrievalExecutorAlignmentV1 {
  return RetrievalExecutorAlignmentV1Schema.parse({
    schema: 'atlas.retrieval-executor-alignment.v1',
    logicalLane: 'semantic_768',
    canonicalCollection: 'codebase_chunks_768_v2',
    canonicalVector: 'content',
    dimension: 768,
    distance: 'Cosine',
    normalization: 'L2',
    requiredPayloadFields: [
      'packet_key', 'source_ref', 'representation_id', 'representation_revision',
      'workspace_revision', 'source_revision', 'tree_node_id', 'domain_class', 'tags',
    ],
    recommendedPayloadIndexes: [
      'packet_key', 'source_ref', 'representation_id', 'workspace_revision',
      'source_revision', 'tree_node_id', 'domain_class', 'tags',
    ],
    quantization: {
      canonicalStorage: 'FP32',
      qdrant: 'UNPROVEN',
      turbovec: 'UNPROVEN',
      diskannVamana: 'UNPROVEN',
    },
    executors: [
      { id: 'qdrant_hnsw', role: 'PERSISTENT_SERVING', addsFusionVote: false, ownsCanonicalIdentity: false, requiresOrdinalMap: true },
      { id: 'cuvs_brute_force', role: 'EXACT_ORACLE', addsFusionVote: false, ownsCanonicalIdentity: false, requiresOrdinalMap: true },
      { id: 'cuvs_cagra', role: 'GPU_CHALLENGER', addsFusionVote: false, ownsCanonicalIdentity: false, requiresOrdinalMap: true },
      { id: 'turbovec', role: 'CPU_CHALLENGER', addsFusionVote: false, ownsCanonicalIdentity: false, requiresOrdinalMap: true },
      { id: 'diskann_vamana', role: 'SSD_CHALLENGER', addsFusionVote: false, ownsCanonicalIdentity: false, requiresOrdinalMap: true },
    ],
    rtxGpu: {
      deviceClass: 'RTX_3060_TI_8GB',
      materialization: 'ORDINAL_GATHER_ONLY',
      rawVectorsOverRpc: false,
      devicePointersOverRpc: false,
      gpuPeakBytes: 'NOT_PROVEN',
    },
    canonicalWritesAllowed: false,
  });
}
