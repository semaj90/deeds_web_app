export interface OllamaModelTagReadbackV1 {
  schema: 'atlas.ollama-model-tag-readback.v1';
  modelId: string;
  modelRevision: `sha256:${string}`;
  readbackStatus: 'OLLAMA_TAG_DIGEST_READBACK';
  authority: 'DAEMON_REPORTED_NOT_ARTIFACT_VERIFIED';
  canonicalAuthority: false;
}

type FetchLike = typeof fetch;

export async function readOllamaModelTagDigestV1(input: {
  endpoint: string;
  modelId: string;
  fetchImpl?: FetchLike;
}): Promise<OllamaModelTagReadbackV1> {
  const endpoint = input.endpoint.trim().replace(/\/+$/, '');
  const modelId = input.modelId.trim();
  if (!endpoint) throw new Error('OLLAMA_MODEL_READBACK_ENDPOINT_REQUIRED');
  if (!modelId) throw new Error('OLLAMA_MODEL_READBACK_MODEL_ID_REQUIRED');
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error('OLLAMA_MODEL_READBACK_ENDPOINT_INVALID');
  }
  if (!['http:', 'https:'].includes(parsedEndpoint.protocol) || parsedEndpoint.username || parsedEndpoint.password) {
    throw new Error('OLLAMA_MODEL_READBACK_ENDPOINT_INVALID');
  }

  const response = await (input.fetchImpl ?? fetch)(`${parsedEndpoint.origin}/api/tags`, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`OLLAMA_MODEL_READBACK_HTTP_${response.status}`);

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { models?: unknown }).models)) {
    throw new Error('OLLAMA_MODEL_READBACK_MODELS_INVALID');
  }

  const models = (payload as { models: unknown[] }).models.filter((model): model is { name?: unknown; model?: unknown; digest?: unknown } =>
    !!model && typeof model === 'object',
  );
  const matching = models.filter((model) => (model.name ?? model.model) === modelId);
  if (matching.length !== 1) throw new Error('OLLAMA_MODEL_READBACK_MODEL_NOT_UNIQUE');
  const digest = matching[0]?.digest;
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/i.test(digest)) {
    throw new Error('OLLAMA_MODEL_READBACK_DIGEST_INVALID');
  }

  return {
    schema: 'atlas.ollama-model-tag-readback.v1',
    modelId,
    modelRevision: `sha256:${digest.toLowerCase()}`,
    readbackStatus: 'OLLAMA_TAG_DIGEST_READBACK',
    authority: 'DAEMON_REPORTED_NOT_ARTIFACT_VERIFIED',
    canonicalAuthority: false,
  };
}
