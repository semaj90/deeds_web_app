/**
 * schema-encoder.ts
 *
 * WebGPU / CPU document feature scoring engine.
 * Computes fused document relevance scores using the formula:
 * score = (trust_tier * 0.3) + (karpathy_blend * 0.5) + ((1.0 - risk_score) * 0.2)
 */

export interface DocFeatures {
  trustTier: number;
  somCluster: number;
  karpathyBlend: number;
  pagerank: number;
  riskScore: number;
}

/**
 * CPU reference implementation of the schema-encoder WGSL kernel.
 */
export function calculateDocumentScore(doc: DocFeatures): number {
  return (doc.trustTier * 0.3) + (doc.karpathyBlend * 0.5) + ((1.0 - doc.riskScore) * 0.2);
}

/**
 * Batched CPU execution over an array of documents.
 */
export function encodeDocumentScoresCpu(docs: DocFeatures[]): Float32Array {
  const scores = new Float32Array(docs.length);
  for (let i = 0; i < docs.length; i++) {
    scores[i] = calculateDocumentScore(docs[i]);
  }
  return scores;
}

/**
 * Packs DocFeatures into a continuous Float32Array buffer for WebGPU storage buffers.
 * Each document occupies 5 consecutive f32 elements (20 bytes).
 */
export function packDocFeatures(docs: DocFeatures[]): Float32Array {
  const stride = 5;
  const buffer = new Float32Array(docs.length * stride);
  for (let i = 0; i < docs.length; i++) {
    const offset = i * stride;
    buffer[offset + 0] = docs[i].trustTier;
    buffer[offset + 1] = docs[i].somCluster;
    buffer[offset + 2] = docs[i].karpathyBlend;
    buffer[offset + 3] = docs[i].pagerank;
    buffer[offset + 4] = docs[i].riskScore;
  }
  return buffer;
}
