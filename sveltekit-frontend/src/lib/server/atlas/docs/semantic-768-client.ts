import { ENV } from '../../env.server.js';

type EmbeddingResponse = {
  embeddings?: number[][];
  embedding?: number[];
  data?: Array<{ embedding?: number[] }>;
};

export type Semantic768EmbeddingClientInfo = {
  endpoint: string;
  model: string;
  expectedDimension: 768;
  transport: 'openai_compatible' | 'ollama_api_embed';
};

function resolveEmbeddingClientInfo(): Semantic768EmbeddingClientInfo {
  const explicitBase = (ENV.OLLAMA_EMBED_BASE_URL ?? ENV.EMBEDDING_BASE_URL ?? '').replace(/\/$/, '');
  if (explicitBase) {
    return {
      endpoint: `${explicitBase}/v1/embeddings`,
      model: ENV.OLLAMA_EMBED_MODEL ?? process.env.PRIMARY_EMBEDDING_MODEL ?? process.env.EMBED_MODEL ?? process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest',
      expectedDimension: 768,
      transport: 'openai_compatible',
    };
  }
  const ollama = (ENV.OLLAMA_BASE_URL ?? process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
  return {
    endpoint: `${ollama}/api/embed`,
    model: ENV.OLLAMA_EMBED_MODEL ?? process.env.PRIMARY_EMBEDDING_MODEL ?? process.env.EMBED_MODEL ?? process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest',
    expectedDimension: 768,
    transport: 'ollama_api_embed',
  };
}

export function semantic768EmbeddingClientInfo(): Semantic768EmbeddingClientInfo {
  return resolveEmbeddingClientInfo();
}

export async function embedSemantic768(texts: readonly string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const config = resolveEmbeddingClientInfo();
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.model, input: texts }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`SEMANTIC_768_EMBED_FAILED:${response.status}:${body.slice(0, 300)}`);
  }
  const data = await response.json() as EmbeddingResponse;
  const embeddings = data.embeddings
    ?? data.data?.map((row) => row.embedding ?? [])
    ?? (data.embedding ? [data.embedding] : []);
  if (embeddings.length !== texts.length) {
    throw new Error(`SEMANTIC_768_EMBED_COUNT_MISMATCH:${embeddings.length}:${texts.length}`);
  }
  for (const [index, vector] of embeddings.entries()) {
    if (!Array.isArray(vector) || vector.length !== 768 || vector.some((value) => !Number.isFinite(value))) {
      throw new Error(`SEMANTIC_768_EMBED_DIMENSION_MISMATCH:${index}:${vector?.length ?? 'null'}`);
    }
  }
  return embeddings;
}
