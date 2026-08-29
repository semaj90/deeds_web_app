import type { EmbeddingContextPlanV1 } from './embedding-context-plan-v1.js';
import {
  digestSemantic768OutputV1,
  validateSemantic768OutputV1,
  type AtlasEmbeddingRuntimeResultV1,
  type AtlasEmbeddingRuntimeV1,
} from './embedding-runtime-v1.js';

type FetchLike = typeof fetch;

type OllamaEmbeddingResponseV1 = {
  embeddings?: unknown[];
  embedding?: unknown;
};

export function createOllamaEmbeddingRuntimeV1(input: {
  endpoint: string;
  model: string;
  fetchImpl?: FetchLike;
}): AtlasEmbeddingRuntimeV1 {
  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = input.endpoint.replace(/\/+$/, '');

  return {
    executorId: 'OLLAMA',
    async embed(plan: EmbeddingContextPlanV1): Promise<AtlasEmbeddingRuntimeResultV1> {
      const response = await fetchImpl(`${endpoint}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: input.model, input: [plan.renderedInput] }),
      });
      if (!response.ok) throw new Error(`OLLAMA_EMBEDDING_HTTP_${response.status}`);

      const payload = await response.json() as OllamaEmbeddingResponseV1;
      const raw = Array.isArray(payload.embeddings)
        ? payload.embeddings[0]
        : payload.embedding;
      if (!Array.isArray(raw)) throw new Error('OLLAMA_EMBEDDING_VECTOR_MISSING');
      const vector = validateSemantic768OutputV1(raw);

      return {
        executorId: 'OLLAMA',
        representationId: 'semantic_768',
        representationRevision: plan.representationRevision,
        modelRevision: plan.modelRevision,
        tokenizerRevision: plan.tokenizerRevision,
        promptRevision: plan.promptRevision,
        dimension: 768,
        normalized: true,
        vector,
        outputChecksum: digestSemantic768OutputV1(vector),
      };
    },
  };
}
