const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = process.env.QDRANT_COLLECTION ?? 'citations';

/**
 * Interface for a single Qdrant search result point.
 */
export interface QdrantSearchResult {
  id: string | number;
  score: number;
  payload?: Record<string, unknown>;
  vector?: number[]; // Optional, depending on include_vector setting
}

/**
 * Minimal vector search against Qdrant HTTP API.
 * Provide embedding (array of numbers) and receive top-K point ids with scores.
 */
export async function qdrantSearch(
  embedding: number[],
  topK = 10
): Promise<{, result: QdrantSearchResult[] }> {
  const url = `${QDRANT_URL}/collections/${COLLECTION}/points/search`;
  const body = { vector: embedding, top: topK, with_payload: true };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant search failed: ${res.status} ${text}`);
  }

  return res.json();
}
