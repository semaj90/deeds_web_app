/**
 * Qdrant semantic search over codebase_chunks_768 collection.
 * Returns candidates with stable_key for dedup merge in hybrid-search.ts.
 */

import { ENV } from '$lib/server/env.server.js';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { encodedClusterPrefilter } from '$lib/server/retrieval/encoded-cluster-prefilter.js';
import { getCodebaseAnnBackend } from './codebase-ann-backend.js';
import { searchTurboVecCode } from './turbovec-search.js';
import type { SearchBackend, SearchBackendRequest } from './search-backend.js';

export interface QdrantCodeResult {
  stable_key: string;
  file_path: string;
  packet_key?: string | null;
  source_ref?: string | null;
  feature_id?: string | null;
  symbol_name?: string;
  symbol_kind?: string;
  language?: string;
  content: string;
  tags?: string;
  topo_class?: string;
  graph_authority_score?: number;
  som_cluster?: number | string | null;
  som_bmu_row?: number | null;
  som_bmu_col?: number | null;
  centroid_id?: string | number | null;
  semantic_score: number;
  qdrant_id: string;
}

class QdrantSearchBackend implements SearchBackend<QdrantCodeResult> {
  readonly name = 'qdrant' as const;

  async search(request: SearchBackendRequest): Promise<QdrantCodeResult[]> {
    const { embedding, limit = 30, topoClass, collection = 'codebase_chunks_768' } = request;

    try {
      const mgr = getQdrantClient();
      const filters: Record<string, unknown> = {};

      if (collection === 'codebase_chunks_768') {
        filters.atlas_enriched = true;
      }

      if (topoClass) {
        filters.topo_class = topoClass;
      }

      // Apply encoded-cluster prefilter (Stage A0) if enabled
      if (ENV.ACE_ENCODED_PREFILTER_ENABLED === 'true') {
        try {
          const pre = await encodedClusterPrefilter(new Float32Array(embedding));
          if (pre && pre.filter && pre.filter.should) {
              // Encoded prefilter emits raw Qdrant filter syntax. Keep it disabled
              // for this wrapper until the manager accepts mixed raw filters; the
              // canonical packet proof path must not be masked by filter-shape drift.
            }
        } catch (err) {
          console.warn('[searchQdrantCode] Encoded prefilter failed:', err);
        }
      }

      const res = await mgr.search({
        collection,
        query: '',
        queryEmbedding: embedding,
        limit,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        scoreThreshold: 0.001,
      });

      return (res.results ?? []).map((r) => {
        const p = r.payload ?? {};
        const somCluster = p.som_cluster ?? p.somCluster;
        const packetKey = String(p.packet_key ?? p.packetKey ?? '').trim() || null;
        const sourceRef = String(
          p.source_ref ??
          p.sourceRef ??
          p.canonical_source_ref ??
          p.canonicalSourceRef ??
          p.file_path ??
          p.filePath ??
          p.relative_path ??
          ''
        ).trim() || null;
        return {
          stable_key: packetKey ?? String(p.stable_key ?? p.chunk_id ?? r.id),
          file_path: sourceRef ?? String(p.file_path ?? ''),
          packet_key: packetKey,
          source_ref: sourceRef,
          feature_id: String(p.feature_id ?? p.featureId ?? '').trim() || null,
          symbol_name: p.symbol_name ? String(p.symbol_name) : undefined,
          symbol_kind: p.symbol_kind ? String(p.symbol_kind) : undefined,
          language: p.language ? String(p.language) : undefined,
          content: String(p.content ?? p.chunk_text ?? ''),
          tags: p.tags ? String(p.tags) : undefined,
          topo_class: p.topo_class ? String(p.topo_class) : undefined,
          graph_authority_score:
            typeof p.graph_authority_score === 'number' ? p.graph_authority_score : undefined,
          som_cluster:
            typeof somCluster === 'number' || typeof somCluster === 'string'
              ? somCluster
              : null,
          som_bmu_row: typeof p.som_bmu_row === 'number' ? p.som_bmu_row : null,
          som_bmu_col: typeof p.som_bmu_col === 'number' ? p.som_bmu_col : null,
          centroid_id:
            typeof p.centroid_id === 'number' || typeof p.centroid_id === 'string'
              ? p.centroid_id
              : null,
          semantic_score: r.score,
          qdrant_id: String(r.id),
        };
      });
    } catch {
      return [];
    }
  }
}

class TurboVecSearchBackend implements SearchBackend<QdrantCodeResult> {
  readonly name = 'turbovec' as const;

  async search(request: SearchBackendRequest): Promise<QdrantCodeResult[]> {
    const { embedding, limit = 30, topoClass, collection = 'codebase_chunks_768' } = request;
    return searchTurboVecCode(embedding, limit, topoClass, collection);
  }
}

function createCodebaseSearchBackend(backend: string): SearchBackend<QdrantCodeResult> {
  if (backend === 'turbovec') return new TurboVecSearchBackend();
  if (backend === 'cuvs') {
    console.warn('[searchCodebaseAnn] backend=cuvs not implemented yet; falling back to qdrant');
  }
  return new QdrantSearchBackend();
}

/**
 * Stable ANN retrieval contract for codebase chunks.
 *
 * Current default: Qdrant HNSW.
 * Future experiment lane: cuVS/CAGRA or a small Rust gRPC ANN worker behind the
 * same result shape and caller contract.
 */
export async function searchCodebaseAnn(
  embedding: number[],
  limit = 30,
  topoClass?: string,
  collection = 'codebase_chunks_768'
): Promise<QdrantCodeResult[]> {
  const backend = createCodebaseSearchBackend(getCodebaseAnnBackend());
  return backend.search({ embedding, limit, topoClass, collection });
}

export async function searchQdrantCode(
  embedding: number[],
  limit = 30,
  topoClass?: string,
  collection = 'codebase_chunks_768'
): Promise<QdrantCodeResult[]> {
  return searchCodebaseAnn(embedding, limit, topoClass, collection);
}

