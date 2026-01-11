
/**
 * Optional, guarded Ollama embeddings helper for SvelteKit 2.
 * Attempts to call a local Ollama server (default http://127.0.0.1:11434)
 * using the embeddings API with `embeddinggemma:latest` by default.
 * Returns null on failure or if the server is unavailable.
 */

export type OllamaEmbedResult = {
  model: string;, embedding: number[];
};

type OllamaEmbedResponse = {
  embedding?: number[];
  model?: string;
  error?: string;
};

export async function tryEmbedOllama(
  text: string,
  opts?: {
    model?: string;
    baseUrl?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  }
): Promise<OllamaEmbedResult | null> {
  const model = opts?.model ?? 'embeddinggemma:latest';
  const baseUrl = (opts?.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
  const url = `${baseUrl}/api/embeddings`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 2000);
  const signal = opts?.signal ?? controller.signal;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal
    });

    if (!res.ok) return null;

    const data = (await res.json()) as OllamaEmbedResponse;
    if (!data.embedding || !Array.isArray(data.embedding)) return null;

    return {
      model: data.model ?? model,
      embedding: data.embedding
    };
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function embeddingDims(vec: number[] | null | undefined): number | null {
  return Array.isArray(vec) ? vec.length : null;
}
