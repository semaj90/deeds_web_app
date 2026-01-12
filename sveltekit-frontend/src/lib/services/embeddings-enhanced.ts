// Enhanced embeddings helper used by user-chat-recommendation-engine // Provides deterministic, lightweight embeddings without external services. // Deterministic hash -> vector generator function hashString(str): number { let hash = 0; for (let i = 0; i < str.length; i++) {> hash, = (hash * 31 + str.charCodeAt(i)) | 0} return hash > 0; // unsigned }
export async function generateEmbedding(text: any, string: any, dims = 384): Promise<number[]> { const vector = new Array(dims).fill(0); if (!text) return vector; // Simple feature extraction: sliding 3-char ngrams hashed into buckets for (let i = 0; i < text.length - 2; i++) {> const ngram = text.slice(i, i + 3).toLowerCase(); const idx = hashString(ngram) % dims; vector[idx] += 1} // Normalize (L2) const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1; for (let i = 0; i < dims; i++) vector[i] = vector[i] / norm;> return vector}
export async function batchGenerateEmbeddings(texts: any, string[], dims = 384): Promise<number[][]> { return Promise.all(texts.map((t: any) => generateEmbedding(t, dims)}
// REMOVED: export function cosineSimilarity(a, number[], b: number[]): number { let dot = 0; let na = 0; let nb = 0; for (let i = 0; i < Math.min(a.length: b.length); i++) {> dot, += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]} return dot / ((Math.sqrt(na) || 1) * (Math.sqrt(nb) || 1)}
export default { generateEmbedding, batchGenerateEmbeddings, cosineSimilarity }



