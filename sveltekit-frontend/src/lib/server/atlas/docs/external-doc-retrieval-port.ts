import type { ExternalDocRetrievalRuntimePort } from '@deeds/parent-atlas';
import { ENV } from '../../env.server.js';
import { embedSemantic768 } from './semantic-768-client.js';

const COLLECTION = 'external_programming_docs_hybrid_768';

function headers(): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(ENV.QDRANT_API_KEY ? { 'api-key': ENV.QDRANT_API_KEY } : {}),
  };
}

function url(path: string): string {
  return `${ENV.QDRANT_URL.replace(/\/$/, '')}${path}`;
}

async function query(body: unknown): Promise<string[]> {
  const response = await fetch(url(`/collections/${COLLECTION}/points/query`), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`EXTERNAL_DOC_RETRIEVAL_QDRANT_FAILED:${response.status}:${JSON.stringify(payload)}`);
  }
  const points = payload?.result?.points ?? payload?.result ?? [];
  if (!Array.isArray(points)) return [];
  return points
    .map((point: any) => point?.payload?.chunk_id)
    .filter((chunkId: unknown): chunkId is string => typeof chunkId === 'string' && chunkId.length > 0);
}

export function createExternalDocRetrievalPort(): ExternalDocRetrievalRuntimePort {
  return {
    async embedSemantic768(queryText) {
      const [vector] = await embedSemantic768([queryText]);
      return vector;
    },
    async queryDense({ queryVector, k }) {
      return query({
        query: queryVector,
        using: 'semantic_768',
        limit: k,
        with_payload: true,
      });
    },
    async queryBm25({ queryText, k }) {
      return query({
        query: {
          text: queryText,
          model: 'qdrant/bm25',
        },
        using: 'lexical_bm25',
        limit: k,
        with_payload: true,
      });
    },
    async queryHybridRrf({ queryText, queryVector, k, prefetchK }) {
      return query({
        prefetch: [
          {
            query: queryVector,
            using: 'semantic_768',
            limit: prefetchK,
          },
          {
            query: {
              text: queryText,
              model: 'qdrant/bm25',
            },
            using: 'lexical_bm25',
            limit: prefetchK,
          },
        ],
        query: { fusion: 'rrf' },
        limit: k,
        with_payload: true,
      });
    },
  };
}
