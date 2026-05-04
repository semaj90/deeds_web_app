import { json } from '@sveltejs/kit';
import crypto from 'crypto';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';
import type { RequestHandler } from './$types';

const lookupPostSchema = z.object({
  embedding: z.array(z.number()).optional(),
  vector: z.array(z.number()).optional(),
  k: z.number().int().min(1).max(100).default(8),
});

const PREFIX    = process.env.HG_PREFIX      || 'hypergraph:v1';
const CACHE_TTL = Number(process.env.HG_CACHE_TTL  || 60);  // seconds
const RATE_LIMIT = Number(process.env.HG_RATE_LIMIT || 60); // requests
const RATE_WINDOW = Number(process.env.HG_RATE_WINDOW || 60); // seconds

// Simple in-memory TTL cache (L0 before Redis L1)
const localCache = new Map<string, { value: unknown; expiresAt: number }>();
const rateCache  = new Map<string, { stamps: number[] }>();

function getLocalCache(key: string): unknown | null {
  const v = localCache.get(key);
  if (!v) return null;
  if (Date.now() > v.expiresAt) { localCache.delete(key); return null; }
  return v.value;
}
function setLocalCache(key: string, value: unknown, ttlSec = CACHE_TTL) {
  localCache.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

function l2sq(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = (a[i] || 0) - (b[i] || 0); s += d * d; }
  return s;
}

function hashString(s: string) { return crypto.createHash('sha1').update(s).digest('hex'); }

function getIp(request: Request) {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return request.headers.get('x-real-ip') || '127.0.0.1';
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const key = `rate:hyp:${ip}`;
  try {
    const redis = getRedis();
    const cur = await redis.incr(key);
    if (cur === 1) await redis.expire(key, RATE_WINDOW);
    return cur <= RATE_LIMIT;
  } catch {
    // local sliding window fallback
    const now = Date.now();
    const entry = rateCache.get(key) ?? { stamps: [] };
    const stamps = entry.stamps.filter((t) => now - t < RATE_WINDOW * 1000);
    stamps.push(now);
    rateCache.set(key, { stamps });
    return stamps.length <= RATE_LIMIT;
  }
}

export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getIp(request);
  if (!(await checkRateLimit(ip))) return json({ error: 'rate limit' }, { status: 429 });

  const centroidId = url.searchParams.get('centroid') ?? url.searchParams.get('id');
  const k = Number(url.searchParams.get('k') ?? url.searchParams.get('limit') ?? 8);
  if (!centroidId) return json({ error: 'missing centroid query parameter' }, { status: 400 });

  const cacheKey = `lookup:centroid:${centroidId}:k:${k}`;

  const local = getLocalCache(cacheKey);
  if (local) return json(local);

  const redis = getRedis();
  try {
    const cachedRaw = await redis.get(cacheKey);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      setLocalCache(cacheKey, parsed);
      return json(parsed);
    }

    const neighborsRaw = await redis.hget(PREFIX + ':neighbors', centroidId);
    if (!neighborsRaw) return json({ error: 'centroid not found' }, { status: 404 });

    const neighbors = JSON.parse(neighborsRaw) as { id: string; dist: number }[];
    const out = [];
    for (let i = 0; i < Math.min(k, neighbors.length); i++) {
      const nid = neighbors[i].id;
      const centRaw = await redis.hget(PREFIX + ':centroids', nid);
      const centObj = centRaw ? JSON.parse(centRaw) : null;
      out.push({ id: nid, dist: neighbors[i].dist, vector: centObj?.vector ?? null });
    }
    const resp = { centroid: centroidId, neighbors: out };

    setLocalCache(cacheKey, resp);
    await redis.set(cacheKey, JSON.stringify(resp), 'EX', CACHE_TTL);
    return json(resp);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getIp(request);
  if (!(await checkRateLimit(ip))) return json({ error: 'rate limit' }, { status: 429 });

  const parsed = lookupPostSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: 'invalid JSON' }, { status: 400 });
  const body = parsed.data;

  const vec = body.embedding ?? body.vector;
  const k = body.k;
  if (!Array.isArray(vec)) return json({ error: 'missing embedding array' }, { status: 400 });

  const cacheKey = `lookup:vector:${hashString(JSON.stringify(vec))}:k:${k}`;
  const local = getLocalCache(cacheKey);
  if (local) return json(local);

  const redis = getRedis();
  try {
    const cr = await redis.get(cacheKey);
    if (cr) { const p = JSON.parse(cr); setLocalCache(cacheKey, p); return json(p); }

    const all = await redis.hgetall(PREFIX + ':centroids');
    const items: { id: string; vector: number[] }[] = [];
    for (const [field, value] of Object.entries(all)) {
      if (field === 'meta') continue;
      try { const o = JSON.parse(String(value)); items.push({ id: field, vector: o.vector }); } catch { continue; }
    }
    const scored = items.map((it) => ({ id: it.id, dist: l2sq(vec, it.vector) }));
    scored.sort((a, b) => a.dist - b.dist);
    const top = scored.slice(0, Math.min(k, scored.length));
    const resp = { k: top.length, results: top };

    setLocalCache(cacheKey, resp);
    await redis.set(cacheKey, JSON.stringify(resp), 'EX', CACHE_TTL);
    return json(resp);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
};