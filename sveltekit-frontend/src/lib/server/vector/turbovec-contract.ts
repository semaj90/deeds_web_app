export const TURBOVEC_EMBEDDING_MODEL = 'embeddinggemma:latest';
export const TURBOVEC_EMBEDDING_DIMENSION = 768;
export const TURBOVEC_QUANTIZER = 'turbovec-4bit';
export const TURBOVEC_ROTATION_SEED = 'rotorquant-v1';

export interface TurboVecMetadata {
  embeddingModel: string;
  dimension: number;
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
    norm: input.norm,
    quantizer: TURBOVEC_QUANTIZER,
    rotationSeed: TURBOVEC_ROTATION_SEED,
    packedBytesRef: input.packedBytesRef ?? buildTurboVecPackedRef(input.chunkId),
    clusterId: input.clusterId,
    manifold4: input.manifold4,
    sourceRef: input.sourceRef,
  };
}
