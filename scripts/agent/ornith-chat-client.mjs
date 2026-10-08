const DEFAULT_BASE_URL = 'http://127.0.0.1:8090';
const DEFAULT_MODEL_ID = 'ornith-1.5-9b';

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '').replace(/\/v1$/, '');
}

export async function resolveOrnithModelV1({
  baseUrl = process.env.LLAMA_SERVER_URL || DEFAULT_BASE_URL,
  modelId = process.env.LLAMA_SERVER_MODEL || DEFAULT_MODEL_ID,
  fetchImpl = fetch,
  timeoutMs = 5_000,
} = {}) {
  const endpoint = normalizeBaseUrl(baseUrl);
  const response = await fetchImpl(`${endpoint}/v1/models`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`ORNITH_MODELS_REQUEST_FAILED:${response.status}`);
  const payload = await response.json();
  const models = Array.isArray(payload?.data) ? payload.data : [];
  const match = models.find((item) => item?.id === modelId);
  if (!match) throw new Error(`ORNITH_MODEL_NOT_ADVERTISED:${modelId}`);
  return { endpoint, modelId: match.id };
}

export async function generateWithOrnithV1({
  systemPrompt,
  userPrompt,
  baseUrl = process.env.LLAMA_SERVER_URL || DEFAULT_BASE_URL,
  modelId = process.env.LLAMA_SERVER_MODEL || DEFAULT_MODEL_ID,
  apiKey = process.env.LLAMA_SERVER_API_KEY,
  fetchImpl = fetch,
  timeoutMs = 60_000,
  maxTokens = 512,
} = {}) {
  if (!systemPrompt?.trim() || !userPrompt?.trim()) {
    throw new Error('ORNITH_PROMPT_REQUIRED');
  }
  const resolved = await resolveOrnithModelV1({ baseUrl, modelId, fetchImpl });
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetchImpl(`${resolved.endpoint}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: resolved.modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`ORNITH_CHAT_REQUEST_FAILED:${response.status}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('ORNITH_CHAT_EMPTY_RESPONSE');
  }
  return {
    endpoint: resolved.endpoint,
    modelId: resolved.modelId,
    content: content.trim(),
    promptTokens: Number.isInteger(payload?.usage?.prompt_tokens) ? payload.usage.prompt_tokens : null,
    completionTokens: Number.isInteger(payload?.usage?.completion_tokens) ? payload.usage.completion_tokens : null,
  };
}
