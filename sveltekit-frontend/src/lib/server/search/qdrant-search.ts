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
import { QDRANT_SEMANTIC_COLLECTION } from '$lib/server/atlas/retrieval/qdrant-semantic-projection.js';
import { mapQdrantProjectionCandidate } from './projection-candidate-v1.js';
import { hydrateCanonicalCandidates, type HydratedCandidateV1 } from './hydrate-canonical-candidates.js';

/**
 * QDRANT-READER-FIX-02 (2026-09-01): the single canonical collection owner
 * is QDRANT_SEMANTIC_COLLECTION (codebase_chunks_768_v2) -- never a local
 * default literal. codebase_chunks_768_v2 is a deliberately LEAN semantic
 * projection (identity + representation lineage, no source content by
 * design -- see docs/reports/qdrant-d-hydration-01-results.json), so
 * results from it are hydrated with authoritative content via ONE batched
 * Postgres read (hydrateCanonicalCandidates), never fabricated as content:''.
 * Proof chain: qdrant-reader-shadow-01 (58% vs 100% self-match on the old
 * default) -> qdrant-d-hydration-01 (7,773/7,773 exact join) ->
 * qdrant-reader-shadow-02 (100% content/identity, 0 failures on the real
 * candidate+hydration pipeline). Full trail:
 * docs/reports/writer-root-01-representation-owner-01-results.json.
 *
 * TurboVecSearchBackend below is DELIBERATELY NOT switched to this default
 * -- it has its own separate, unfixed set of 'codebase_chunks_768' literal
 * defaults in turbovec-search.ts with no hydration step wired in. TurboVec
 * is not the active backend by default (CODEBASE_ANN_BACKEND unset ->
 * 'qdrant'), so this is a real, flagged, deliberately out-of-scope gap for
 * a future fix, not a silent oversight.
 */


