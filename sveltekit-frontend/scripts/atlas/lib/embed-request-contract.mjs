/**
 * Request/response contracts for the two /api/embed endpoints a script may try.
 *
 * - Ollama `/api/embed` takes `{ model, input: string[] }` and returns `{ embeddings: number[][] }`.
 * - SvelteKit `/api/embed` takes `{ text, model: 'embeddinggemma' | 'mock' }` (one text per
 *   request) and returns `{ embedding: number[] }`. It answers 400 or an unauthenticated 200 with
 *   an all-zero vector, so a zero vector must never be accepted as a real embedding.
 */

export const SVELTEKIT_EMBED_MODEL = 'embeddinggemma';

/** Texts per Ollama request; a single request for thousands of texts outruns any sane timeout. */
export const OLLAMA_BATCH_SIZE = 256;

/** Bodies to POST to one endpoint: Ollama batches of OLLAMA_BATCH_SIZE, one per text for SvelteKit. */
export function buildEmbedBodies(kind, texts, ollamaModel) {
  if (kind === 'ollama') {
    const bodies = [];
    for (let i = 0; i < texts.length; i += OLLAMA_BATCH_SIZE) {
      bodies.push({ model: ollamaModel, input: texts.slice(i, i + OLLAMA_BATCH_SIZE) });
    }
    return bodies;
  }
  return texts.map((text) => ({ text, model: SVELTEKIT_EMBED_MODEL }));
}

export function isUsableVector(vector) {
  return Array.isArray(vector) && vector.length > 0 && vector.some((value) => value !== 0);
}

/** Returns one vector per text, or null if the response is missing/short/all-zero. */
export function extractEmbeddings(kind, responses, expectedCount) {
  const vectors =
    kind === 'ollama'
      ? responses.flatMap((response) => response?.embeddings ?? [])
      : responses.map((response) => response?.embedding);
  if (!Array.isArray(vectors) || vectors.length !== expectedCount) return null;
  return vectors.every(isUsableVector) ? vectors : null;
}
