import { ENV } from '$lib/server/env.server.js';

export interface GoRetrievalSearchHit {
  id?: string | number;
  chunk_id?: string;
  chunkId?: string;
  file_path?: string;
  filePath?: string;
  source_ref?: string;
  sourceRef?: string;
  canonical_source_ref?: string;
  canonicalSourceRef?: string;
  feature_id?: string;
  featureId?: string;
  feature_label?: string;
  featureLabel?: string;
  topology_label?: string;
  topologyLabel?: string;
  ontology_label?: string;
  ontologyLabel?: string;
  cluster_key?: string;
  clusterKey?: string;
  kmeans_cluster?: number | string;
  kmeansCluster?: number | string;
  title?: string;
  source_title?: string;
  sourceTitle?: string;
  text?: string;
  content?: string;
  snippet?: string;
  score?: number;
  rerank_score?: number;
  rerankScore?: number;
  source_type?: string;
  sourceType?: string;
  source_id?: string;
  sourceId?: string;
  source_url?: string;
  sourceUrl?: string;
  page_num?: number;
  pageNum?: number;
  section?: string;
  has_image?: boolean;
  hasImage?: boolean;
  has_table?: boolean;
  hasTable?: boolean;
  related_entities?: string[];
  graph_neighbors?: string[];
  cache_hit_source?: string;
  cacheHitSource?: string;
  retrieval_winner?: string;
  retrievalWinner?: string;
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface GoRetrievalSearchResponse {
  results: GoRetrievalSearchHit[];
  total_ms?: number;
  totalMs?: number;
  provenance?: Record<string, unknown>;
  telemetry?: Record<string, unknown>;
  ranking?: Record<string, unknown>;
  cache?: {
    hit?: boolean;
    source?: string;
    namespace?: string;
    cache_key?: string;
  };
  source?: string;
  endpoint?: string;
}

export interface GoRetrievalSearchParams {
  query: string;
  topK?: number;
  minScore?: number;
  caseId?: string;
  sectionTypes?: string[];
  filters?: Record<string, unknown>;
}

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl ?? '').replace(/\/+$/, '');
}

function normalizeResponse(data: Record<string, unknown>, endpoint: string): GoRetrievalSearchResponse {
  const rawResults =
    Array.isArray(data.results) ? data.results :
    Array.isArray(data.hits) ? data.hits :
    Array.isArray(data.items) ? data.items :
    [];

  return {
    results: rawResults.map((item) => (item as GoRetrievalSearchHit)),
    total_ms: Number(data.total_ms ?? data.totalMs ?? 0) || undefined,
    provenance: (data.provenance as Record<string, unknown>) ?? undefined,
    telemetry: (data.telemetry as Record<string, unknown>) ?? undefined,
    ranking: (data.ranking as Record<string, unknown>) ?? undefined,
    cache: (data.cache as GoRetrievalSearchResponse['cache']) ?? {
      hit: Boolean(data.cache_hit ?? data.cacheHit),
      source: typeof data.cache_source === 'string' ? data.cache_source : typeof data.cacheSource === 'string' ? data.cacheSource : undefined,
      namespace: typeof data.cache_namespace === 'string' ? data.cache_namespace : typeof data.cacheNamespace === 'string' ? data.cacheNamespace : undefined,
      cache_key: typeof data.cache_key === 'string' ? data.cache_key : typeof data.cacheKey === 'string' ? data.cacheKey : undefined,
    },
    source: typeof data.source === 'string' ? data.source : 'go-retrieval',
    endpoint,
  };
}

export async function searchViaGoRetrieval(
  params: GoRetrievalSearchParams,
  timeoutMs = 8_000
): Promise<GoRetrievalSearchResponse | null> {
  if (!(ENV.RAG_USE_GO_RETRIEVAL || ENV.GO_RETRIEVAL_HTTP_ENABLED)) return null;

  const baseUrl = normalizeBaseUrl(ENV.GO_RETRIEVAL_HTTP_URL ?? ENV.RETRIEVAL_HTTP_URL);
  const endpoints = [
    '/api/retrieval/search',
    '/search',
    '/search/evidence',
    '/search/codebase',
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          query: params.query,
          topK: params.topK ?? 10,
          top_k: params.topK ?? 10,
          minScore: params.minScore ?? 0,
          min_score: params.minScore ?? 0,
          caseId: params.caseId ?? '',
          case_id: params.caseId ?? '',
          sectionTypes: params.sectionTypes ?? [],
          section_types: params.sectionTypes ?? [],
          filters: params.filters ?? {},
          include: {
            qdrant: true,
            postgres: true,
            redis: true,
            neo4j: true,
            turbovec: true,
            provenance: true,
          },
        }),
      });
      clearTimeout(timer);

      if (!res.ok) continue;

      const data = (await res.json()) as Record<string, unknown>;
      const normalized = normalizeResponse(data, endpoint);
      if (!normalized.results.length) continue;
      return normalized;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('[go-retrieval-client] search failed:', (err as Error).message);
      }
    }
  }

  return null;
}
