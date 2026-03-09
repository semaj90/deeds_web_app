import { getOllamaBaseUrlFromConfig } from '$lib/config/ollama-config';

export interface SemanticQuery {
  query: string;
  limit?: number;
}

export async function semanticSearch(q: SemanticQuery): Promise<unknown> {
  const baseUrl = getOllamaBaseUrlFromConfig();
  const res = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: q.query, model: 'embeddinggemma:latest' })
  });
  if (!res.ok) throw new Error(`Semantic search failed: ${res.status}`);
  return res.json();
}
