/**
 * Canonical codebase ANN contract.
 *
 * Qdrant is the default semantic_768 backend; TurboVec/cuVS are executors behind
 * the same logical semantic lane and therefore never add independent RRF votes.
 */
import { ENV } from '$lib/server/env.server.js';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { encodedClusterPrefilter } from '$lib/server/retrieval/encoded-cluster-prefilter.js';
import {
  chooseQdrantQueryBudget,
  compileQdrantSearchParams,
  type QdrantQueryBudgetV1,
} from '$lib/server/retrieval/qdrant-query-budget.js';
import { getCodebaseAnnBackend } from './codebase-ann-backend.js';
import { searchTurboVecCode } from './turbovec-search.js';

export interface CodebaseAnnSearchOptions {
  queryBudget?: QdrantQueryBudgetV1;
  confidenceRequired?: 'low' | 'normal' | 'high';
  resourceClass?: 'low' | 'normal' | 'high';
  /** Exact Qdrant vector search oracle. Distinct from Parent Atlas exact promotion. */
  exactVectorSearch?: boolean;
  policyRevision?: string;
}

interface CodebaseSearchBackend<T> {
  readonly name: string;
  search(request: {
    embedding: number[];
    limit: number;
    topoClass?: string;
    collection?: string;
    options?: CodebaseAnnSearchOptions;
  }): Promise<T[]>;
}

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
  content_hash?: string | null;
  contentHash?: string | null;
  tree_node_id?: string | null;
  treeNodeId?: string | null;
  featureId?: string | null;
  feature_label?: string | null;
  featureLabel?: string | null;
  workspace_revision?: number | null;
  workspaceRevision?: number | null;
}

type QdrantFilter = {
  must: Array<{ key: string; match: { value: boolean | string | number } }>;
};

export function buildCodebaseQdrantFilter(input: {
  collection: string;
  topoClass?: string;
}): QdrantFilter | undefined {
  const must: QdrantFilter['must'] = [];
  if (input.collection === 'codebase_chunks_768') {
    must.push({ key: 'atlas_enriched', match: { value: true } });
  }
  if (input.topoClass) {
    must.push({ key: 'topo_class', match: { value: input.topoClass } });
  }
  return must.length ? { must } : undefined;
}

const quantizationCapabilityCache = new Map<string, boolean>();

export function collectionHasQuantizationFromInfo(info: unknown): boolean {
  if (!info || typeof info !== 'object') return false;
  const object = info as Record<string, unknown>;
  const config = object.config;
  if (!config || typeof config !== 'object') return false;
  const quantization = (config as Record<string, unknown>).quantization_config;
  return quantization !== undefined && quantization !== null;
}

async function collectionHasQuantization(collection: string): Promise<boolean> {
  const cached = quantizationCapabilityCache.get(collection);
  if (cached !== undefined) return cached;
  try {
    const client = getQdrantClient();
    const info = await client.getCollection(collection);
    const available = collectionHasQuantizationFromInfo(info);
    quantizationCapabilityCache.set(collection, available);
    return available;
  } catch {
    // Capability discovery failure must not prevent semantic retrieval.
    quantizationCapabilityCache.set(collection, false);
    return false;
  }
}

export function clearQdrantCapabilityCacheForTests(): void {
  quantizationCapabilityCache.clear();
}

function mapQdrantPoint(r: {
  id: string | number;
  score?: number | null;
  payload?: Record<string, unknown> | null;
}): QdrantCodeResult {
  const p = r.payload ?? {};
  const somCluster = p.som_cluster ?? p.somCluster;
  const packetKey = String(p.packet_key ?? p.packetKey ?? '').trim() || null;
  const sourceRef = String(
    p.source_ref ?? p.sourceRef ?? p.canonical_source_ref ?? p.canonicalSourceRef ??
    p.file_path ?? p.filePath ?? p.relative_path ?? ''
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
    graph_authority_score: typeof p.graph_authority_score === 'number' ? p.graph_authority_score : undefined,
    som_cluster: typeof somCluster === 'number' || typeof somCluster === 'string' ? somCluster : null,
    som_bmu_row: typeof p.som_bmu_row === 'number' ? p.som_bmu_row : null,
    som_bmu_col: typeof p.som_bmu_col === 'number' ? p.som_bmu_col : null,
    centroid_id: typeof p.centroid_id === 'number' || typeof p.centroid_id === 'string' ? p.centroid_id : null,
    semantic_score: Number(r.score ?? 0),
    qdrant_id: String(r.id),
    content_hash: String(p.content_hash ?? '').trim() || null,
    contentHash: String(p.contentHash ?? '').trim() || null,
    tree_node_id: String(p.tree_node_id ?? '').trim() || null,
    treeNodeId: String(p.treeNodeId ?? '').trim() || null,
    featureId: String(p.featureId ?? '').trim() || null,
    feature_label: String(p.feature_label ?? '').trim() || null,
    featureLabel: String(p.featureLabel ?? '').trim() || null,
    workspace_revision: typeof p.workspace_revision === 'number' ? p.workspace_revision : null,
    workspaceRevision: typeof p.workspaceRevision === 'number' ? p.workspaceRevision : null,
  };
}