export interface CodebaseAnnSearchOptions {
  /** Optional precompiled Qdrant-only budget. */
  qdrantBudget?: QdrantQueryBudgetV1;
  confidenceRequired?: 'low' | 'normal' | 'high';
  resourceClass?: 'low' | 'normal' | 'high';
  /** Exact Qdrant vector scan oracle; distinct from Parent Atlas exact promotion. */
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
    strict?: boolean;
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

/** Qdrant filter shape: scalar equality is expressed with match.value. */
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
  const config = (info as Record<string, unknown>).config;
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
    // Capability discovery is advisory; semantic retrieval must remain fail-open.
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

/**
 * Converts a hydrated candidate (Qdrant projection identity + Postgres
 * content) into the existing QdrantCodeResult shape every downstream
 * consumer already expects. Only the identity/content fields the lean D
 * projection + Postgres hydration can actually supply are populated;
 * fields the legacy _768 payload carried that D+Postgres don't (SOM/PageRank/
 * community/topology enrichment) are left null rather than fabricated.
 */
function hydratedCandidateToQdrantCodeResult(h: HydratedCandidateV1): QdrantCodeResult {
  return {
    stable_key: h.canonicalId,
    file_path: h.sourceRef,
    packet_key: h.packetKey,
    source_ref: h.sourceRef,
    feature_id: null,
    content: h.content,
    semantic_score: h.projectionCandidate.score,
    qdrant_id: h.projectionCandidate.physicalPointId,
    content_hash: h.contentHash,
    contentHash: h.contentHash,
    tree_node_id: null,
    treeNodeId: null,
    featureId: null,
    feature_label: null,
    featureLabel: null,
    workspace_revision: null,
    workspaceRevision: null,
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
    strict?: boolean;
  }): Promise<QdrantCodeResult[]> {
    const { embedding, limit = 30, topoClass, collection = QDRANT_SEMANTIC_COLLECTION, options = {}, strict = false } = request;

    try {
      const client = getQdrantClient();
      const filter = buildCodebaseQdrantFilter({ collection, topoClass });

      // Stage A0 stays a routing experiment; it does not own identity or a vote.
      if (ENV.ACE_ENCODED_PREFILTER_ENABLED === 'true') {
        try {
          await encodedClusterPrefilter(new Float32Array(embedding));
        } catch (error) {
          console.warn('[searchQdrantCode] Encoded prefilter failed:', error);
        }
      }

      const budget = options.qdrantBudget ?? chooseQdrantQueryBudget({
        finalLimit: limit,
        confidenceRequired: options.confidenceRequired,
        resourceClass: options.resourceClass,
        exactVectorSearch: options.exactVectorSearch,
        policyRevision: options.policyRevision,
      });
      if (budget.limit !== limit) {
        throw new Error(`Qdrant budget limit ${budget.limit} does not match caller limit ${limit}`);
      }

      const quantizationAvailable = budget.exactVectorSearch
        ? false
        : await collectionHasQuantization(collection);
      const compiled = compileQdrantSearchParams(budget, { quantizationAvailable });

      // PRE-EXISTING BUG, found live while canarying QDRANT-READER-FIX-02
      // (not introduced by this fix, not present before this fix was tested
      // end-to-end): both codebase_chunks_768 AND codebase_chunks_768_v2 have
      // 3 named vectors (content/error/signature), no unnamed default. A bare
      // `query: embedding` with no `using` fails every call with Qdrant 400
      // "Wrong input: Not existing vector name error" -- silently caught by
      // the catch block below and returned as an empty result set. Confirmed
      // live this failed identically against the OLD default collection too.
      const response = await client.query(collection, {
        query: embedding,
        using: 'content',
        limit: compiled.finalLimit,
        filter,
        params: compiled.params,
        score_threshold: 0.001,
        with_payload: true,
        with_vector: false,
      });

      const points = (response.points ?? []) as {
        id: string | number;
        score?: number | null;
        payload?: Record<string, unknown> | null;
      }[];

      // codebase_chunks_768_v2 is a lean projection with no source content in
      // its payload -- results from it MUST be hydrated from Postgres, never
      // mapped directly (that would silently return content:'' for every hit).
      // Any other explicitly-requested collection (e.g. the legacy _768) keeps
      // the direct payload mapping its richer payload actually supports.
      if (collection === QDRANT_SEMANTIC_COLLECTION) {
        const candidates = points.map((point) => mapQdrantProjectionCandidate(point));
        const { hydrated, failures } = await hydrateCanonicalCandidates(candidates);
        if (failures.length > 0) {
          console.warn('[searchQdrantCode] hydration failures (fail-closed, dropped from results):', failures);
        }
        return hydrated.map(hydratedCandidateToQdrantCodeResult);
      }

      return points.map((point) => mapQdrantPoint(point));
    } catch (error) {
      if (strict) throw error;
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
    const { embedding, limit = 30, topoClass, collection = 'codebase_chunks_768', options } = request;
    if (options?.exactVectorSearch || options?.qdrantBudget) {
      throw new Error('QDRANT_SPECIFIC_SEARCH_POLICY_NOT_SUPPORTED_BY_TURBOVEC');
    }
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
 * Stable semantic ANN boundary. Executors return the same logical candidate
 * shape. `collection` intentionally has NO default here -- each backend's
 * own search() resolves its own correct default (QdrantSearchBackend ->
 * QDRANT_SEMANTIC_COLLECTION; TurboVecSearchBackend -> its own legacy
 * default, a separate flagged gap). A default at THIS level would silently
 * hand the canonical collection to whichever backend happens to be active,
 * including TurboVec, which has no hydration step wired in yet.
 */
export async function searchCodebaseAnn(
  embedding: number[],
  limit = 30,
  topoClass?: string,
  collection?: string,
  options?: CodebaseAnnSearchOptions,
): Promise<QdrantCodeResult[]> {
  const backend = createCodebaseSearchBackend(getCodebaseAnnBackend());
  return backend.search({ embedding, limit, topoClass, collection, options });
}

export async function searchQdrantCode(
  embedding: number[],
  limit = 30,
  topoClass?: string,
  collection?: string,
  options?: CodebaseAnnSearchOptions,
): Promise<QdrantCodeResult[]> {
  return searchCodebaseAnn(embedding, limit, topoClass, collection, options);
}

function assertCanonicalSemantic768Query(embedding: number[]): void {
  if (!Array.isArray(embedding) || embedding.length !== 768 || embedding.some((value) => !Number.isFinite(value))) {
    throw new Error('QDRANT_STRICT_QUERY_INVALID_SEMANTIC_768');
  }
  const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
  if (!(norm > 0)) throw new Error('QDRANT_STRICT_QUERY_ZERO_NORM');
}

/**
 * Governed OaK/DAG read seam. Unlike ordinary SearchRuntime retrieval, this
 * path must not convert Qdrant outages or malformed responses into an empty
 * successful evidence set. It remains read-only and uses the canonical v2
 * collection unless an explicit collection is supplied for a fixture.
 */
export async function searchQdrantCodeStrictV1(
  embedding: number[],
  limit = 10,
  options: CodebaseAnnSearchOptions & { collection?: string } = {},
): Promise<QdrantCodeResult[]> {
  assertCanonicalSemantic768Query(embedding);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('QDRANT_STRICT_QUERY_LIMIT_INVALID');
  }
  const backend = new QdrantSearchBackend();
  return backend.search({
    embedding,
    limit,
    collection: options.collection ?? QDRANT_SEMANTIC_COLLECTION,
    options: { ...options, exactVectorSearch: options.exactVectorSearch ?? true },
    strict: true,
  });
}
