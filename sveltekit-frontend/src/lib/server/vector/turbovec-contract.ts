import { z } from 'zod';
import { SEMANTIC_DIMENSION } from '$lib/server/embedding/embedding-contract-768.js';

export const TURBOVEC_EMBEDDING_MODEL = 'embeddinggemma:latest';
export const TURBOVEC_EMBEDDING_DIMENSION = SEMANTIC_DIMENSION;
export const TURBOVEC_QUANTIZER = 'turbovec-4bit';
export const TURBOVEC_ROTATION_SEED = 'rotorquant-v1';
// Input/source stays 768 (semantic_768). The ANN index itself is a derived 128-d MRL prefix,
// l2_normalize(v768[:128]); the sidecar projects queries the same way. Challenger prefilter only.
export const TURBOVEC_INDEX_DIMENSION = 128;
export const TURBOVEC_PROJECTION = 'mrl-prefix-l2';
export const TURBOVEC_REPRESENTATION_ID = 'embeddinggemma_mrl128_l2_4bit_v1';

export interface TurboVecMetadata {
  embeddingModel: string;
  dimension: number;
  indexDimension?: number;
  projection?: string;
  representationId?: string;
  norm?: number;
  quantizer: string;
  rotationSeed: string;
  packedBytesRef?: string;
  clusterId?: string;
  manifold4?: [number, number, number, number];
  sourceRef?: string;
}

export function assertTurboVecEmbedding(vector: number[], expectedDimension = TURBOVEC_EMBEDDING_DIMENSION): void {
  if (!Array.isArray(vector)) {
    throw new TypeError('TurboVec vectors must be arrays');
  }
  if (vector.length !== expectedDimension) {
    throw new Error(`TurboVec expects ${expectedDimension}d embeddinggemma vectors, received ${vector.length}d`);
  }
}

export function buildTurboVecPackedRef(chunkId: string): string {
  return `redis:turbovec:vec:${chunkId}`;
}

export function buildTurboVecMetadata(input: {
  chunkId: string;
  norm?: number;
  clusterId?: string;
  manifold4?: [number, number, number, number];
  sourceRef?: string;
  packedBytesRef?: string;
}): TurboVecMetadata {
  return {
    embeddingModel: TURBOVEC_EMBEDDING_MODEL,
    dimension: TURBOVEC_EMBEDDING_DIMENSION,
    indexDimension: TURBOVEC_INDEX_DIMENSION,
    projection: TURBOVEC_PROJECTION,
    representationId: TURBOVEC_REPRESENTATION_ID,
    norm: input.norm,
    quantizer: TURBOVEC_QUANTIZER,
    rotationSeed: TURBOVEC_ROTATION_SEED,
    packedBytesRef: input.packedBytesRef ?? buildTurboVecPackedRef(input.chunkId),
    clusterId: input.clusterId,
    manifold4: input.manifold4,
    sourceRef: input.sourceRef,
  };
}

// -- Runtime contract for the :8791 HTTP ANN sidecar (derived prefilter, never a retrieval vote) --
export const TurboVecRepresentationSchema = z.enum([
  'embeddinggemma_mrl128_l2_4bit_v1',
  'embeddinggemma_mrl64_l2_4bit_v1', // lower tier: recall@50 0.858 vs 0.946 at 128-d (50-query probe)
]);

export const TurboVecContractSchema = z.object({
  servicePort: z.literal(8791),
  grpcPort: z.literal(50062),
  collection: z.literal('codebase_chunks_768_v2'),
  dimension: z.union([z.literal(64), z.literal(128)]),
  quantizer: z.literal('turbovec-4bit'),
  representationId: TurboVecRepresentationSchema,
  role: z.literal('CHALLENGER_PREFILTER_ONLY'),
  rrfVoteWeight: z.literal(0),
  rescoreColumn: z.literal('content_embedding_768'),
});

export type TurboVecContract = z.infer<typeof TurboVecContractSchema>;
