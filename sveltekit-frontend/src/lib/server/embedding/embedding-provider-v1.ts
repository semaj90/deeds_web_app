import { createHash } from 'node:crypto';
import { ENV } from '$lib/server/env.server.js';

/**
 * EMBED-PROVIDER-CONVERGENCE-01
 *
 * This module is the ONE place that interprets embedding provider routing.
 * Network endpoint variables are compatibility inputs; EMBEDDING_PROVIDER and
 * the dev-launcher-only EMBEDDING_BACKEND hint may select the in-process ONNX
 * lane, which deliberately has no HTTP base URL.
 *
 * Network URL precedence:
 *   1. EMBEDDING_BASE_URL
 *   2. OLLAMA_EMBED_BASE_URL
 *   3. EMBED_SERVER_URL
 *   4. OLLAMA_BASE_URL (Ollama fallback)
 *
 * In-process precedence:
 *   - EMBEDDING_PROVIDER=onnx_directml explicitly selects ONNX DirectML.
 *   - EMBEDDING_BACKEND=onnx_directml is a compatibility hint owned by
 *     dev-gpu-runtime.mjs. It is read from process.env only here because the
 *     frozen ENV object does not expose EMBEDDING_BACKEND; no other consumer
 *     should interpret it independently.
 *   - ONNX DirectML is Windows-only; on other platforms routing falls through
 *     to the configured network provider/Ollama instead of claiming DirectML.
 *
 * A dedicated :8081 URL still identifies llama_cpp_gguf unless the ONNX
 * in-process lane is explicitly selected. A stale EMBEDDING_PROVIDER=ollama
 * never overrides a concrete dedicated-server URL.
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

export interface EmbeddingProviderEnvV1 {
  EMBEDDING_PROVIDER?: string | null;
  EMBEDDING_BACKEND?: string | null;
  EMBEDDING_BASE_URL?: string | null;
  OLLAMA_EMBED_BASE_URL?: string | null;
  EMBED_SERVER_URL?: string | null;
  OLLAMA_BASE_URL?: string | null;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function clean(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

/** Pure resolver used by tests and by the ENV-backed production wrapper. */
export function resolveEmbeddingProviderFromEnvV1(
  input: EmbeddingProviderEnvV1,
  platform = process.platform,
): EmbeddingProviderV1 {
  const modelId = 'embeddinggemma:latest';
  const explicitProvider = clean(input.EMBEDDING_PROVIDER).toLowerCase();
  const backendHint = clean(input.EMBEDDING_BACKEND).toLowerCase();
  const wantsOnnxDirectML =
    explicitProvider === 'onnx_directml' || backendHint === 'onnx_directml';

  // ONNX is in-process and therefore does NOT require or own an HTTP base URL.
  // This check must happen before URL routing. The previous implementation only
  // considered onnx_directml inside `if (candidateUrl)`, which made a correctly
  // configured in-process backend fall through to Ollama whenever dev:gpu
  // cleared the dedicated :8081 URLs.
  if (wantsOnnxDirectML && platform === 'win32') {
    return {
      provider: 'onnx_directml',
      baseUrl: null,
      modelId,
      dimensions: 768,
      representationId: 'semantic_768',
    };
  }

  const candidateUrl =
    clean(input.EMBEDDING_BASE_URL) ||
    clean(input.OLLAMA_EMBED_BASE_URL) ||
    clean(input.EMBED_SERVER_URL) ||
    null;

  if (candidateUrl) {
    return {
      provider: 'llama_cpp_gguf',
      baseUrl: stripTrailingSlash(candidateUrl),
      modelId,
      dimensions: 768,
      representationId: 'semantic_768',
    };
  }

  return {
    provider: 'ollama',
    baseUrl: stripTrailingSlash(clean(input.OLLAMA_BASE_URL) || 'http://127.0.0.1:11434'),
    modelId,
    dimensions: 768,
    representationId: 'semantic_768',
  };
}

export function resolveEmbeddingProviderV1(): EmbeddingProviderV1 {
  return resolveEmbeddingProviderFromEnvV1({
    EMBEDDING_PROVIDER: ENV.EMBEDDING_PROVIDER,
    // Compatibility bridge only. Keep interpretation centralized here rather
    // than adding another routing decision to env.server.ts or call sites.
    EMBEDDING_BACKEND: process.env.EMBEDDING_BACKEND,
    EMBEDDING_BASE_URL: ENV.EMBEDDING_BASE_URL,
    OLLAMA_EMBED_BASE_URL: ENV.OLLAMA_EMBED_BASE_URL,
    EMBED_SERVER_URL: ENV.EMBED_SERVER_URL,
    OLLAMA_BASE_URL: ENV.OLLAMA_BASE_URL,
  });
}

// ── EmbeddingReceiptV1 — fail-closed validation, applied globally ──────────
//
// Not just "is this a zero vector" — every embedding receipt must prove:
// correct dimensionality, every value finite, a real non-degenerate norm, and
// complete identity/provenance metadata.

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

/** Just the vector-shape half of a receipt — for raw executor tiers. */
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

/** Builds a complete EmbeddingReceiptV1 from a raw vector + source text. */
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