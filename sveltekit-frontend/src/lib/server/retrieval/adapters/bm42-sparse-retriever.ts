import { generateSparseVector } from '$lib/server/vector/bm42-sparse.js';
import { QDRANT_SPARSE_VECTOR_NAME } from '$lib/server/vector/retrieval-semantics.js';
import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';
import { validateCandidate } from '../lane-contracts.js';
import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';

const COLLECTION = 'codebase_chunks_384_hybrid';

/**
 * BM42 sparse retriever — queries the bm42_sparse named sparse vector in Qdrant.
 * Complements the dense lane; intended for RRF fusion, not standalone use.
 */
export function createBm42SparseRetriever(): Retriever {
  return {
    lane: 'sparse' as const,

    async retrieve(input: RetrievalInput): Promise<LaneCandidate[]> {
      const sparse = generateSparseVector(input.query);
      if (sparse.indices.length === 0) return [];

      const qdrant = getQdrantManager();

      let raw: unknown;
      try {
        // QdrantManager may not expose sparse search directly — use raw HTTP
        const res = await fetch(`http://localhost:6333/collections/${COLLECTION}/points/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: { sparse: { indices: sparse.indices, values: sparse.values } },
            using: QDRANT_SPARSE_VECTOR_NAME,
            limit: input.limit,
            with_payload: true,
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          console.warn(`[bm42-sparse-retriever] Qdrant sparse query failed ${res.status}: ${txt}`);
          return [];
        }
        raw = await res.json();
      } catch (err) {
        console.warn('[bm42-sparse-retriever] fetch error:', (err as Error).message);
        return [];
      }

      const points = normalizeQueryResponse(raw);
      const candidates: LaneCandidate[] = [];

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const payload = (pt.payload ?? {}) as Record<string, unknown>;
        const packetKey = (payload.packet_key as string) || String(pt.id);
        const sourceRef = (payload.source_ref as string) || '';

        const candidate = validateCandidate({
          packetKey,
          packetId: payload.chunk_id as string | undefined,
          qdrantPointId: String(pt.id),
          sourceRef,
          rank: i + 1,
          score: typeof pt.score === 'number' ? pt.score : null,
          lane: 'sparse' as const,
          metadata: payload,
        });

        if (candidate) candidates.push(candidate);
      }

      return candidates;
    },
  };
}

function normalizeQueryResponse(raw: unknown): Array<{
  id: string | number;
  score?: number;
  payload?: Record<string, unknown>;
}> {
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Record<string, unknown>;
  // Qdrant /points/query response shape: { result: { points: [...] } }
  const result = r['result'] as Record<string, unknown> | undefined;
  if (result && Array.isArray(result['points'])) return result['points'] as any[];
  if (Array.isArray(r['points'])) return r['points'] as any[];
  if (Array.isArray(r['result'])) return r['result'] as any[];
  return [];
}
