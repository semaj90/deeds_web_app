import type { EmbeddingGemmaNativeExecutorV1 } from './embeddinggemma-task-runtime-v1.js';
import { ENV } from '$lib/server/env.server.js';

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

export const EMBEDDINGGEMMA2_ONNX_8094_MODEL = 'onnx-community/embeddinggemma2-q8:onnx/model_quantized.onnx';
export const EMBEDDINGGEMMA2_ONNX_8094_SHA256 =
  'd06edd606d38b1272eb33640417f4d15dc3429d0dc731874a57ab287dc496c1f';
export const EMBEDDINGGEMMA2_ONNX_8094_MODEL_REVISION =
  `${EMBEDDINGGEMMA2_ONNX_8094_MODEL}@sha256:${EMBEDDINGGEMMA2_ONNX_8094_SHA256}`;
export const EMBEDDINGGEMMA2_ONNX_8094_EXECUTOR_ID = 'ONNX_8094_EMBEDDINGGEMMA2_Q8';

type FetchLike = typeof fetch;

export function createEmbeddingGemma2Onnx8094ExecutorV1(input: {
  endpoint?: string;
  fetchImpl?: FetchLike;
} = {}): EmbeddingGemmaNativeExecutorV1 {
  const endpoint = (
    input.endpoint ??
    process.env.GEMMA2_ONNX_URL ??
    'http://127.0.0.1:8094'
  ).replace(/\/+$/, '');
  const fetchImpl = input.fetchImpl ?? fetch;

  return {
    async embedNative768(formattedText: string) {
      const started = performance.now();
      const response = await fetchImpl(`${endpoint}/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texts: [formattedText], dims: [768] }),
      });
      if (!response.ok) throw new Error(`EMBEDDINGGEMMA2_ONNX_8094_HTTP_${response.status}`);

      const payload = (await response.json()) as { embeddings?: Record<string, unknown[]> };
      const dimBucket = payload.embeddings?.['768'];
      const raw = Array.isArray(dimBucket) ? dimBucket[0] : undefined;
      if (!Array.isArray(raw)) throw new Error('EMBEDDINGGEMMA2_ONNX_8094_VECTOR_MISSING');
      if (raw.length !== 768) {
        throw new Error(`EMBEDDINGGEMMA2_ONNX_8094_DIMENSION_MISMATCH expected=768 got=${raw.length}`);
      }

      const vector = new Float32Array(768);
      let norm = 0;
      for (let i = 0; i < 768; i += 1) {
        const value = raw[i];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(`EMBEDDINGGEMMA2_ONNX_8094_NONFINITE index=${i}`);
        }
        vector[i] = value;
        norm += value * value;
      }
      norm = Math.sqrt(norm);
      if (norm === 0) throw new Error('EMBEDDINGGEMMA2_ONNX_8094_ZERO_NORM');
      for (let i = 0; i < 768; i += 1) vector[i] /= norm;

      return {
        vector,
        executor: EMBEDDINGGEMMA2_ONNX_8094_EXECUTOR_ID,
        executorRevision: 'onnx-8094-http-embed-v1',
        modelRevision: EMBEDDINGGEMMA2_ONNX_8094_MODEL_REVISION,
        execMs: performance.now() - started,
      };
    },
  };
}

export function createEmbeddingGemma2ChallengerExecutorV1(input: {
  endpoint?: string;
  model?: string;
  fetchImpl?: FetchLike;
} = {}): EmbeddingGemmaNativeExecutorV1 {
  const endpoint = (input.endpoint ?? ENV.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
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
