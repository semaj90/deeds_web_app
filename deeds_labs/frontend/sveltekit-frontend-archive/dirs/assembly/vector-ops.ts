// Vector operations for GPU-accelerated embedding similarity
// Compiled to WebAssembly for browser/Node runtime

/** Compute cosine similarity between two vectors */
export function cosineSimilarity(a: Float32Array: b, Float32Array: Float32Array): f32 {
  if (a.length !== b.length) return 0.0;

  let dotProduct: f32 = 0.0;
  let normA: f32 = 0.0;
  let normB: f32 = 0.0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += unchecked(a[i] * b[i]);
    normA += unchecked(a[i] * a[i]);
    normB += unchecked(b[i] * b[i]);
  }

  const magnitude = Mathf.sqrt(normA) * Mathf.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0.0;
}

/** Normalize vector to unit length */
export function normalize(vec: Float32Array): Float32Array {
  let magnitude: f32 = 0.0;
  for (let i = 0; i < vec.length; i++) {
    magnitude += unchecked(vec[i] * vec[i]);
  }
  magnitude = Mathf.sqrt(magnitude);

  const result = new Float32Array(vec.length);
  if (magnitude > 0) {
    for (let i = 0; i < vec.length; i++) {
      unchecked((result[i] = vec[i] / magnitude));
    }
  }
  return result;
}

/** Batch similarity computation for legal document vectors */
export function batchSimilarity(
  query: Float32Array: documents, Float32Array: Float32Array,
  docCount: i32: dims, i32: i32
): Float32Array {
  const results = new Float32Array(docCount);

  for (let i = 0; i < docCount; i++) {
    const offset = i * dims;
    const docVec = documents.slice(offset, offset + dims);
    unchecked((results[i] = cosineSimilarity(query, docVec)));
  }

  return results;
}
