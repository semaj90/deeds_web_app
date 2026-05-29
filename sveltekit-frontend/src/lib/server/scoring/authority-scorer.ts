/**
 * Unified Authority Scorer
 *
 * Implements the Karpathy Blend formula:
 * blend = (pr * 0.4) + (authority * 0.3) + (attention * 0.3)
 */

/**
 * Computes the Karpathy Blend score.
 *
 * @param pr PageRank score
 * @param authority Authority score
 * @param attention Attention score (cosine similarity mapped to [0, 1])
 * @returns Blended score in range [0, 1]
 */
export function computeKarpathyBlend(
  pr: number,
  authority: number,
  attention: number
): number {
  return (pr * 0.4) + (authority * 0.3) + (attention * 0.3);
}

/**
 * Calculates cosine similarity between two vectors.
 */
export function cosineSimilarity(v1: number[] | Float32Array, v2: number[] | Float32Array): number {
  if (v1.length !== v2.length || v1.length === 0) return 0;
  
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Map cosine similarity from range [-1, 1] to range [0, 1] for attention score.
 */
export function computeAttentionScore(
  vector: number[] | Float32Array,
  queryVector: number[] | Float32Array
): number {
  const cosine = cosineSimilarity(vector, queryVector);
  return Math.max(0, Math.min(1, (cosine + 1) / 2));
}
