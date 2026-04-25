/**
 * Lightweight client helper for the hypergraph lookup endpoint.
 * Exports two helpers:
 * - lookupByCentroid(id, k)
 * - lookupByVector(vec, k)
 */

export type Neighbor = { id: string | number; dist: number; vector: number[] | null };

export async function lookupByCentroid(id: string | number, k = 8): Promise<{ centroid: string | number; neighbors: Neighbor[] }> {
  const url = `/api/hypergraph/lookup?centroid=${encodeURIComponent(String(id))}&k=${encodeURIComponent(String(k))}`;
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`hypergraph lookup failed: ${res.status} ${res.statusText} ${txt}`);
  }
  return res.json();
}

export async function lookupByVector(vec: number[], k = 8): Promise<{ k: number; results: Array<{ id: string | number; dist: number }> }> {
  const res = await fetch('/api/hypergraph/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ embedding: vec, k })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`hypergraph vector lookup failed: ${res.status} ${res.statusText} ${txt}`);
  }
  return res.json();
}
