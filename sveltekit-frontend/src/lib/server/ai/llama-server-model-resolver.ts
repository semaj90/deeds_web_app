/**
 * Bounded llama-server model resolution — GET /v1/models discovery only.
 *
 * Contract (do not deviate without re-reading this file's callers):
 * - Application inference talks to llama-server.exe over the OpenAI-compatible
 *   HTTP API only. Triton (separate HTTP/gRPC server, own model repository
 *   lifecycle) and llama.cpp RPC (`rpc-server`, distributed GGML compute
 *   workers, not an application-facing inference API) are explicitly out of
 *   scope here — do not introduce a gRPC/Triton adapter in this module.
 * - A GGUF file existing on disk (e.g. models/hfor/hforf.gguf) does NOT mean
 *   it is loaded. The only source of truth for "what's actually loaded" is
 *   the running llama-server process's own GET /v1/models response.
 * - This module never scans the filesystem, never launches/restarts/kills
 *   llama-server. Process lifecycle is a separately-owned supervisor's job.
 * - The configured model name and the resolved (actually loaded) model ID
 *   are tracked separately and are not required to be equal — llama-server
 *   may report an alias, a bare filename, or a full GGUF path depending on
 *   how it was started (`-m`/`--alias`). Treat whatever it reports as an
 *   opaque identifier; use it verbatim in requests and logs.
 */

export type ResolvedModelSource = 'configured-match' | 'llama-server-loaded';

export interface ResolvedInferenceModel {
  configuredModel: string | null;
  resolvedModel: string;
  source: ResolvedModelSource;
}

export class LlamaServerUnreachableError extends Error {
  readonly code = 'LLAMA_SERVER_UNREACHABLE';
  constructor(baseUrl: string, cause: unknown) {
    super(`llama-server unreachable at ${baseUrl}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

export class LlamaServerNoModelError extends Error {
  readonly code = 'LLAMA_SERVER_NO_MODEL';
  constructor(baseUrl: string) {
    super(`llama-server at ${baseUrl} reported an empty model list (GET /v1/models)`);
  }
}

export class LlamaServerModelResponseInvalidError extends Error {
  readonly code = 'LLAMA_SERVER_MODEL_RESPONSE_INVALID';
  constructor(baseUrl: string, detail: string) {
    super(`llama-server at ${baseUrl} returned a malformed /v1/models response: ${detail}`);
  }
}

interface OpenAiModelListEntry {
  id: string;
}

/** Structural validation only — does not assume any field beyond OpenAI's `id`. */
function parseOpenAIModelList(baseUrl: string, body: unknown): OpenAiModelListEntry[] {
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new LlamaServerModelResponseInvalidError(baseUrl, 'missing "data" field');
  }
  const data = (body as { data: unknown }).data;
  if (!Array.isArray(data)) {
    throw new LlamaServerModelResponseInvalidError(baseUrl, '"data" is not an array');
  }
  const models: OpenAiModelListEntry[] = [];
  for (const entry of data) {
    if (typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string') {
      models.push({ id: (entry as { id: string }).id });
    }
  }
  return models;
}

/**
 * Discover the model llama-server actually has loaded via GET /v1/models,
 * and reconcile it against a configured model name (if any). Never treats
 * a GGUF's on-disk existence as availability — only a real HTTP response
 * from the running server counts.
 *
 * @param baseUrl        llama-server's OpenAI-compatible base URL, e.g. http://127.0.0.1:8090
 * @param configuredModel The app's configured/preferred model identifier, or null if none
 */
export async function resolveLoadedLlamaModel(
  baseUrl: string,
  configuredModel: string | null,
  timeoutMs = 3_000
): Promise<ResolvedInferenceModel> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/models`;

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new LlamaServerUnreachableError(baseUrl, err);
  }

  if (!response.ok) {
    throw new LlamaServerUnreachableError(baseUrl, `HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new LlamaServerModelResponseInvalidError(baseUrl, err instanceof Error ? err.message : String(err));
  }

  const models = parseOpenAIModelList(baseUrl, body);
  if (models.length === 0) {
    throw new LlamaServerNoModelError(baseUrl);
  }

  const configuredMatch = configuredModel ? models.find((m) => m.id === configuredModel) : undefined;

  return {
    configuredModel: configuredModel ?? null,
    resolvedModel: configuredMatch ? configuredMatch.id : models[0]!.id,
    source: configuredMatch ? 'configured-match' : 'llama-server-loaded',
  };
}
