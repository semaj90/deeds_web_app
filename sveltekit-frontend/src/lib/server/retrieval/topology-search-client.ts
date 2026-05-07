/**
 * topology-search-client.ts
 *
 * Thin HTTP client for the detached topology-search-server (port 8101).
 * Mirrors the queryTopology helper from scripts/ensure-search-engine.mjs
 * but uses the ENV config and is importable inside SvelteKit server code.
 *
 * Falls back to null silently when the server is not running —
 * callers (gemma4-agent, ACE assembler) degrade gracefully.
 */

import { ENV } from '$lib/server/env.server.js';

const BASE_URL = ENV.TOPOLOGY_SEARCH_URL;

export interface TopologySearchHit {
  stableKey:          string | null;
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
}

export interface TopologySearchResult {
  ok:          boolean;
  query?:      string;
  center:      [number, number, number, number] | null;
  radius:      number;
  totalFound:  number;
  durationMs:  number;
  hits:        TopologySearchHit[];
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

// ── Hybrid search (recommended) ───────────────────────────────────────────────

/**
 * POST /search/hybrid — cosine prefilter → manifold4 rerank.
 * Returns null when the search engine is unavailable.
 */
export async function queryTopology(
  query: string,
  opts: { radius?: number; limit?: number; somCluster?: number } = {},
): Promise<TopologySearchResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/search/hybrid`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query, ...opts }),
      signal:  AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.json() as TopologySearchResult;
  } catch { return null; }
}

// ── Pure manifold4 search (no embedding required) ────────────────────────────

/**
 * POST /search — Euclidean 4D ball search given explicit center coords.
 * Returns null when the search engine is unavailable.
 */
export async function searchManifold4Remote(opts: {
  center:      [number, number, number, number];
  radius?:     number;
  limit?:      number;
  somCluster?: number;
  tags?:       string[];
}): Promise<TopologySearchResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/search`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(opts),
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return await res.json() as TopologySearchResult;
  } catch { return null; }
}

// ── Cosine-only search ────────────────────────────────────────────────────────

export async function searchCosineRemote(
  query: string,
  opts: { limit?: number; collection?: string } = {},
): Promise<TopologySearchResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/search/cosine`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query, ...opts }),
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return await res.json() as TopologySearchResult;
  } catch { return null; }
}
