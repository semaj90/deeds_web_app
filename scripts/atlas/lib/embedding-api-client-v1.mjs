export function resolveEmbeddingApiBaseUrlV1(env = process.env) {
  const candidate = env.EMBEDDING_API_URL ?? env.SELF_URL ?? env.PUBLIC_API_URL;
  if (typeof candidate !== 'string' || candidate.trim() === '') return null;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('INVALID_EMBEDDING_API_BASE_URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('INVALID_EMBEDDING_API_BASE_URL');
  }
  return parsed.origin;
}

export function assertEmbeddingApiConfiguredForApplyV1({ apply, noQdrant, baseUrl }) {
  if (apply && !noQdrant && !baseUrl) throw new Error('EMBEDDING_API_BASE_URL_REQUIRED_FOR_QDRANT_APPLY');
}

export async function requestEmbeddingV1({ baseUrl, text, mode = 'unprompted_legacy', fetchImpl = fetch }) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw new Error('EMBEDDING_API_BASE_URL_REQUIRED');
  if (typeof text !== 'string' || text.length === 0) throw new Error('EMBEDDING_API_TEXT_REQUIRED');
  if (mode !== 'unprompted_legacy') throw new Error(`UNSUPPORTED_EMBEDDING_API_MODE:${mode}`);

  const response = await fetchImpl(new URL('/api/embed', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, taskMode: mode }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`EMBEDDING_API_HTTP_${response.status}`);

  const result = await response.json();
  if (
    result?.inputRecipe?.mode !== mode ||
    typeof result.inputRecipe.promptRevision !== 'string' ||
    !result.inputRecipe.promptRevision
  ) {
    throw new Error('EMBEDDING_API_RECIPE_RECEIPT_MISMATCH');
  }
  if (
    !Array.isArray(result.embedding) ||
    result.embedding.length !== 768 ||
    !result.embedding.every(Number.isFinite)
  ) {
    throw new Error('EMBEDDING_API_VECTOR_INVALID');
  }

  return { embedding: result.embedding, inputRecipe: result.inputRecipe };
}
