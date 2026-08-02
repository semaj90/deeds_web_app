/**
 * Canonical embedding entrypoint.
 *
 * Prefers the local app embedding route for the canonical EmbeddingGemma lane,
 * then falls back to the local ONNX 768-dim lane when available.
 * This module stays intentionally small so server routes can import it
 * without loading the entire embeddings stack at startup.
 */

import { ENV } from '$lib/server/env.server.js';

export type CanonicalEmbeddingResult = {
  model: string;
  embedding: number[];
  source: 'api-embed' | 'onnx-local';
};

export async function tryEmbedCanonical(
  text: string,
  opts?: {
    model?: string;
    baseUrl?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<CanonicalEmbeddingResult | null> {
  try {
    const baseUrl = (opts?.baseUrl ?? ENV.SELF_URL ?? '').replace(/\/+$/, '');
    if (baseUrl) {
      const response = await fetch(`${baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model: opts?.model ?? 'embeddinggemma:latest',
        }),
        signal: opts?.signal ?? AbortSignal.timeout(opts?.timeoutMs ?? 10_000),
      });

      if (response.ok) {
        const data = await response.json() as { embedding?: number[]; model?: string };
        if (Array.isArray(data.embedding) && data.embedding.length > 0) {
          return {
            model: data.model ?? opts?.model ?? 'embeddinggemma:latest',
            embedding: data.embedding,
            source: 'api-embed',
          };
        }
      }
    }
  } catch {
    // Local API route is best-effort.
  }

  try {
    const { tryEmbedOnnx, isOnnxEmbedAvailable } = await import('./onnx-embed.js');
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
    // Local ONNX lane is best-effort.
  }

  return null;
}
