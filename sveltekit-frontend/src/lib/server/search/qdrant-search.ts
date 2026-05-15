/**
 * Qdrant semantic search over codebase_chunks_768 collection.
 * Returns candidates with stable_key for dedup merge in hybrid-search.ts.
 */

import { QdrantManager } from '$lib/server/vector/qdrant-manager.js';
import { ENV } from '$lib/server/env.server.js';
import { encodedClusterPrefilter } from '$lib/server/retrieval/encoded-cluster-prefilter.js';

export interface QdrantCodeResult {
  stable_key: string;
  file_path: string;
  symbol_name?: string;
  symbol_kind?: string;
  language?: string;
  content: string;
  tags?: string;
  topo_class?: string;
  graph_authority_score?: number;
  semantic_score: number;
  qdrant_id: string;
}

let _mgr: QdrantManager | null = null;
function getManager(): QdrantManager {
  if (!_mgr) _mgr = new QdrantManager(ENV.QDRANT_URL);
  return _mgr;
}

export async function searchQdrantCode(
  embedding: number[],
  limit = 30,
  topoClass?: string
): Promise<QdrantCodeResult[]> {
  try {
    const mgr = getManager();
    const mustConditions: any[] = [];
    
    if (topoClass) {
      mustConditions.push({ key: 'topo_class', match: { value: topoClass } });
    }

    // Apply encoded-cluster prefilter (Stage A0) if enabled
    if (ENV.ACE_ENCODED_PREFILTER_ENABLED === 'true') {
      try {
        const pre = await encodedClusterPrefilter(new Float32Array(embedding));
        if (pre && pre.filter && pre.filter.should) {
          mustConditions.push({ should: pre.filter.should });
        }
      } catch (err) {
        console.warn('[searchQdrantCode] Encoded prefilter failed:', err);
      }
    }

    const filter = mustConditions.length > 0 ? { must: mustConditions } : undefined;

    const res = await mgr.hybridSearch({
      collection: 'codebase_chunks_768',
      query: '',
      queryEmbedding: embedding,
      limit,
      filters: filter,
    });

    return (res.results ?? []).map((r) => {
      const p = r.payload ?? {};
      return {
        stable_key:            String(p.stable_key ?? p.chunk_id ?? r.id),
        file_path:             String(p.file_path ?? ''),
        symbol_name:           p.symbol_name ? String(p.symbol_name) : undefined,
        symbol_kind:           p.symbol_kind ? String(p.symbol_kind) : undefined,
        language:              p.language    ? String(p.language)    : undefined,
        content:               String(p.content ?? p.chunk_text ?? ''),
        tags:                  p.tags        ? String(p.tags)        : undefined,
        topo_class:            p.topo_class  ? String(p.topo_class)  : undefined,
        graph_authority_score: typeof p.graph_authority_score === 'number'
                                 ? p.graph_authority_score : undefined,
        semantic_score:        r.score,
        qdrant_id:             String(r.id),
      };
    });
  } catch {
    return [];
  }
}
