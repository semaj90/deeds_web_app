import {
  executeEmbeddingInputV1,
  type EmbeddingExecutionResultV1,
  type EmbeddingInputModeV1,
} from './embedding-execution-adapter-v1.js';
import { resolveEmbeddingProviderV1, type EmbeddingProviderV1 } from './embedding-provider-v1.js';

/**
 * EMBED-CALLER-CONVERGENCE-01: the single HTTP executor behind `executeEmbeddingInputV1` for
 * query-time callers that used to hand-roll `fetch(<ollama>/api/embeddings)`.
 *
 * It centralizes only what each caller duplicated: endpoint shape per provider, model id, timeout,
 * and the `EMBEDDING_HTTP_<status>` failure. It deliberately adds NO cache, retry or backend
 * fallback (that is the `embed.ts` facade's job): swapping a caller onto it keeps the backend the
 * caller already used. The recipe stays the caller's explicit `mode`; vector shape is validated by
 * the adapter. Persistence is never performed here.
 */
export const DEFAULT_PROVIDER_EXECUTOR_TIMEOUT_MS = 30_000;

type ProviderShape = Pick<EmbeddingProviderV1, 'provider' | 'baseUrl' | 'modelId'>;

export interface ProviderExecutorOptionsV1 {
  /** Defaults to `resolveEmbeddingProviderV1()` (env-driven). Tests and config-driven callers pass it. */
  provider?: ProviderShape;
  /** Overrides only the base URL, e.g. a caller whose config carries its own host and port. */
  baseUrl?: string;
  timeoutMs?: number;
  keepAlive?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function stripSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function createProviderEmbeddingExecutorV1(
  options: ProviderExecutorOptionsV1 = {},
): (formattedText: string) => Promise<unknown> {
  const provider = options.provider ?? resolveEmbeddingProviderV1();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_EXECUTOR_TIMEOUT_MS;

  return async (formattedText: string): Promise<unknown> => {
    if (provider.provider === 'onnx_directml') {
      throw new Error('EMBEDDING_PROVIDER_UNSUPPORTED_FOR_EXECUTOR:onnx_directml');
    }
    const baseUrl = options.baseUrl ?? provider.baseUrl;
    if (!baseUrl) throw new Error('EMBEDDING_PROVIDER_BASE_URL_MISSING');
    const base = stripSlash(baseUrl);
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);

    if (provider.provider === 'ollama') {
      const response = await fetchImpl(`${base}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: provider.modelId,
          prompt: formattedText,
          ...(options.keepAlive ? { keep_alive: options.keepAlive } : {}),
        }),
        signal,
      });
      if (!response.ok) throw new Error(`EMBEDDING_HTTP_${response.status}`);
      const body = (await response.json()) as { embedding?: unknown; embeddings?: unknown[] };
      return body.embedding ?? body.embeddings?.[0];
    }

    // llama_cpp_gguf: OpenAI-compatible llama-server embedding endpoint.
    const response = await fetchImpl(`${base.replace(/\/v1$/, '')}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma', input: formattedText }),
      signal,
    });
    if (!response.ok) throw new Error(`EMBEDDING_HTTP_${response.status}`);
    const body = (await response.json()) as { data?: Array<{ embedding?: unknown }> };
    return body.data?.[0]?.embedding;
  };
}

/** Recipe-explicit query embedding: caller states the mode; transport, shape check and failures are shared. */
export async function executeProviderEmbeddingV1(
  input: { text: string; mode?: EmbeddingInputModeV1; title?: string | null } & ProviderExecutorOptionsV1,
): Promise<EmbeddingExecutionResultV1> {
  const { text, mode, title, ...options } = input;
  return executeEmbeddingInputV1({ text, mode, title, executor: createProviderEmbeddingExecutorV1(options) });
}
