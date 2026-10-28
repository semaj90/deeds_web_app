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

import { createHash } from 'node:crypto';
import { ENV } from '../env.server.js';
import { digestSemantic768OutputV1, validateSemantic768OutputV1 } from '../atlas/embedding/embedding-runtime-v1.js';
import { EMBEDDINGGEMMA_TASK_MODES_V1, type EmbeddingGemmaTaskModeV1 } from './embedding-contract-768.js';
import type { EmbeddingInputModeV1 } from './embedding-execution-adapter-v1.js';

type ApiEmbedObservation = {
  schema: 'atlas.embedding-execution-observation.v1';
  status: 'OBSERVED_NOT_VERIFIED';
  source: string;
  reportedModel: string;
  dimensions: number;
  cacheHit: boolean;
  inputChecksum: string;
  vectorChecksum: string;
};

type ApiEmbedInputRecipe = {
  mode: EmbeddingInputModeV1;
  promptRevision: string;
  sourceTextDigest: string;
  formattedInputChecksum: string;
};

export type CanonicalEmbeddingResult = {
  model: string;
  embedding: number[];
  source: 'api-embed';
  executionObservation?: ApiEmbedObservation;
  inputRecipe?: ApiEmbedInputRecipe;
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
  representationRevision: null;
  model: string;
  embedding: number[];
  executor: 'llama-server';
  endpoint: '/v1/embeddings';
  modelArtifactRevision: string;
  tokenizerRevision: string;
  inputPolicyRevision: string;
  admittedTokenCount: number;
  inputChecksum: string;
  outputChecksum: string;
  qualification: 'REPRESENTATION_REVISION_UNQUALIFIED';
};

export type Semantic768QueryExecutionEvidence = Omit<Semantic768CanonicalResult, 'embedding'>;

const SHA256_HEX = /^(?:sha256:)?[a-f0-9]{64}$/i;

function readApiEmbedObservation(value: unknown): ApiEmbedObservation | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const observation = value as Partial<ApiEmbedObservation>;
  if (
    observation.schema !== 'atlas.embedding-execution-observation.v1'
    || observation.status !== 'OBSERVED_NOT_VERIFIED'
    || typeof observation.source !== 'string'
    || typeof observation.reportedModel !== 'string'
    || observation.dimensions !== 768
    || typeof observation.cacheHit !== 'boolean'
    || typeof observation.inputChecksum !== 'string'
    || !SHA256_HEX.test(observation.inputChecksum)
    || typeof observation.vectorChecksum !== 'string'
    || !SHA256_HEX.test(observation.vectorChecksum)
  ) return undefined;
  return observation as ApiEmbedObservation;
}

function readApiEmbedInputRecipe(value: unknown): ApiEmbedInputRecipe | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const recipe = value as Partial<ApiEmbedInputRecipe>;
  if (
    typeof recipe.mode !== 'string'
    || ![...EMBEDDINGGEMMA_TASK_MODES_V1, 'unprompted_legacy'].includes(recipe.mode as EmbeddingInputModeV1)
    || typeof recipe.promptRevision !== 'string'
    || !recipe.promptRevision
    || typeof recipe.sourceTextDigest !== 'string'
    || !SHA256_HEX.test(recipe.sourceTextDigest)
    || typeof recipe.formattedInputChecksum !== 'string'
    || !SHA256_HEX.test(recipe.formattedInputChecksum)
  ) return undefined;
  return recipe as ApiEmbedInputRecipe;
}

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
  if (body.model && body.model !== opts.model) throw new Error(`SEMANTIC_768_MODEL_MISMATCH:${body.model}`);
  const vector = embedding.map(Number);
  if (vector.some((value) => !Number.isFinite(value))) throw new Error('SEMANTIC_768_NON_FINITE');
  try {
    const normalizedVector = validateSemantic768OutputV1(vector);
    return {
      representationId: 'semantic_768',
      representationRevision: null,
      model: body.model ?? opts.model,
      embedding: Array.from(normalizedVector),
      executor: 'llama-server',
      endpoint: '/v1/embeddings',
      modelArtifactRevision: opts.modelArtifactRevision,
      tokenizerRevision: opts.tokenizerRevision,
      inputPolicyRevision: opts.inputPolicyRevision,
      admittedTokenCount: tokenBody.tokens.length,
      inputChecksum: `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`,
      outputChecksum: digestSemantic768OutputV1(normalizedVector),
      qualification: 'REPRESENTATION_REVISION_UNQUALIFIED',
    };
  } catch {
    throw new Error('SEMANTIC_768_NOT_L2_NORMALIZED');
  }
}

export async function tryEmbedCanonical(
  text: string,
  opts?: {
    model?: string;
    baseUrl?: string;
    taskMode?: EmbeddingGemmaTaskModeV1;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<CanonicalEmbeddingResult | null> {
  try {
    const baseUrl = (opts?.baseUrl ?? ENV.SELF_URL ?? '').replace(/\/+$/, '');
    if (baseUrl) {
      const isMock = opts?.model === 'mock';
      const taskMode = opts?.taskMode ?? (isMock ? undefined : 'code_retrieval_query');
      const payload: Record<string, unknown> = {
        text,
        model: isMock ? 'mock' : 'embeddinggemma',
        ...(taskMode ? { taskMode } : {}),
      };
      const response = await fetch(`${baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The route's schema only accepts 'embeddinggemma' | 'mock'; a tagged name such as
        // 'embeddinggemma:latest' is rejected with 400.
        body: JSON.stringify(payload),
        signal: opts?.signal ?? AbortSignal.timeout(opts?.timeoutMs ?? 10_000),
      });

      if (response.ok) {
        const data = await response.json() as {
          embedding?: number[];
          model?: string;
          executionObservation?: unknown;
          inputRecipe?: unknown;
        };
        if (Array.isArray(data.embedding)) {
          const embedding = validateSemantic768OutputV1(data.embedding);
          const executionObservation = readApiEmbedObservation(data.executionObservation);
          const inputRecipe = readApiEmbedInputRecipe(data.inputRecipe);
          return {
            model: data.model ?? opts?.model ?? 'embeddinggemma:latest',
            embedding: Array.from(embedding),
            source: 'api-embed',
            ...(executionObservation && { executionObservation }),
            ...(inputRecipe && { inputRecipe }),
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
