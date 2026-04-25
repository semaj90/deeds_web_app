import { json } from '@sveltejs/kit';
import { createRequire } from 'module';
import crypto from 'crypto';
const require = createRequire(import.meta.url);

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const PREFIX = process.env.HG_PREFIX || 'hypergraph:v1';
const CACHE_TTL = Number(process.env.HG_CACHE_TTL || 60); // seconds
const RATE_LIMIT = Number(process.env.HG_RATE_LIMIT || 60); // requests
const RATE_WINDOW = Number(process.env.HG_RATE_WINDOW || 60); // seconds

let Redis: any;
try { Redis = require('ioredis'); } catch (e) { Redis = null; }

// Simple in-memory TTL cache
const localCache = new Map<string, { value: any; expiresAt: number }>();
function getLocalCache(key: string) {
  const v = localCache.get(key);
  if (!v) return null;
  if (Date.now() > v.expiresAt) { localCache.delete(key); return null; }
  return v.value;
}
function setLocalCache(key: string, value: any, ttlSec = CACHE_TTL) {
  localCache.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

function l2sq(a: number[], b: number[]) { let s = 0; for (let i = 0; i < a.length; i++) { const d = (a[i] || 0) - (b[i] || 0); s += d * d; } return s; }

function hashString(s: string) { return crypto.createHash('sha1').update(s).digest('hex'); }

function getIpFromEvent(event: any) {
  const hdr = event.request?.headers;
  if (!hdr) return '127.0.0.1';
  const xf = hdr.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return hdr.get('x-real-ip') || hdr.get('remote_addr') || '127.0.0.1';
}

async function checkRateLimit(redisClient: any, ip: string) {
  // Try Redis-backed counter for distributed limits
  const key = `rate:${ip}`;
  try {
    if (redisClient) {
      const cur = await redisClient.incr(key);
      if (cur === 1) await redisClient.expire(key, RATE_WINDOW);
      return cur <= RATE_LIMIT;
    }
  } catch (e) { /* fall through to local */ }
  // local sliding window counter
  const now = Date.now();
  const entry = (localCache.get(`rl:${ip}`) || { stamps: [] });
  const stamps: number[] = entry.stamps.filter((t: number) => now - t < RATE_WINDOW * 1000);
  stamps.push(now);
  localCache.set(`rl:${ip}`, { stamps, expiresAt: now + RATE_WINDOW * 1000 });
  return stamps.length <= RATE_LIMIT;
}

export async function GET(event: any) {
  const { url } = event;
  const ip = getIpFromEvent(event);
  let redisClient = null;
  if (Redis) redisClient = new Redis(REDIS_URL);

  const allowed = await checkRateLimit(redisClient, ip);
  if (!allowed) { if (redisClient) await redisClient.disconnect(); return json({ error: 'rate limit' }, { status: 429 }); }

  try {
    const centroidId = url.searchParams.get('centroid') || url.searchParams.get('id');
    const k = Number(url.searchParams.get('k') || url.searchParams.get('limit') || 8);
    if (!centroidId) { if (redisClient) await redisClient.disconnect(); return json({ error: 'missing centroid query parameter' }, { status: 400 }); }

    const cacheKey = `lookup:centroid:${centroidId}:k:${k}`;
    // Try local cache
    const cached = getLocalCache(cacheKey);
    if (cached) { if (redisClient) await redisClient.disconnect(); return json(cached); }

    // Try Redis cache
    if (redisClient) {
      try {
        const cachedRaw = await redisClient.get(cacheKey);
        if (cachedRaw) { const parsed = JSON.parse(cachedRaw); setLocalCache(cacheKey, parsed); await redisClient.disconnect(); return json(parsed); }
      } catch (e) { console.warn('redis cache get failed', e.message); }
    }

    // Read neighbors and centroids
    if (!redisClient) return json({ error: 'redis not available' }, { status: 500 });
    const neighborsRaw = await redisClient.hget(PREFIX + ':neighbors', String(centroidId));
    if (!neighborsRaw) { await redisClient.disconnect(); return json({ error: 'centroid not found' }, { status: 404 }); }
    const neighbors = JSON.parse(neighborsRaw);
    const out = [];
    for (let i = 0; i < Math.min(k, neighbors.length); i++) {
      const nid = neighbors[i].id;
      const centRaw = await redisClient.hget(PREFIX + ':centroids', String(nid));
      const centObj = centRaw ? JSON.parse(centRaw) : null;
      out.push({ id: nid, dist: neighbors[i].dist, vector: centObj ? centObj.vector : null });
    }
    const resp = { centroid: centroidId, neighbors: out };
    // set caches
    setLocalCache(cacheKey, resp);
    try { await redisClient.set(cacheKey, JSON.stringify(resp), 'EX', CACHE_TTL); } catch (e) { console.warn('redis cache set failed', e.message); }
    await redisClient.disconnect();
    return json(resp);
  } catch (e) {
    try { if (redisClient) await redisClient.disconnect(); } catch (_) {}
    return json({ error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(event: any) {
  const ip = getIpFromEvent(event);
  let redisClient = null;
  if (Redis) redisClient = new Redis(REDIS_URL);

  const allowed = await checkRateLimit(redisClient, ip);
  if (!allowed) { if (redisClient) await redisClient.disconnect(); return json({ error: 'rate limit' }, { status: 429 }); }

  try {
    const body = await event.request.json();
    const vec = body?.embedding || body?.vector;
    const k = Number(body?.k || 8);
    if (!Array.isArray(vec)) { if (redisClient) await redisClient.disconnect(); return json({ error: 'missing embedding array' }, { status: 400 }); }

    const cacheKey = `lookup:vector:${hashString(JSON.stringify(vec))}:k:${k}`;
    const cached = getLocalCache(cacheKey);
    if (cached) { if (redisClient) await redisClient.disconnect(); return json(cached); }
    if (redisClient) {
      try { const cr = await redisClient.get(cacheKey); if (cr) { const p = JSON.parse(cr); setLocalCache(cacheKey, p); await redisClient.disconnect(); return json(p); } } catch (e) { console.warn('redis cache get failed', e.message); }
    }

    if (!redisClient) return json({ error: 'redis not available' }, { status: 500 });
    const all = await redisClient.hgetall(PREFIX + ':centroids');
    const items: { id: string; vector: number[] }[] = [];
    for (const [field, value] of Object.entries(all)) {
      if (field === 'meta') continue;
      try { const o = JSON.parse(value); items.push({ id: field, vector: o.vector }); } catch (e) { continue; }
    }
    const scored = items.map(it => ({ id: it.id, dist: l2sq(vec, it.vector) }));
    scored.sort((a, b) => a.dist - b.dist);
    const top = scored.slice(0, Math.min(k, scored.length));
    const resp = { k: top.length, results: top };
    setLocalCache(cacheKey, resp);
    try { await redisClient.set(cacheKey, JSON.stringify(resp), 'EX', CACHE_TTL); } catch (e) { console.warn('redis cache set failed', e.message); }
    await redisClient.disconnect();
    return json(resp);
  } catch (e) {
    try { if (redisClient) await redisClient.disconnect(); } catch (_) {}
    return json({ error: String(e.message || e) }, { status: 500 });
  }
}
