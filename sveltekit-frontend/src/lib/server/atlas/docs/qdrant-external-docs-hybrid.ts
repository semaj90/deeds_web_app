import type {
  ExternalDocsHybridQdrantPort,
  QdrantHybridWirePointV1,
} from '@deeds/parent-atlas';
import { ENV } from '../../env.server.js';

const COLLECTION = 'external_programming_docs_hybrid_768';

function qdrantHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(ENV.QDRANT_API_KEY ? { 'api-key': ENV.QDRANT_API_KEY } : {}),
  };
}

function qdrantUrl(path: string): string {
  return `${ENV.QDRANT_URL.replace(/\/$/, '')}${path}`;
}

async function qdrantJson(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(qdrantUrl(path), {
    ...init,
    headers: { ...qdrantHeaders(), ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`QDRANT_EXTERNAL_DOCS_FAILED:${response.status}:${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * Creates only the shadow hybrid collection. It never mutates or drops the
 * existing external_programming_docs_768 collection.
 */
export async function ensureExternalDocsHybridShadowCollection(): Promise<'CREATED' | 'EXISTS'> {
  const existing = await fetch(qdrantUrl(`/collections/${COLLECTION}`), { headers: qdrantHeaders() });
  if (existing.ok) return 'EXISTS';
  if (existing.status !== 404) {
    throw new Error(`QDRANT_EXTERNAL_DOCS_PROBE_FAILED:${existing.status}`);
  }

  await qdrantJson(`/collections/${COLLECTION}`, {
    method: 'PUT',
    body: JSON.stringify({
      vectors: {
        semantic_768: {
          size: 768,
          distance: 'Cosine',
          on_disk: true,
        },
      },
      sparse_vectors: {
        lexical_bm25: {
          modifier: 'idf',
        },
      },
      hnsw_config: { on_disk: true },
      on_disk_payload: true,
      metadata: {
        atlas_owner: 'external-doc-knowledge-fabric',
        atlas_projection: 'semantic_768+lexical_bm25',
        canonical_authority: false,
      },
    }),
  });
  return 'CREATED';
}

function operationId(body: any): string | number | null {
  return body?.result?.operation_id ?? body?.result?.operationId ?? null;
}

export function createExternalDocsHybridQdrantPort(): ExternalDocsHybridQdrantPort {
  return {
    async upsert(points: QdrantHybridWirePointV1[]) {
      if (points.length === 0) return [];
      const body = await qdrantJson(`/collections/${COLLECTION}/points?wait=true`, {
        method: 'PUT',
        body: JSON.stringify({ points }),
      });
      const id = operationId(body);
      return id === null ? [] : [id];
    },
    async delete(pointIds: string[]) {
      if (pointIds.length === 0) return [];
      const body = await qdrantJson(`/collections/${COLLECTION}/points/delete?wait=true`, {
        method: 'POST',
        body: JSON.stringify({ points: pointIds }),
      });
      const id = operationId(body);
      return id === null ? [] : [id];
    },
  };
}
