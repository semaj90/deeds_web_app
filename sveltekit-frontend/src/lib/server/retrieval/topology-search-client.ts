/**
 * topology-search-client.ts
 *
 * Thin HTTP client for the detached topology-search-server (port 8101).
 * Mirrors the queryTopology helper from scripts/ensure-search-engine.mjs
 * but uses the ENV config and is importable inside SvelteKit server code.
 *
 * Returns explicit availability and ranking metadata so callers can distinguish
 * cosine fallback from topology-backed results.
 */

import { ENV } from '$lib/server/env.server.js';

const BASE_URL = ENV.TOPOLOGY_SEARCH_URL;

export interface TopologySearchHit {
  stableKey:          string | null;
  sourceRef?:         string | null;
  sourceRevision?:    string | null;
  contentHash?:       string | null;
  representationRevision?: string | null;
  topologySnapshotRevision?: string | null;
  path:               string | null;
  contentPreview:     string;
  topoByte:           number;
  topoClass:          number;
  topoHex:            string;
  somCluster:         number | null;
  graphAuthorityScore: number | null;
  tensorAffinityScore: number | null;
  manifoldDistance:   number;
  manifoldScore:      number;
  /** Set only by /search/hybrid */
  cosineScore?:       number;
  /** Set only by /search/hybrid */
  hybridScore?:       number;
  summary?:           string;
  coords?:            [number, number, number, number];
  identityMatch?:     'matched' | 'unmatched';
}

export interface TopologySearchResult {
  ok:          boolean;
  query?:      string;
  center:      [number, number, number, number] | null;
  radius:      number | null;
  totalFound:  number;
  durationMs:  number;
  hits:        TopologySearchHit[];
  unmatchedTopologyHits?: TopologySearchHit[];
  rankingMode: 'hybrid' | 'cosine_only' | 'cosine' | 'topology_only' | 'unavailable';
  topologyStatus: 'used' | 'not_requested' | 'no_matches' | 'unavailable' | 'unmatched';
  fallbackReason?: string;
  error?: string;
  errorCode?: string;
  identityJoin?: { matched: number; unmatched: number };
}

function unavailableResult(reason: string, errorCode: string): TopologySearchResult {
  return {
    ok: false, center: null, radius: null, totalFound: 0, durationMs: 0, hits: [],
    rankingMode: 'unavailable', topologyStatus: 'unavailable', fallbackReason: reason, errorCode,
  };
}

async function requestTopology(path: string, init: RequestInit, timeoutMs: number): Promise<TopologySearchResult> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.json() as Partial<TopologySearchResult> & { code?: string };
    return {
      ok: response.ok && body.ok !== false,
      center: body.center ?? null,
      radius: body.radius ?? null,
      totalFound: body.totalFound ?? 0,
      durationMs: body.durationMs ?? 0,
      hits: Array.isArray(body.hits) ? body.hits : [],
      ...(Array.isArray(body.unmatchedTopologyHits) ? { unmatchedTopologyHits: body.unmatchedTopologyHits } : {}),
      rankingMode: body.rankingMode ?? (response.ok ? 'cosine_only' : 'unavailable'),
      topologyStatus: body.topologyStatus ?? (response.ok ? 'unavailable' : 'unavailable'),
      ...(body.fallbackReason ? { fallbackReason: body.fallbackReason } : !response.ok ? { fallbackReason: body.errorCode ?? 'http_error' } : {}),
      ...(body.error ? { error: body.error } : {}),
      ...(body.errorCode ?? body.code ? { errorCode: body.errorCode ?? body.code } : {}),
      ...(body.identityJoin ? { identityJoin: body.identityJoin } : {}),
      ...(body.query ? { query: body.query } : {}),
    };
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return unavailableResult(timeout ? 'request_timeout' : 'transport_error', timeout ? 'TOPOLOGY_REQUEST_TIMEOUT' : 'TOPOLOGY_SERVICE_UNAVAILABLE');
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function isTopologySearchHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2_000) });
    if (!res.ok) return false;
    const body = await res.json() as { ok?: boolean };
    return body.ok === true;
  } catch { return false; }
}

/** Readiness checks dependencies, collection dimensions and topology schema/data; liveness does not. */
export async function isTopologySearchReady(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/ready`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return false;
    const body = await res.json() as { ok?: boolean };
    return body.ok === true;
  } catch { return false; }
}

// ── Hybrid search (recommended) ───────────────────────────────────────────────

/**
 * POST /search/hybrid — cosine prefilter → manifold4 rerank.
 * Returns an explicit unavailable result when the search engine is unavailable.
 */
export async function queryTopology(
  query: string,
  opts: { radius?: number; limit?: number; somCluster?: number } = {},
): Promise<TopologySearchResult> {
  return requestTopology('/search/hybrid', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, ...opts }),
  }, 15_000);
}

// ── Pure manifold4 search (no embedding required) ────────────────────────────

/**
 * POST /search — Euclidean 4D ball search given explicit center coords.
 * Returns an explicit unavailable result when the search engine is unavailable.
 */
export async function searchManifold4Remote(opts: {
  center:      [number, number, number, number];
  radius?:     number;
  limit?:      number;
  somCluster?: number;
  tags?:       string[];
}): Promise<TopologySearchResult> {
  return requestTopology('/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts),
  }, 8_000);
}

// ── Cosine-only search ────────────────────────────────────────────────────────

export async function searchCosineRemote(
  query: string,
  opts: { limit?: number; collection?: string } = {},
): Promise<TopologySearchResult> {
  return requestTopology('/search/cosine', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, ...opts }),
  }, 8_000);
}
