import { createHash } from 'node:crypto';
import { ENV } from '$lib/server/env.server.js';

/**
 * EMBED-PROVIDER-CONVERGENCE-01
 *
 * Found live 2026-09-02: generateEmbeddings()'s Tier-1 fallback read
 * ENV.OLLAMA_EMBED_BASE_URL while the GET /api/embed diagnostic route
 * reported the live server through a *different* env var
 * (ENV.EMBEDDING_BASE_URL, resolved via resolveEmbeddingBackend's
 * `configuredBaseUrl` option) — two independent interpretations of "where
 * is the embedding endpoint", silently pointing at different values.
 *
 * This module is the ONE place that interprets the compatibility env vars.
 * Every consumer (the /api/embed route, embedding-client.ts's Tier-1,
 * embed-chunks.mjs, any future canonical semantic_768 backfill or query-time
 * embed call) MUST call resolveEmbeddingProviderV1() rather than reading
 * EMBEDDING_BASE_URL / OLLAMA_EMBED_BASE_URL / EMBED_SERVER_URL /
 * OLLAMA_BASE_URL / EMBEDDING_PROVIDER itself. Those four env vars remain
 * valid — they are compatibility INPUTS to this one resolver, not parallel
 * routing decisions.
 *
 * Precedence (documented, not implicit — first one set wins):
 *   1. EMBEDDING_BASE_URL      — current primary; already resolves to the
 *                                 live :8081 GGUF/CUDA server in this env
 *   2. OLLAMA_EMBED_BASE_URL   — legacy name for the same dedicated server
 *   3. EMBED_SERVER_URL        — scripts/startup/dev-gpu-runtime.mjs's own
 *                                 name for the same server
 *   4. OLLAMA_BASE_URL         — Ollama-managed fallback (provider: 'ollama')
 * EMBEDDING_PROVIDER='onnx_directml' is the one recognized override — it
 * opts into the in-process ONNX path even when a dedicated-server URL is
 * also configured. Any other EMBEDDING_PROVIDER value (including a stale
 * 'ollama' left over from before the dedicated server existed) is ignored
 * once a dedicated-server URL resolves — the URL is stronger evidence than
 * a label. EMBEDDING_PROVIDER never substitutes for a baseUrl.
 */

export const EMBEDDING_PROVIDER_NAMES = ['llama_cpp_gguf', 'ollama', 'onnx_directml'] as const;
export type EmbeddingProviderNameV1 = (typeof EMBEDDING_PROVIDER_NAMES)[number];

