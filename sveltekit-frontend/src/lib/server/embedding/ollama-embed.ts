
/**
 * Optional, guarded Ollama embeddings helper for SvelteKit 2.
 * Uses ENV.OLLAMA_BASE_URL for the server URL.
 * Returns null on failure or if the server is unavailable.
 */

import { assertEmbeddingModel } from '$lib/ai/model-ids.js';
import { ENV } from '$lib/server/env.server.js';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';
import { ollamaFetch } from '$lib/server/ollama.js';

export type OllamaEmbedResult = {
  model: string;
  embedding: number[];
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
  const model = assertEmbeddingModel(opts?.model ?? 'embeddinggemma:latest');
  const baseUrl = (opts?.baseUrl ?? ENV.OLLAMA_BASE_URL).replace(/\/+$/, '');
  const simpleModelName = model.split(':')[0];
  const urlCandidates = [`${baseUrl}/api/embed`, `${baseUrl}/api/embeddings`];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 2000);
  const signal = opts?.signal ?? controller.signal;

  try {
    return await traceEmbedding(text, model, async () => {
      for (const url of urlCandidates) {
        try {
          const body = url.endsWith('/api/embed')
            ? JSON.stringify({ text, model: simpleModelName })
            : JSON.stringify({ model, prompt: text });

          const res = await ollamaFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal,
          });

          if (!res.ok) continue;

          const data = (await res.json()) as OllamaEmbedResponse;
          const embedding = Array.isArray(data.embedding)
            ? data.embedding
            : Array.isArray((data as any).embeddings?.[0])
              ? (data as any).embeddings[0]
              : null;

          if (!embedding) continue;

          return {
            model: data.model ?? model,
            embedding,
          };
        } catch {
          continue;
        }
      }

      return null;
    });
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function embeddingDims(vec: number[] | null | undefined): number | null {
  return Array.isArray(vec) ? vec.length : null;
}
