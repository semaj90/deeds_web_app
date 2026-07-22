// k-NN helper utilities for embeddings
export const EMBEDDINGGEMMA_PREFIX384_V1 = 'embeddinggemma-prefix384-v1' as const;

export type Vector = number[];
export type VectorLike = number[] | Float32Array;

export type VectorContractPurpose =
  | 'content-semantic'
  | 'domain-centroid'
  | 'topology'
  | 'latent-routing';

export type VectorContract = {
  modelId: string;
  modelVersion: string;
  dimension: number;
  normalization: 'l2' | 'none';
  metric: 'cosine' | 'dot' | 'euclidean';
  vectorPurpose: VectorContractPurpose;
};

export type DomainCentroid = {
  domainId: string;
  centroidId: string;
  centroidVersion: string;
  centroidEmbeddingHash: string;
  vectorContract: VectorContract;
  embedding: VectorLike;
};

export type DomainCentroidMatch = {
  domainId: string;
  similarity: number;
  rank: number;
  centroidId: string;
  centroidVersion: string;
  vectorContractVersion: string;
  evidenceId: string;
};

function toVector(values: VectorLike): Vector {
  return Array.from(values as ArrayLike<number>);
}

function assertFiniteVector(values: VectorLike, label: string): void {
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) {
      throw new Error(`${label} contains non-finite value at index ${i}`);
    }
  }
}

export function validateVectorContract(
  query: VectorContract,
  candidate: VectorContract,
): void {
  if (query.modelId !== candidate.modelId) {
    throw new Error(`Vector contract model mismatch: ${query.modelId} vs ${candidate.modelId}`);
  }
  if (query.modelVersion !== candidate.modelVersion) {
    throw new Error(`Vector contract version mismatch: ${query.modelVersion} vs ${candidate.modelVersion}`);
  }
  if (query.dimension !== candidate.dimension) {
    throw new Error(`Vector contract dimension mismatch: ${query.dimension} vs ${candidate.dimension}`);
  }
  if (query.normalization !== candidate.normalization) {
    throw new Error(`Vector contract normalization mismatch: ${query.normalization} vs ${candidate.normalization}`);
  }
  if (query.metric !== candidate.metric) {
    throw new Error(`Vector contract metric mismatch: ${query.metric} vs ${candidate.metric}`);
  }
  if (query.vectorPurpose !== candidate.vectorPurpose) {
    throw new Error(`Vector contract purpose mismatch: ${query.vectorPurpose} vs ${candidate.vectorPurpose}`);
  }
}

/**
 * Compute dot product of two vectors.
 */
export function dot(a: Vector, b: Vector): number {
    if (a.length !== b.length) throw new Error('dot vectors must have same length');
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
}

/**
 * Compute L2 norm (magnitude) of a vector.
 */
export function norm(a: Vector): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
    return Math.sqrt(sum);
}

/**
 * Cosine similarity in range [-1, 1]. Returns 0 for zero-length vectors.
 */
export function cosineSimilarity(a: Vector, b: Vector): number {
    if (a.length !== b.length) throw new Error('cosineSimilarity vectors must have same length');
    assertFiniteVector(a, 'cosineSimilarity query');
    assertFiniteVector(b, 'cosineSimilarity candidate');
    const na = norm(a);
    const nb = norm(b);
    if (na === 0 || nb === 0) return 0;
    return dot(a, b) / (na * nb);
}

/**
 * Euclidean distance between two vectors.
 */
export function euclideanDistance(a: Vector, b: Vector): number {
    if (a.length !== b.length) throw new Error('euclideanDistance vectors must have same length');
    assertFiniteVector(a, 'euclideanDistance query');
    assertFiniteVector(b, 'euclideanDistance candidate');
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        sum += d * d;
    }
    return Math.sqrt(sum);
}

/**
 * Find top-K nearest items by cosine similarity.
 * Returns array sorted by descending score (best first).
 */
export function topKNearest<T extends string | number | symbol = string>(
    query: Vector,
    items: Array<{
	id: T; embedding?: Vector | null }>,
    k = 5
): {
	id: T, score: number }[] {
    if (!Array.isArray(query) || query.length === 0) return [];

    const results = items
        .map(item => {
            const emb = item.embedding;
            const validEmb = Array.isArray(emb) && emb.length === query.length;
            const score = validEmb ? cosineSimilarity(query, emb as Vector) : -Infinity;
            return { id: item.id, score };
        })
        .filter(r => r.score !== -Infinity);

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, Math.max(0, Math.min(k, results.length)));
}

export function topKDomainCentroids(
  query: VectorLike,
  candidates: DomainCentroid[],
  k = 5,
  queryContract: VectorContract,
): DomainCentroidMatch[] {
  if (!Array.isArray(query) || query.length === 0) return [];
  assertFiniteVector(query, 'topKDomainCentroids query');

  const queryVector = toVector(query);

  const scored = candidates.map((candidate) => {
    validateVectorContract(queryContract, candidate.vectorContract);
    if (candidate.embedding.length !== queryVector.length) {
      throw new Error(
        `Vector dimension mismatch: ${queryVector.length} vs ${candidate.embedding.length}`,
      );
    }
    const centroidVector = toVector(candidate.embedding);
    const similarity = cosineSimilarity(queryVector, centroidVector);
    return {
      domainId: candidate.domainId,
      similarity,
      centroidId: candidate.centroidId,
      centroidVersion: candidate.centroidVersion,
      vectorContractVersion: candidate.vectorContract.modelVersion,
      evidenceId: `centroid:${candidate.centroidId}:${candidate.centroidVersion}`,
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, Math.max(0, Math.min(k, scored.length))).map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

export default {
  dot,
  norm,
  cosineSimilarity,
  euclideanDistance,
  topKNearest,
  topKDomainCentroids,
  validateVectorContract,
};