class QdrantSearchBackend implements CodebaseSearchBackend<QdrantCodeResult> {
  readonly name = 'qdrant' as const;

  async search(request: {
    embedding: number[];
    limit?: number;
    topoClass?: string;
    collection?: string;
    options?: CodebaseAnnSearchOptions;
  }): Promise<QdrantCodeResult[]> {
    const {
      embedding,
      limit = 30,
      topoClass,
      collection = 'codebase_chunks_768',
      options = {},
    } = request;

    try {
      const client = getQdrantClient();
      const filter = buildCodebaseQdrantFilter({ collection, topoClass });

      // Stage A0 remains a routing/pre-filter experiment. It does not own
      // canonical identity and does not mint a separate semantic vote.
      if (ENV.ACE_ENCODED_PREFILTER_ENABLED === 'true') {
        try {
          await encodedClusterPrefilter(new Float32Array(embedding));
        } catch (err) {
          console.warn('[searchQdrantCode] Encoded prefilter failed:', err);
        }
      }

      const budget = options.queryBudget ?? chooseQdrantQueryBudget({
        finalLimit: limit,
        confidenceRequired: options.confidenceRequired,
        resourceClass: options.resourceClass,
        exactRequired: options.exactVectorSearch,
        policyRevision: options.policyRevision,
      });
      if (budget.limit !== limit) {
        throw new Error(`Qdrant query budget limit ${budget.limit} does not match caller limit ${limit}`);
      }

      const quantizationAvailable = budget.exact ? false : await collectionHasQuantization(collection);
      const compiled = compileQdrantSearchParams(budget, { quantizationAvailable });

      // Query API is the canonical Qdrant call. In js-client-rest 1.18 search()
      // still exists, but query() is the forward-compatible API and supports
      // params/prefetch/fusion without changing this caller boundary.
      const response = await client.query(collection, {
        query: embedding,
        limit: compiled.finalLimit,
        filter,
        params: compiled.params,
        score_threshold: 0.001,
        with_payload: true,
        with_vector: false,
      });

      return (response.points ?? []).map((point) => mapQdrantPoint(point as {
        id: string | number;
        score?: number | null;
        payload?: Record<string, unknown> | null;
      }));
    } catch (error) {
      console.warn('[searchQdrantCode] Qdrant query failed:', error);
      return [];
    }
  }
}

class TurboVecSearchBackend implements CodebaseSearchBackend<QdrantCodeResult> {
  readonly name = 'turbovec' as const;

  async search(request: {
    embedding: number[];
    limit?: number;
    topoClass?: string;
    collection?: string;
    options?: CodebaseAnnSearchOptions;
  }): Promise<QdrantCodeResult[]> {
    const { embedding, limit = 30, topoClass, collection = 'codebase_chunks_768' } = request;
    // Qdrant-specific knobs are intentionally not translated into a second vote.
    // TurboVec remains an executor behind the stable semantic search contract.
    return searchTurboVecCode(embedding, limit, topoClass, collection);
  }
}

function createCodebaseSearchBackend(backend: string): CodebaseSearchBackend<QdrantCodeResult> {
  if (backend === 'turbovec') return new TurboVecSearchBackend();
  if (backend === 'cuvs') {
    console.warn('[searchCodebaseAnn] backend=cuvs not implemented yet; falling back to qdrant');
  }
  return new QdrantSearchBackend();
}

/**
 * Stable ANN retrieval contract for codebase chunks.
 * Existing positional callers remain source-compatible; resource policy is an
 * optional fifth argument and therefore does not create another retrieval API.
 */
export async function searchCodebaseAnn(
  embedding: number[],
  limit = 30,
  topoClass?: string,
  collection = 'codebase_chunks_768',
  options: CodebaseAnnSearchOptions = {},
): Promise<QdrantCodeResult[]> {
  const backend = createCodebaseSearchBackend(getCodebaseAnnBackend());
  return backend.search({ embedding, limit, topoClass, collection, options });
}

export async function searchQdrantCode(
  embedding: number[],
  limit = 30,
  topoClass?: string,
  collection = 'codebase_chunks_768',
  options: CodebaseAnnSearchOptions = {},
): Promise<QdrantCodeResult[]> {
  return searchCodebaseAnn(embedding, limit, topoClass, collection, options);
}
