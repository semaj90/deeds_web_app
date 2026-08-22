/**
 * Semantic Classification Lane
 *
 * Domain classification via cosine similarity to pre-computed domain centroids.
 * Centroids are K-means cluster centers (K=1) trained on domain-specific embeddings.
 *
 * Phase 2 Step 2: July 28, 2026
 */

import { domainScoreSchema, type DomainScore, CANONICAL_DOMAINS } from '../validation/hybrid-semantic-classification.js';

/**
 * Domain centroid shape: normalized 768-dim embedding vector
 */
export interface DomainCentroid {
  domain: string;
  centroid: number[];  // 768-dim vector
  sampleCount: number; // How many packets were used to compute this centroid
  confidence: number;  // Quality of the centroid (higher = more reliable)
}

/**
 * Cosine similarity between two vectors
 * Returns value in [0, 1]
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error(`Vector dimension mismatch: ${vec1.length} vs ${vec2.length}`);
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) return 0;

  return dotProduct / (norm1 * norm2);
}

/**
 * Softmax normalization of raw similarity scores
 * Converts scores to probability distribution [0, 1]
 */
export function softmax(scores: number[]): number[] {
  const maxScore = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - maxScore));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sumExps);
}

/**
 * Compute K-means centroid from embedding vectors (K=1 = simple mean)
 */
export function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error('Cannot compute centroid from empty embedding list');
  }

  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);

  // Sum all embeddings
  for (const embedding of embeddings) {
    if (embedding.length !== dim) {
      throw new Error(`Embedding dimension mismatch: expected ${dim}, got ${embedding.length}`);
    }
    for (let i = 0; i < dim; i++) {
      centroid[i] += embedding[i];
    }
  }

  // Divide by count to get mean
  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

/**
 * L2-normalize a vector (unit norm)
 */
export function normalizeVector(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) {
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/**
 * Score entity embedding against a domain centroid
 * Returns confidence ∈ [0, 1]
 */
export function scoreEntityAgainstCentroid(
  entityEmbedding: number[],
  centroid: DomainCentroid
): number {
  const similarity = cosineSimilarity(entityEmbedding, centroid.centroid);
  // Scale by centroid quality (confidence is 0-1, raises bar for low-confidence centroids)
  return similarity * centroid.confidence;
}

/**
 * Semantic lane: Classify entity based on embedding similarity to domain centroids
 *
 * @param entityId - Entity identifier
 * @param entityEmbedding - Entity's 768-dim embedding vector
 * @param domainCentroids - Map of domain names to centroid data
 * @param confidenceThreshold - Minimum score to include (default: 0.3)
 * @param topK - Return top-K domains (default: 5)
 * @returns Array of domain scores sorted by confidence (descending)
 */
export function classifySemanticSingle(
  entityId: string,
  entityEmbedding: number[],
  domainCentroids: Map<string, DomainCentroid>,
  confidenceThreshold: number = 0.3,
  topK: number = 5
): DomainScore[] {
  if (entityEmbedding.length !== 768) {
    throw new Error(`Entity embedding must be 768-dim, got ${entityEmbedding.length}`);
  }

  if (domainCentroids.size === 0) {
    return [];
  }

  const scores: { domain: string; score: number; explanation: string }[] = [];

  // Score against each domain centroid
  for (const [domain, centroid] of domainCentroids) {
    const score = scoreEntityAgainstCentroid(entityEmbedding, centroid);

    if (score >= confidenceThreshold) {
      scores.push({
        domain,
        score: Math.round(score * 1000) / 1000, // Round to 3 decimals
        explanation: `Semantic similarity to ${domain} centroid (${centroid.sampleCount} samples, confidence: ${centroid.confidence.toFixed(2)})`,
      });
    }
  }

  // Sort by score (descending) and return top-K
  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, topK).map((s) =>
    domainScoreSchema.parse({
      domain: s.domain,
      score: s.score,
      source: 'SEMANTIC_NEIGHBOR',
      explanation: s.explanation,
    })
  );
}

/**
 * Batch semantic classification for multiple entities
 *
 * @param entities - Array of { entityId, embedding }
 * @param domainCentroids - Map of domain names to centroid data
 * @param confidenceThreshold - Minimum score to include (default: 0.3)
 * @param topK - Return top-K domains per entity (default: 5)
 * @returns Record mapping entityId to DomainScore[]
 */
export function classifySemanticBatch(
  entities: Array<{ entityId: string; embedding: number[] }>,
  domainCentroids: Map<string, DomainCentroid>,
  confidenceThreshold: number = 0.3,
  topK: number = 5
): Record<string, DomainScore[]> {
  const results: Record<string, DomainScore[]> = {};

  for (const entity of entities) {
    results[entity.entityId] = classifySemanticSingle(
      entity.entityId,
      entity.embedding,
      domainCentroids,
      confidenceThreshold,
      topK
    );
  }

  return results;
}

/**
 * Compute aggregate confidence for semantic classifications
 * Returns average score across all domains for an entity
 */
export function computeSemanticAggregateConfidence(scores: DomainScore[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + s.score, 0);
  return Math.round((sum / scores.length) * 1000) / 1000;
}

/**
 * Validation metrics for semantic lane
 */
export interface SemanticLaneMetrics {
  totalEntities: number;
  classifiedEntities: number;
  coveragePercentage: number;
  averageConfidence: number;
  averageDomainsPerEntity: number;
  minConfidenceObserved: number;
  maxConfidenceObserved: number;
  confidenceVariance: number;
}

/**
 * Compute metrics for semantic lane coverage and quality
 */
export function computeSemanticMetrics(
  classifications: Record<string, DomainScore[]>
): SemanticLaneMetrics {
  const entityIds = Object.keys(classifications);
  const classifiedCount = entityIds.filter((id) => classifications[id].length > 0).length;

  const confidences = entityIds.flatMap((id) => classifications[id].map((s) => s.score));
  const averageConfidence = confidences.length > 0
    ? Math.round((confidences.reduce((a, b) => a + b) / confidences.length) * 1000) / 1000
    : 0;

  const minConfidence = confidences.length > 0 ? Math.min(...confidences) : 0;
  const maxConfidence = confidences.length > 0 ? Math.max(...confidences) : 0;

  // Compute variance of confidence scores
  let variance = 0;
  if (confidences.length > 1) {
    const mean = averageConfidence;
    const sumSquaredDiff = confidences.reduce((acc, c) => acc + Math.pow(c - mean, 2), 0);
    variance = Math.sqrt(sumSquaredDiff / confidences.length);
  }

  const domainsPerEntity = Object.values(classifications).map((scores) => scores.length);
  const averageDomains = domainsPerEntity.length > 0
    ? Math.round((domainsPerEntity.reduce((a, b) => a + b) / domainsPerEntity.length) * 100) / 100
    : 0;

  return {
    totalEntities: entityIds.length,
    classifiedEntities: classifiedCount,
    coveragePercentage: entityIds.length > 0 ? (classifiedCount / entityIds.length) * 100 : 0,
    averageConfidence,
    averageDomainsPerEntity: averageDomains,
    minConfidenceObserved: minConfidence,
    maxConfidenceObserved: maxConfidence,
    confidenceVariance: Math.round(variance * 1000) / 1000,
  };
}
