import { json } from '@sveltejs/kit';
import { getCache, deleteCache, redisTTL, memoryStats } from '$lib/server/summarizeCache';
import type { RequestHandler } from './$types.js';
import { URL } from "url";


// Introspection + invalidation route
// GET /api/ai/summarize/cache/:key -> metadata & (optionally) summary
// DELETE /api/ai/summarize/cache/:key -> invalidate
// Query params: include=summary (include full summary text)

export const GET: RequestHandler = async ({ params, url }) => {
  const key = params.key;
  if (!key) return json({ success: false, error: 'Key required' }, { status: 400 });
  const includeSummary = url.searchParams.get('include') === 'summary';
  const cached = await getCache(key);
  if (!cached.entry) {
    return json({ success: false, hit: false, key, message: 'Cache miss' }, { status: 404 });
  }
  const ttl = await redisTTL(key);
  const now = Date.now();
  const remainingMs = cached.entry.ttlMs - (now - cached.entry.ts);
  return json({
    success: true,
    hit: true,
    key,
    source: cached.source,
    remainingMs: remainingMs < 0 ? 0 : remainingMs,
    structured: !!cached.entry.structured,
    model: cached.entry.model,
    mode: cached.entry.mode,
    type: cached.entry.type,
    createdAt: new Date(cached.entry.ts).toISOString(),
    ageMs: now - cached.entry.ts,
    perf: cached.entry.perf,
    redisTTL: ttl,
    memory: memoryStats(),
    summary: includeSummary ? cached.entry.summary : undefined,
    structuredPayload: includeSummary ? cached.entry.structured : undefined
  });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const key = params.key;
  if (!key) return json({ success: false, error: 'Key required' }, { status: 400 });
  await deleteCache(key);
  return json({ success: true, deleted: key, timestamp: new Date().toISOString() });
};
