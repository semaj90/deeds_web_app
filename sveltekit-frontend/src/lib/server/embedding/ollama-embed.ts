/**
 * Embeddings helper supporting two backends:
 *
 *   1. Ollama  (default) — POST /api/embed or /api/embeddings
 *   2. llama-server.exe  — POST /v1/embeddings (OpenAI-compatible)
 *                           launched with: llama-server.exe -m embeddinggemma.gguf
 *                           --embedding --pooling mean --embd-normalize 2
 *                           --ctx-size 2048 --batch-size 512 --ubatch-size 512 --port 8081
 *
 * Environment variables:
 *   EMBEDDING_PROVIDER=ollama|llama-server (required; explicit provider selection)
 *   EMBEDDING_BASE_URL=http://...          (required; backend URL)
 *
 * Legacy support (deprecated):
 *   OLLAMA_EMBED_BASE_URL=http://...       (treated as llama-server if set)
 *   OLLAMA_BASE_URL=http://...             (fallback for Ollama)
 *
 * sourceRef is canonical. cluster IDs are grouping hints only — never join by cluster number.
 */

import { createHash } from 'crypto';

import { assertEmbeddingModel } from '$lib/ai/model-ids.js';
import { ENV } from '$lib/server/env.server.js';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';
import { countTokens } from '$lib/server/llm/token-budget.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { CANONICAL_EMBEDDING_DIMENSION } from '$lib/server/vector/embedding-dimension-guard.js';
import {
  type EmbeddingProvider,
  resolveEmbeddingBackend,
} from './embedding-backend-resolution.js';

export type OllamaEmbedResult = {
  model: string;
  embedding: number[];
  provider: EmbeddingProvider;
  endpoint: string;
};

type EmbeddingResponse = {
  embedding?: number[];
  embeddings?: number[][];
  data?: Array<{ embedding?: number[]; index?: number }>;
  model?: string;
  error?: string | { message?: string };
};

type EndpointAttempt = {
  url: string;
  status?: number;
  error: string;
};

function extractEmbedding(data: EmbeddingResponse): number[] | null {
  if (Array.isArray(data.embedding)) return data.embedding;
  if (Array.isArray(data.embeddings?.[0])) return data.embeddings[0];
  if (Array.isArray(data.data?.[0]?.embedding)) return data.data[0].embedding;
  return null;
}

function validateEmbedding(
  embedding: number[],
  expectedDimensions: number,
): string | null {
  if (embedding.length !== expectedDimensions) {
    return `Embedding dimension mismatch: expected ${expectedDimensions}, received ${embedding.length}`;
  }

  if (!embedding.every(Number.isFinite)) {
    return 'Embedding contains non-finite values';
  }

  return null;
}

function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function buildEmbeddingTraceMetadata(input: {
  text: string;
  model: string;
  provider: EmbeddingProvider;
  baseUrl: string;
  endpoint: string;
  expectedDimensions: number;
  modelPath?: string | null;
}): Record<string, unknown> {
  return {
    provider: input.provider,
    baseUrl: input.baseUrl,
    endpoint: input.endpoint,
    model: input.model,
    modelPath: input.modelPath ?? null,
    expectedDimensions: input.expectedDimensions,
    payloadHash: hashText(input.text),
    payloadBytes: Buffer.byteLength(input.text, 'utf8'),
    estimatedTokenCount: countTokens(input.text),
    textLength: input.text.length,
  };
}

function responseErrorText(data: EmbeddingResponse): string | null {
  if (typeof data.error === 'string') {
    return data.error;
  }

  if (
    data.error &&
    typeof data.error === 'object' &&
    typeof data.error.message === 'string'
  ) {
    return data.error.message;
  }

  return null;
}

function buildCandidates(
  provider: EmbeddingProvider,
  baseUrl: string,
  model: string,
  text: string,
): Array<{ url: string; body: string; name: string }> {
  if (provider === 'llama-server') {
    return [
      {
        url: `${baseUrl}/v1/embeddings`,
        name: '/v1/embeddings (OpenAI-compatible)',
        body: JSON.stringify({
          model,
          input: text,
          encoding_format: 'float',
        }),
      },
      {
        url: `${baseUrl}/embedding`,
        name: '/embedding (llama.cpp native)',
        body: JSON.stringify({
          content: text,
          embd_normalize: 2,
        }),
      },
    ];
  }

  return [
    {
      url: `${baseUrl}/api/embed`,
      name: '/api/embed (Ollama v0.3+)',
      body: JSON.stringify({
        model,
        input: text,
        truncate: false,
      }),
    },
    {
      url: `${baseUrl}/api/embeddings`,
      name: '/api/embeddings (legacy Ollama)',
      body: JSON.stringify({
        model,
        prompt: text,
      }),
    },
  ];
}