export interface EmbeddingProviderV1 {
  provider: EmbeddingProviderNameV1;
  baseUrl: string | null;
  modelId: string;
  dimensions: 768;
  representationId: 'semantic_768';
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function resolveEmbeddingProviderV1(): EmbeddingProviderV1 {
  const modelId = 'embeddinggemma:latest';
  const explicitProvider = String(ENV.EMBEDDING_PROVIDER ?? '').toLowerCase();

  const candidateUrl =
    ENV.EMBEDDING_BASE_URL ||
    ENV.OLLAMA_EMBED_BASE_URL ||
    ENV.EMBED_SERVER_URL ||
    null;

  if (candidateUrl) {
    // A resolved dedicated-server URL always means llama_cpp_gguf, UNLESS
    // EMBEDDING_PROVIDER explicitly opts into onnx_directml (a deliberate,
    // in-process override that coexists with URL config rather than being
    // contradicted by it). EMBEDDING_PROVIDER='ollama' must NOT override a
    // resolved dedicated-server URL — found live 2026-09-02: a stale
    // EMBEDDING_PROVIDER=ollama in this env, left from before the :8081
    // server existed, silently mislabeled the resolved provider as 'ollama'
    // while baseUrl correctly pointed at :8081, which made every consumer
    // gated on `provider === 'llama_cpp_gguf'` skip the live server. The URL
    // is the stronger evidence; 'ollama' is only ever inferred in the
    // no-URL-configured fallback branch below.
    const provider: EmbeddingProviderNameV1 =
      explicitProvider === 'onnx_directml' ? 'onnx_directml' : 'llama_cpp_gguf';
    return {
      provider,
      baseUrl: stripTrailingSlash(candidateUrl),
      modelId,
      dimensions: 768,
      representationId: 'semantic_768',
    };
  }

  return {
    provider: 'ollama',
    baseUrl: stripTrailingSlash(ENV.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'),
    modelId,
    dimensions: 768,
    representationId: 'semantic_768',
  };
}

// ── EmbeddingReceiptV1 — fail-closed validation, applied globally ──────────
//
// Not just "is this a zero vector" (embed-chunks.mjs's original, narrower
// check) — every embedding receipt must prove: correct dimensionality, every
// value finite, a real (non-zero, non-degenerate) norm, and full identity/
// provenance metadata. A receipt failing any of these must never be treated
// as a successful embedding by any caller.

export interface EmbeddingReceiptV1 {
  embedding: number[];
  modelId: string;
  representationRevision: string;
  inputChecksum: string;
  vectorChecksum: string;
}

export type EmbeddingReceiptFailureV1 =
  | 'DIMENSIONS_NOT_768'
  | 'NON_FINITE_VALUES'
  | 'ZERO_OR_DEGENERATE_NORM'
  | 'MISSING_MODEL_IDENTITY'
  | 'MISSING_REPRESENTATION_REVISION'
  | 'MISSING_INPUT_CHECKSUM'
  | 'MISSING_VECTOR_CHECKSUM';

export interface EmbeddingReceiptCheckV1Result {
  ok: boolean;
  failures: EmbeddingReceiptFailureV1[];
}

export type VectorShapeFailureV1 = Extract<
  EmbeddingReceiptFailureV1,
  'DIMENSIONS_NOT_768' | 'NON_FINITE_VALUES' | 'ZERO_OR_DEGENERATE_NORM'
>;

/** Just the vector-shape half of a receipt — for call sites (raw executor
 * tiers) that produce a vector but not yet the full identity/provenance
 * metadata a persisted EmbeddingReceiptV1 requires. */
export function checkVectorShapeV1(vec: unknown): { ok: boolean; failures: VectorShapeFailureV1[] } {
  const failures: VectorShapeFailureV1[] = [];
  if (!Array.isArray(vec) || vec.length !== 768) {
    failures.push('DIMENSIONS_NOT_768');
    return { ok: false, failures };
  }
  if (!vec.every((v) => Number.isFinite(v))) {
    failures.push('NON_FINITE_VALUES');
    return { ok: false, failures };
  }
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (!(norm > 1e-6) || !Number.isFinite(norm)) failures.push('ZERO_OR_DEGENERATE_NORM');
  return { ok: failures.length === 0, failures };
}

export function checkEmbeddingReceiptV1(
  input: Partial<EmbeddingReceiptV1>,
): EmbeddingReceiptCheckV1Result {
  const shape = checkVectorShapeV1(input.embedding);
  const failures: EmbeddingReceiptFailureV1[] = [...shape.failures];

  if (!input.modelId) failures.push('MISSING_MODEL_IDENTITY');
  if (!input.representationRevision) failures.push('MISSING_REPRESENTATION_REVISION');
  if (!input.inputChecksum) failures.push('MISSING_INPUT_CHECKSUM');
  if (!input.vectorChecksum) failures.push('MISSING_VECTOR_CHECKSUM');

  return { ok: failures.length === 0, failures };
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Builds a complete EmbeddingReceiptV1 from a raw vector + the text that
 * produced it, computing both checksums so callers don't reimplement this. */
export function buildEmbeddingReceiptV1(
  embedding: number[],
  inputText: string,
  modelId: string,
  representationRevision = 'semantic_768:v1',
): EmbeddingReceiptV1 {
  return {
    embedding,
    modelId,
    representationRevision,
    inputChecksum: sha256Hex(inputText),
    vectorChecksum: sha256Hex(JSON.stringify(embedding)),
  };
}
