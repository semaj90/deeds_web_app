import { ENV } from '$lib/server/env.server.js';
import { assertEmbeddingModel } from '$lib/ai/model-ids.js';
import { traceLLM, traceEmbedding } from '$lib/server/observability/langfuse.js';
import {
  getEmbeddingModelKeepAlive,
  ollamaFetch,
} from '$lib/server/ollama.js';
import { getOllamaEndpoint, getOllamaEmbeddingEndpoint } from '$lib/server/utils/ollama-endpoint.js';
import { LLAMA_SERVER_BASE_URL } from './local-llama-provider.js';
import { resolveLoadedLlamaModel } from './llama-server-model-resolver.js';

const DEFAULT_OLLAMA_URL = getOllamaEndpoint();
const DEFAULT_EMBED_OLLAMA_URL = getOllamaEmbeddingEndpoint();
const DEFAULT_EMBED_MODEL = ENV.OLLAMA_EMBED_MODEL;
const DEFAULT_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 45_000);

export interface OllamaGenerateResponse {
  model: string;
  response: string;
  context?: number[];
  done?: boolean;
}

export interface OllamaGenerateParams {
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  context?: number[];
  stream?: boolean;
  timeoutMs?: number;
}

export interface OllamaEmbeddingResponse {
  model: string;
  embedding: number[];
}

export interface OllamaEmbeddingParams {
  text: string;
  model?: string;
  timeoutMs?: number;
}

export function getOllamaBaseUrl(): string {
  return DEFAULT_OLLAMA_URL;
}

export function getOllamaEmbeddingBaseUrl(): string {
  return DEFAULT_EMBED_OLLAMA_URL;
}

export async function fetchFromOllama<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const url = `${getOllamaBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

  try {
    const response = await ollamaFetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`Ollama request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateCompletion(
  params: OllamaGenerateParams
): Promise<OllamaGenerateResponse> {
  const { resolvedModel: model } = await resolveLoadedLlamaModel(
    LLAMA_SERVER_BASE_URL.replace(/\/v1\/?$/, ''), params.model ?? null);
  const body = {
    model,
    messages: [
      ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
      { role: 'user', content: params.prompt },
    ],
    stream: params.stream ?? false,
    temperature: params.temperature ?? 0.7,
    max_tokens: params.maxTokens ?? 512,
  };

  return traceLLM(
    'llama-server-completion',
    { model, prompt: params.prompt.slice(0, 500) },
    async (gen) => {
      const response = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(params.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`llama-server request failed (${response.status}): ${await response.text()}`);
      }
      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const result: OllamaGenerateResponse = {
        model,
        response: data.choices?.[0]?.message?.content ?? '',
        done: true,
      };
      gen.end({ output: result.response.slice(0, 1000) });
      return result;
    }
  );
}

export async function generateEmbedding(
  params: OllamaEmbeddingParams
): Promise<OllamaEmbeddingResponse> {
  const model = assertEmbeddingModel(
    params.model ?? DEFAULT_EMBED_MODEL ?? 'embeddinggemma:latest'
  );
  const body = {
    model,
    input: [params.text],
    keep_alive: getEmbeddingModelKeepAlive(),
  };

  return traceEmbedding(params.text, model, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(`${getOllamaEmbeddingBaseUrl()}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new Error(`Ollama request failed (${response.status}): ${text}`);
      }

      const result = (await response.json()) as { model: string; embeddings: number[][] };
      return {
        model: result.model,
        embedding: result.embeddings[0],
      };
    } finally {
      clearTimeout(timeout);
    }
  });
}

export async function listOllamaModels(): Promise<string[]> {
    const data = await fetchFromOllama<{ models: Array<{
	name: string }> }>('/api/tags', {
        method: 'GET',
    });
    return data.models?.map((m) => m.name) ?? [];
}
