/**
 * Canonical embedding entrypoint.
 *
 * Uses the local app embedding route for the canonical EmbeddingGemma lane and
 * fails closed (returns null) when it is unavailable. The local ONNX executor is
 * NOT a canonical fallback: it is not in the semantic_768 space (2026-09-24 parity
 * probe: mean-pooled last_hidden_state without the Dense projections ~0 cosine vs
 * Ollama; QInt8 export with Dense ~0.537 vs fp32). Use tryEmbedOnnxChallenger()
 * explicitly for challenger/proof work.
 * This module stays intentionally small so server routes can import it
 * without loading the entire embeddings stack at startup.
 */

import { ENV } from '../env.server.js';
import { validateSemantic768OutputV1 } from '../atlas/embedding/embedding-runtime-v1.js';

export type CanonicalEmbeddingResult = {
  model: string;
  embedding: number[];
  source: 'api-embed';
};

/** Result of the explicit, non-canonical ONNX challenger executor. */
export type OnnxChallengerEmbeddingResult = {
  embedding: number[];
  provider: 'onnx-local-cpu';
  modelArtifactPath: string | null;
  recipe: 'mean_pool_last_hidden_state_l2_no_dense';
  canonicalAuthority: false;
  promotionEligible: false;
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
        // The route's schema only accepts 'embeddinggemma' | 'mock'; a tagged name such as
        // 'embeddinggemma:latest' is rejected with 400.
        body: JSON.stringify({
          text,
          model: opts?.model === 'mock' ? 'mock' : 'embeddinggemma',
        }),
        signal: opts?.signal ?? AbortSignal.timeout(opts?.timeoutMs ?? 10_000),
      });

      if (response.ok) {
        const data = await response.json() as { embedding?: number[]; model?: string };
        // The route answers an unauthenticated call with 200 + an all-zero vector; never accept it.
        if (Array.isArray(data.embedding) && data.embedding.length > 0 && data.embedding.some((v) => v !== 0)) {
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

  // CANONICAL_EMBEDDING_UNAVAILABLE: no ONNX, deterministic, or zero-vector fallback.
  return null;
}

/** Explicit ONNX challenger/proof executor. Never canonical, never promotion evidence. */
export async function tryEmbedOnnxChallenger(text: string): Promise<OnnxChallengerEmbeddingResult | null> {
  const { tryEmbedOnnx, isOnnxEmbedAvailable, getOnnxEmbedLocalModelPath } = await import('./onnx-embed.js');
  if (!(await isOnnxEmbedAvailable())) return null;
  const embedding = await tryEmbedOnnx(text);
  if (!embedding) return null;
  return {
    embedding,
    provider: 'onnx-local-cpu',
    modelArtifactPath: getOnnxEmbedLocalModelPath(),
    recipe: 'mean_pool_last_hidden_state_l2_no_dense',
    canonicalAuthority: false,
    promotionEligible: false,
  };
}
