/**
 * Phase 89: Qdrant HTTP Helper
 * Direct HTTP fetch-based Qdrant operations (no SDK dependencies)
 */

import { ENV } from '$lib/server/env.server.js';
const QDRANT_URL = ENV.QDRANT_URL;
const QDRANT_TIMEOUT = 10_000;

export type QdrantPoint = {
  id: string;
  vector: number[];
  payload?: Record<string, any>;
};

export type QdrantHit = {
  id: string;
  score: number;
  payload?: Record<string, any>;
};

/**
 * Get all collections
 */
export async function getCollections(): Promise<string[]> {
  const r = await fetch(`${QDRANT_URL}/collections`, {
    signal: AbortSignal.timeout(QDRANT_TIMEOUT),
  });
  if (!r.ok) throw new Error(`Qdrant getCollections failed: ${r.status}`);
  const data = await r.json();
  return (data?.result?.collections ?? []).map((c: any) => c.name);
}

/**
 * Scroll through points in a collection (with optional filter)
 */
export async function scrollPoints(opts: {
  collection: string;
  limit?: number;
  withPayload?: boolean;
  withVector?: boolean;
  filter?: any;
  offset?: string;
}): Promise<{
  points: QdrantHit[];
  nextOffset?: string;
}> {
  const body: any = {
    limit: opts.limit ?? 100,
    with_payload: opts.withPayload ?? true,
    with_vector: opts.withVector ?? false,
  };

  if (opts.filter) body.filter = opts.filter;
  if (opts.offset) body.offset = opts.offset;

  const r = await fetch(`${QDRANT_URL}/collections/${opts.collection}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(QDRANT_TIMEOUT),
    body: JSON.stringify(body),
  });

  if (!r.ok) throw new Error(`Qdrant scroll failed: ${r.status} ${await r.text()}`);
  const data = await r.json();

  return {
    points: data?.result?.points ?? [],
    nextOffset: data?.result?.next_page_offset,
  };
}

/**
 * Search for similar vectors
 */
export async function searchVector(opts: {
  collection: string;
  vector: number[];
  limit?: number;
  scoreThreshold?: number;
  filter?: any;
  withPayload?: boolean;
}): Promise<QdrantHit[]> {
  const body: any = {
    vector: opts.vector,
    limit: opts.limit ?? 10,
    with_payload: opts.withPayload ?? true,
  };

  if (opts.scoreThreshold) body.score_threshold = opts.scoreThreshold;
  if (opts.filter) body.filter = opts.filter;

  const r = await fetch(`${QDRANT_URL}/collections/${opts.collection}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(QDRANT_TIMEOUT),
    body: JSON.stringify(body),
  });

  if (!r.ok) throw new Error(`Qdrant search failed: ${r.status} ${await r.text()}`);
  const data = await r.json();
  return data?.result ?? [];
}

/**
 * Upsert points to a collection
 */
export async function upsertPoints(opts: {
  collection: string;
  points: QdrantPoint[];
  wait?: boolean;
}): Promise<any> {
  const r = await fetch(
    `${QDRANT_URL}/collections/${opts.collection}/points?wait=${opts.wait ? 'true' : 'false'}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(QDRANT_TIMEOUT),
      body: JSON.stringify({
        points: opts.points,
      }),
    }
  );

  if (!r.ok) throw new Error(`Qdrant upsert failed: ${r.status} ${await r.text()}`);
  return await r.json();
}
