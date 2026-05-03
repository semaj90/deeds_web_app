/**
 * Lightweight client helper for the hypergraph lookup endpoint.
 *
 * Exported helpers:
 * - lookupByCentroid(id, k, opts?)  — GET nearest neighbours by centroid id
 * - lookupByVector(vec, k, opts?)   — POST nearest centroids by raw embedding
 *
 * Both support RetryOptions for automatic exponential-backoff retries.
 */

export type Neighbor = { id: string | number; dist: number; vector: number[] | null };

export interface RetryOptions {
  /** Maximum total attempts (including the first). Default 3. */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff. Default 250. */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default 8000. */
  maxDelayMs?: number;
  /** HTTP status codes that should trigger a retry. Default: 429, 500, 502, 503, 504. */
  retryOn?: number[];
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 8000,
  retryOn: [429, 500, 502, 503, 504]
};

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  input: RequestInfo,
  init: RequestInit,
  opts: RetryOptions = {}
): Promise<Response> {
  const cfg = { ...DEFAULT_RETRY, ...opts };
  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetch(input, init);
    if (res.ok) return res;
    if (attempt >= cfg.maxAttempts || !cfg.retryOn.includes(res.status)) return res;
    const jitter = Math.random() * cfg.baseDelayMs * 0.5;
    const delay = Math.min(cfg.baseDelayMs * 2 ** (attempt - 1) + jitter, cfg.maxDelayMs);
    await sleep(delay);
  }
}

export async function lookupByCentroid(
  id: string | number,
  k = 8,
  retry?: RetryOptions
): Promise<{ centroid: string | number; neighbors: Neighbor[] }> {
  const url = `/api/hypergraph/lookup?centroid=${encodeURIComponent(String(id))}&k=${encodeURIComponent(String(k))}`;
  const res = await fetchWithRetry(url, { credentials: 'same-origin' }, retry);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`hypergraph lookup failed: ${res.status} ${res.statusText} ${txt}`);
  }
  return res.json();
}

export async function lookupByVector(
  vec: number[],
  k = 8,
  retry?: RetryOptions
): Promise<{ k: number; results: Array<{ id: string | number; dist: number }> }> {
  const res = await fetchWithRetry(
    '/api/hypergraph/lookup',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ embedding: vec, k })
    },
    retry
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`hypergraph vector lookup failed: ${res.status} ${res.statusText} ${txt}`);
  }
  return res.json();
}
