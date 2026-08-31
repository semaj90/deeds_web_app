/**
 * Canonical embedding entrypoint.
 *
 * Prefers the local app embedding route for the canonical EmbeddingGemma lane,
 * then falls back to the local ONNX 768-dim lane when available.
 * This module stays intentionally small so server routes can import it
 * without loading the entire embeddings stack at startup.
 */

import { ENV } from '$lib/server/env.server.js';
import { validateSemantic768OutputV1 } from '$lib/server/atlas/embedding/embedding-runtime-v1.js';

export type CanonicalEmbeddingResult = {
  model: string;
  embedding: number[];
  source: 'api-embed' | 'onnx-local';
};

export type Semantic768CanonicalResult = {
  representationId: 'semantic_768';
  model: string;
  embedding: number[];
  executor: 'llama-server';
  endpoint: '/v1/embeddings';
  modelArtifactRevision: string;
  tokenizerRevision: string;
  inputPolicyRevision: string;
  admittedTokenCount: number;
};

/** Strict canonical lane. No app-route, ONNX, Ollama, or zero-vector fallback. */
export async function embedSemantic768Canonical(
  text: string,
  opts: {
    model: string;
    modelArtifactRevision: string;
    tokenizerRevision: string;
    inputPolicyRevision: string;
    baseUrl?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<Semantic768CanonicalResult> {
  if (!text.trim()) throw new Error('SEMANTIC_768_EMPTY_INPUT');
  for (const [name, value] of Object.entries(opts)) {
    if (['model', 'modelArtifactRevision', 'tokenizerRevision', 'inputPolicyRevision'].includes(name) && typeof value === 'string' && !value.trim()) {
      throw new Error(`SEMANTIC_768_${name.toUpperCase()}_REQUIRED`);
    }
  }
  const baseUrl = (opts.baseUrl ?? process.env.EMBEDDING_SERVER_URL ?? 'http://127.0.0.1:8081').replace(/\/+$/, '');
  const signal = opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 20_000);
  const tokenize = await fetch(`${baseUrl}/tokenize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text, add_special: false }),
    signal,
  });
  if (!tokenize.ok) throw new Error(`SEMANTIC_768_TOKENIZE_HTTP_${tokenize.status}`);
  const tokenBody = await tokenize.json() as { tokens?: unknown };
  if (!Array.isArray(tokenBody.tokens)) throw new Error('SEMANTIC_768_TOKENIZE_SHAPE');
  if (tokenBody.tokens.length > 2048) throw new Error(`SEMANTIC_768_INPUT_OVERFLOW:${tokenBody.tokens.length}`);

  const response = await fetch(`${baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: opts.model, input: text }),
    signal,
  });
  if (!response.ok) throw new Error(`SEMANTIC_768_EMBED_HTTP_${response.status}`);
  const body = await response.json() as { model?: string; data?: Array<{ embedding?: unknown }> };
  const embedding = body.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== 768) throw new Error(`SEMANTIC_768_INVALID_DIMENSIONS:${Array.isArray(embedding) ? embedding.length : 'missing'}`);
  const vector = embedding.map(Number);
  if (vector.some((value) => !Number.isFinite(value))) throw new Error('SEMANTIC_768_NON_FINITE');
  try {
    validateSemantic768OutputV1(vector);
  } catch {
    throw new Error('SEMANTIC_768_NOT_L2_NORMALIZED');
  }
  if (body.model && body.model !== opts.model) throw new Error(`SEMANTIC_768_MODEL_MISMATCH:${body.model}`);
  return {
    representationId: 'semantic_768',
    model: body.model ?? opts.model,
    embedding: vector,
    executor: 'llama-server',
    endpoint: '/v1/embeddings',
    modelArtifactRevision: opts.modelArtifactRevision,
    tokenizerRevision: opts.tokenizerRevision,
    inputPolicyRevision: opts.inputPolicyRevision,
    admittedTokenCount: tokenBody.tokens.length,
  };
}

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
