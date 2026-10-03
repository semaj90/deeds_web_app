import type { ExternalDocRetrievalFilterV1, ExternalDocRetrievalRuntimePort } from '@deeds/parent-atlas';
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

export function buildExternalDocQdrantFilter(documentFilter: ExternalDocRetrievalFilterV1): Record<string, unknown> {
  return {
    must: [
      { key: 'provider', match: { value: documentFilter.provider } },
      { key: 'product', match: { value: documentFilter.product } },
      { key: 'product_version', match: { value: documentFilter.product_version } },
      documentFilter.architecture === null
        ? { is_null: { key: 'architecture' } }
        : { key: 'architecture', match: { value: documentFilter.architecture } },
      { key: 'source_authority', match: { value: documentFilter.source_authority } },
      { key: 'canonical_authority', match: { value: false } },
    ],
  };
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
    async queryDense({ queryVector, k, documentFilter }) {
      return query({
        query: queryVector,
        using: 'semantic_768',
        limit: k,
        filter: buildExternalDocQdrantFilter(documentFilter),
        with_payload: true,
      });
    },
    async queryBm25({ queryText, k, documentFilter }) {
      return query({
        query: {
          text: queryText,
          model: 'qdrant/bm25',
        },
        using: 'lexical_bm25',
        filter: buildExternalDocQdrantFilter(documentFilter),
        limit: k,
        with_payload: true,
      });
    },
    async queryHybridRrf({ queryText, queryVector, k, prefetchK, documentFilter }) {
      const filter = buildExternalDocQdrantFilter(documentFilter);
      return query({
        prefetch: [
          {
            query: queryVector,
            using: 'semantic_768',
            limit: prefetchK,
            filter,
          },
          {
            query: {
              text: queryText,
              model: 'qdrant/bm25',
            },
            using: 'lexical_bm25',
            limit: prefetchK,
            filter,
          },
        ],
        query: { fusion: 'rrf' },
        limit: k,
        filter,
        with_payload: true,
      });
    },
  };
}
