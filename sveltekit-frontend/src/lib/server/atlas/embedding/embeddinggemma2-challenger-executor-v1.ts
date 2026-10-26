import type { EmbeddingGemmaNativeExecutorV1 } from './embeddinggemma-task-runtime-v1.js';

/**
 * Isolated EmbeddingGemma 2 challenger executor (Ollama, Q8_0 GGUF).
 *
 * This is NOT the canonical semantic_768 owner. It stamps its own executor id and
 * model revision, never `representationId: 'semantic_768'`, and it does not change
 * any default. Vectors from this executor must be compared in a separate index
 * before any promotion decision.
 */
export const EMBEDDINGGEMMA2_CHALLENGER_MODEL = 'embeddinggemma2:q8_0';

/** unsloth/embeddinggemma-2-GGUF : embeddinggemma-2-Q8_0.gguf (downloaded 2026-10-14). */
export const EMBEDDINGGEMMA2_Q8_0_SHA256 =
  '6f1bd4ac6c5df7444f9cca7ca36cafe6cfa34cd6f49fefb1e0b4be8143aed8bc';

export const EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION =
  `unsloth/embeddinggemma-2-GGUF:embeddinggemma-2-Q8_0.gguf@sha256:${EMBEDDINGGEMMA2_Q8_0_SHA256}`;

export const EMBEDDINGGEMMA2_CHALLENGER_EXECUTOR_ID = 'OLLAMA_CHALLENGER_EMBEDDINGGEMMA2_Q8_0';

type FetchLike = typeof fetch;

export function createEmbeddingGemma2ChallengerExecutorV1(input: {
  endpoint?: string;
  model?: string;
  fetchImpl?: FetchLike;
} = {}): EmbeddingGemmaNativeExecutorV1 {
  const endpoint = (input.endpoint ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = input.model ?? EMBEDDINGGEMMA2_CHALLENGER_MODEL;
  const fetchImpl = input.fetchImpl ?? fetch;

  return {
    async embedNative768(formattedText: string) {
      const started = performance.now();
      const response = await fetchImpl(`${endpoint}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, input: [formattedText] }),
      });
      if (!response.ok) throw new Error(`EMBEDDINGGEMMA2_CHALLENGER_HTTP_${response.status}`);

      const payload = (await response.json()) as { embeddings?: unknown[] };
      const raw = Array.isArray(payload.embeddings) ? payload.embeddings[0] : undefined;
      if (!Array.isArray(raw)) throw new Error('EMBEDDINGGEMMA2_CHALLENGER_VECTOR_MISSING');
      if (raw.length !== 768) {
        throw new Error(`EMBEDDINGGEMMA2_CHALLENGER_DIMENSION_MISMATCH expected=768 got=${raw.length}`);
      }

      const vector = new Float32Array(768);
      let norm = 0;
      for (let i = 0; i < 768; i += 1) {
        const value = raw[i];
        // Accept only real numbers: Number(null) is 0 and would silently hide a bad entry.
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(`EMBEDDINGGEMMA2_CHALLENGER_NONFINITE index=${i}`);
        }
        vector[i] = value;
        norm += value * value;
      }
      // Normalize explicitly: this executor does not rely on the server's normalization.
      norm = Math.sqrt(norm);
      if (norm === 0) throw new Error('EMBEDDINGGEMMA2_CHALLENGER_ZERO_NORM');
      for (let i = 0; i < 768; i += 1) vector[i] /= norm;

      return {
        vector,
        executor: EMBEDDINGGEMMA2_CHALLENGER_EXECUTOR_ID,
        executorRevision: 'ollama-api-embed',
        modelRevision: EMBEDDINGGEMMA2_CHALLENGER_MODEL_REVISION,
        execMs: performance.now() - started,
      };
    },
  };
}
