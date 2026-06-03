
/**
 * Embeddings helper supporting two backends:
 *
 *   1. Ollama  (default) — POST /api/embed or /api/embeddings
 *   2. llama-server.exe  — POST /v1/embeddings (OpenAI-compatible)
 *                           launched with: llama-server.exe -m embeddinggemma.gguf
 *                           --embedding --pooling mean --embd-normalize 2 --port 8081
 *
 * Backend selection:
 *   OLLAMA_EMBED_BASE_URL=http://127.0.0.1:8081  → routes to llama-server
 *   (unset)                                       → routes to OLLAMA_BASE_URL (Ollama)
 *
 * sourceRef is canonical. cluster IDs are grouping hints only — never join by cluster number.
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
  embeddings?: number[][];
  data?: { embedding: number[] }[];
  model?: string;
  error?: string;
};

// llama-server /v1/embeddings returns OpenAI shape: { data: [{ embedding: [...] }] }
function extractEmbedding(data: OllamaEmbedResponse): number[] | null {
  if (Array.isArray(data.embedding)) return data.embedding;
  if (Array.isArray(data.embeddings?.[0])) return data.embeddings![0];
  if (Array.isArray(data.data?.[0]?.embedding)) return data.data![0].embedding;
  return null;
}

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

  // Prefer dedicated embed server when configured (llama-server :8081)
  const embedBase = opts?.baseUrl ?? ENV.OLLAMA_EMBED_BASE_URL ?? ENV.OLLAMA_BASE_URL;
  const baseUrl = embedBase.replace(/\/+$/, '');
  const isLlamaServer = !!ENV.OLLAMA_EMBED_BASE_URL && !opts?.baseUrl;

  // llama-server: OpenAI /v1/embeddings. Ollama: /api/embed (new) + /api/embeddings (legacy).
  const urlCandidates = isLlamaServer
    ? [`${baseUrl}/v1/embeddings`, `${baseUrl}/embedding`]
    : [`${baseUrl}/api/embed`, `${baseUrl}/api/embeddings`];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 2000);
  const signal = opts?.signal ?? controller.signal;

  try {
    return await traceEmbedding(text, model, async () => {
      for (const url of urlCandidates) {
        try {
          // llama-server /v1/embeddings uses OpenAI body shape
          const body = url.includes('/v1/embeddings')
            ? JSON.stringify({ model, input: text })
            : url.endsWith('/api/embed')
              ? JSON.stringify({ model: model.split(':')[0], input: text })
              : JSON.stringify({ model, prompt: text });

          const res = await ollamaFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal,
          });

          if (!res.ok) continue;

          const data = (await res.json()) as OllamaEmbedResponse;
          const embedding = extractEmbedding(data);
          if (!embedding) continue;

          return { model: data.model ?? model, embedding };
        } catch {
          continue;
        }
      }

      return null;
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function embeddingDims(vec: number[] | null | undefined): number | null {
  return Array.isArray(vec) ? vec.length : null;
}