export async function tryEmbed(
  text: string,
  opts?: {
    model?: string;
    provider?: EmbeddingProvider;
    baseUrl?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    expectedDimensions?: number;
  },
): Promise<OllamaEmbedResult | null> {
  if (!text.trim()) {
    return null;
  }

  const model = assertEmbeddingModel(opts?.model ?? 'embeddinggemma:latest');
  const resolution = resolveEmbeddingBackend(model, {
    provider: opts?.provider,
    baseUrl: opts?.baseUrl,
    configuredProvider: ENV.EMBEDDING_PROVIDER,
    configuredBaseUrl: ENV.EMBEDDING_BASE_URL,
    fallbackBaseUrl: ENV.OLLAMA_BASE_URL,
  });
  const { provider, baseUrl } = resolution;
  const expectedDimensions = opts?.expectedDimensions ?? CANONICAL_EMBEDDING_DIMENSION;

  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const timeoutId = setTimeout(() => {
    controller.abort(
      new Error(`Embedding request timed out after ${timeoutMs}ms`),
    );
  }, timeoutMs);

  const signal = opts?.signal
    ? AbortSignal.any([opts.signal, controller.signal])
    : controller.signal;

  const attempts: EndpointAttempt[] = [];

  try {
    const candidates = buildCandidates(provider, baseUrl, model, text);
    const traceMetadata = buildEmbeddingTraceMetadata({
      text,
      model,
      provider,
      baseUrl,
      endpoint: candidates[0]?.url ?? '',
      expectedDimensions,
      modelPath: ENV.EMBED_MODEL_PATH ?? null,
    });

    return await traceEmbedding(text, model, async () => {
      traceMetadata['candidateEndpoints'] = candidates.map((candidate) => candidate.url);

      for (const candidate of candidates) {
        try {
          const request = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: candidate.body,
            signal,
          };

          const response =
            provider === 'ollama' ? await ollamaFetch(candidate.url, request) : await fetch(candidate.url, request);

          const raw = await response.text();

          let data: EmbeddingResponse = {};

          if (raw) {
            try {
              data = JSON.parse(raw) as EmbeddingResponse;
            } catch {
              attempts.push({
                url: candidate.url,
                status: response.status,
                error: `Non-JSON response: ${raw.slice(0, 500)}`,
              });
              continue;
            }
          }

          if (!response.ok) {
            attempts.push({
              url: candidate.url,
              status: response.status,
              error: responseErrorText(data) ?? raw ?? response.statusText,
            });
            continue;
          }

          const embedding = extractEmbedding(data);

          if (!embedding) {
            attempts.push({
              url: candidate.url,
              status: response.status,
              error: 'Response did not contain an embedding',
            });
            continue;
          }

          const validationError = validateEmbedding(embedding, expectedDimensions);
          if (validationError) {
            attempts.push({
              url: candidate.url,
              status: response.status,
              error: validationError,
            });
            continue;
          }

          return {
            model: data.model ?? model,
            embedding,
            provider,
            endpoint: candidate.url,
          };
        } catch (error) {
          attempts.push({
            url: candidate.url,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      console.error('[embedding] All endpoints failed', {
        provider,
        baseUrl,
        model,
        textLength: text.length,
        expectedDimensions,
        attempts,
      });

      return null;
    }, traceMetadata);
  } finally {
    clearTimeout(timeoutId);
  }
}

/** @deprecated Use tryEmbed instead */
export async function tryEmbedOllama(
  text: string,
  opts?: {
    model?: string;
    baseUrl?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<OllamaEmbedResult | null> {
  return tryEmbed(text, opts);
}

export function embeddingDims(vec: number[] | null | undefined): number | null {
  return Array.isArray(vec) ? vec.length : null;
}
