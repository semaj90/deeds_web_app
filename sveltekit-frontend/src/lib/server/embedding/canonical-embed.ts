/**
 * Canonical embedding entrypoint.
 *
 * Prefers the local ONNX 768-dim lane when available, then falls back to the
 * network embedding helper. This module stays intentionally small so server
 * routes can import it without loading the entire embeddings stack at startup.
 */

export type CanonicalEmbeddingResult = {
  model: string;
  embedding: number[];
  source: 'onnx-local' | 'llama-server' | 'ollama';
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

  try {
    const { tryEmbedOllama } = await import('../embeddings/ollama.js');
    const result = await tryEmbedOllama(text, opts);
    if (result?.embedding) {
      return {
        model: result.model,
        embedding: result.embedding,
        source: 'ollama',
      };
    }
  } catch {
    // Fall through to null below.
  }

  return null;
}
