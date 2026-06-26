/**
 * Go Search Service Bridge — gRPC/JSON-RPC integration
 *
 * Wraps the Go legal search microservice (:8096 HTTP or :50055 gRPC)
 * providing parallel index retrieval with RRF fusion.
 *
 * Routes:
 * - HTTP  POST /search (faster, default)
 * - gRPC  SearchLibrary (unary, fallback)
 * - HTTP  POST /citation (resolve citations)
 * - HTTP  GET  /toc/:id (document table-of-contents)
 * - HTTP  GET  /node/:id (node context with chunks)
 * - HTTP  GET  /suggest?q= (autocomplete)
 *
 * Fallback: if Go service unavailable → return degraded empty results
 */

import { ENV } from '$lib/server/env.server.js';

export interface GoSearchRequest {
  query: string;
  limit?: number;
  offset?: number;
  jurisdiction?: string;
  corpusType?: string;
  expandChunks?: boolean;
}

export interface GoSearchHit {
  chunkId: string;
  documentId: string;
  nodeId: string;
  title: string;
  heading?: string;
  citationLabel?: string;
  snippet: string;
  score: number;
  matchType: 'qdrant' | 'bm25' | 'fts' | 'citation';
  corpusType?: string;
  jurisdiction?: string;
}

export interface GoSearchResponse {
  hits: GoSearchHit[];
  total: number;
  durationMs: number;
  cacheSource?: 'redis' | 'go-search' | 'qdrant';
}

export interface GoSuggestResponse {
  suggestions: string[];
  durationMs: number;
}

export interface GoTocResponse {
  id: string;
  title: string;
  children: TocNode[];
  durationMs: number;
}

export interface TocNode {
  id: string;
  title: string;
  heading?: string;
  children?: TocNode[];
}

export interface GoNodeResponse {
  id: string;
  title: string;
  heading?: string;
  children: NodeRef[];
  chunks: ChunkRef[];
  breadcrumb: string[];
  durationMs: number;
}

export interface NodeRef {
  id: string;
  title: string;
  type: string;
}

export interface ChunkRef {
  id: string;
  snippet: string;
  score?: number;
}

export interface GoCitationRequest {
  label: string;
  jurisdiction?: string;
}

export interface GoCitationResponse {
  label: string;
  resolved: {
    title: string;
    documentId: string;
    url?: string;
    context?: string;
  } | null;
  durationMs: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

// Use the unified go-retrieval HTTP endpoint (supports both search and codeintel)
// Falls back to dedicated search service on :8096 if needed
const GO_SEARCH_HTTP_URL = ENV.GO_RETRIEVAL_HTTP_URL || ENV.RETRIEVAL_HTTP_URL || 'http://127.0.0.1:8100';
const GO_SEARCH_TIMEOUT_MS = 30_000;

// ── HTTP Client ───────────────────────────────────────────────────────────────

async function fetchGoSearch(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>
): Promise<unknown> {
  try {
    const url = new URL(endpoint, GO_SEARCH_HTTP_URL);
    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(GO_SEARCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      console.warn(`[go-search] HTTP ${response.status} on ${endpoint}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.warn(`[go-search] fetch failed for ${endpoint}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Search across Qdrant (dense) + BM25 (sparse) + FTS with RRF fusion.
 * Parallel invocation of all indexing lanes, returns top-K fused results.
 */
export async function searchGoService(req: GoSearchRequest): Promise<GoSearchResponse> {
  const startMs = performance.now();

  const body = {
    query: req.query,
    limit: req.limit ?? 20,
    offset: req.offset ?? 0,
    jurisdiction: req.jurisdiction,
    corpusType: req.corpusType,
    expandChunks: req.expandChunks ?? false
  };

  const result = (await fetchGoSearch('/search', 'POST', body)) as Record<string, unknown> | null;

  const durationMs = Math.round(performance.now() - startMs);

  if (!result) {
    return {
      hits: [],
      total: 0,
      durationMs,
      cacheSource: 'go-search' // fallback responded, but no results
    };
  }

  // Normalize response shape
  const hits = Array.isArray(result.hits) ? result.hits : [];
  const total = typeof result.total === 'number' ? result.total : hits.length;

  return {
    hits: hits as GoSearchHit[],
    total,
    durationMs,
    cacheSource: result.cacheSource as string | undefined
  };
}

/**
 * Get autocomplete suggestions as you type.
 */
export async function suggestGoService(query: string): Promise<GoSuggestResponse> {
  const startMs = performance.now();
  const url = new URL('/suggest', GO_SEARCH_HTTP_URL);
  url.searchParams.set('q', query);

  try {
    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(5_000)
    });

    if (!response.ok) {
      return { suggestions: [], durationMs: Math.round(performance.now() - startMs) };
    }

    const result = (await response.json()) as Record<string, unknown>;
    return {
      suggestions: Array.isArray(result.suggestions) ? result.suggestions as string[] : [],
      durationMs: Math.round(performance.now() - startMs)
    };
  } catch (err) {
    console.warn('[go-search] suggest failed:', err instanceof Error ? err.message : String(err));
    return { suggestions: [], durationMs: Math.round(performance.now() - startMs) };
  }
}

/**
 * Get document table-of-contents (hierarchical node tree).
 */
export async function getTocGoService(documentId: string): Promise<GoTocResponse | null> {
  const startMs = performance.now();
  const result = (await fetchGoSearch(`/toc/${documentId}`)) as Record<string, unknown> | null;
  const durationMs = Math.round(performance.now() - startMs);

  if (!result) return null;

  return {
    id: (result.id as string) ?? documentId,
    title: (result.title as string) ?? 'Untitled',
    children: Array.isArray(result.children) ? (result.children as TocNode[]) : [],
    durationMs
  };
}

/**
 * Get node context (single node with children + chunks + breadcrumb).
 */
export async function getNodeGoService(nodeId: string): Promise<GoNodeResponse | null> {
  const startMs = performance.now();
  const result = (await fetchGoSearch(`/node/${nodeId}`)) as Record<string, unknown> | null;
  const durationMs = Math.round(performance.now() - startMs);

  if (!result) return null;

  return {
    id: (result.id as string) ?? nodeId,
    title: (result.title as string) ?? 'Untitled',
    heading: result.heading as string | undefined,
    children: Array.isArray(result.children) ? (result.children as NodeRef[]) : [],
    chunks: Array.isArray(result.chunks) ? (result.chunks as ChunkRef[]) : [],
    breadcrumb: Array.isArray(result.breadcrumb) ? (result.breadcrumb as string[]) : [],
    durationMs
  };
}

/**
 * Resolve a citation label to its source document(s).
 */
export async function resolveCitationGoService(req: GoCitationRequest): Promise<GoCitationResponse | null> {
  const startMs = performance.now();
  const result = (await fetchGoSearch('/citation', 'POST', req)) as Record<string, unknown> | null;
  const durationMs = Math.round(performance.now() - startMs);

  if (!result) return null;

  return {
    label: (result.label as string) ?? req.label,
    resolved: result.resolved as GoCitationResponse['resolved'],
    durationMs
  };
}

/**
 * Health check for the Go service.
 */
export async function healthGoService(): Promise<{ healthy: boolean; durationMs: number }> {
  const startMs = performance.now();
  const result = (await fetchGoSearch('/health')) as Record<string, unknown> | null;
  const durationMs = Math.round(performance.now() - startMs);

  if (!result) {
    return { healthy: false, durationMs };
  }

  return {
    healthy: Boolean(result.healthy ?? result.status === 'ok'),
    durationMs
  };
}
