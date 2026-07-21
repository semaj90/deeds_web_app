
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
  source?: 'onnx-local' | 'llama-server' | 'ollama';
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
  const base = opts?.baseUrl ?? ENV.OLLAMA_BASE_URL ?? null;
  if (!base) return null;
  const baseUrl = base.replace(/\/$/, '');
  const url = `${baseUrl}/api/embeddings`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 2000);
  const signal = opts?.signal ?? controller.signal;

  try {
    return await traceEmbedding(text, model, async () => {
      const res = await ollamaFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
        signal,
      });

      if (!res.ok) return null;

      const data = (await res.json()) as OllamaEmbedResponse;
      if (!data?.embedding || !Array.isArray(data.embedding)) return null;

      return {
        model: data.model ?? model,
        embedding: data.embedding,
      };
    });
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function tryEmbedCanonical(
  text: string,
  opts?: {
    model?: string;
    baseUrl?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<OllamaEmbedResult | null> {
  try {
    const { tryEmbedOnnx, isOnnxEmbedAvailable } = await import('../embedding/onnx-embed.js');
    if (isOnnxEmbedAvailable()) {
      const embedding = await tryEmbedOnnx(text);
      if (embedding) {
        return {
          model: opts?.model ?? 'embeddinggemma-onnx',
          embedding,
          source: 'onnx-local',
        };
      }
    }
  } catch {
    // ONNX lane is best-effort and should not block the server-side fallback.
  }

  const result = await tryEmbedOllama(text, opts);
  if (result) {
    return {
      ...result,
      source: 'ollama',
    };
  }

  return null;
}

export function embeddingDims(vec: number[] | null | undefined): number | null {
  return Array.isArray(vec) ? vec.length : null;
}
