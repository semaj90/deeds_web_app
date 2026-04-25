import { redis, ensureRedisReady } from '$lib/server/redis-client';
// ops/ranker/ranker.ts
// Minimal Express server that accepts query text, checks Redis cache for top-k,
// falls back to embedding via Triton and a simple similarity placeholder.

import express from 'express';
import fetch from 'node-fetch';
import Redis from 'ioredis';

const app = express();
app.use(express.json());

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const TRITON_URL = process.env.TRITON_URL || 'http://localhost:8000/v2/models/legal_embedding/infer';

const redis = redis;

function simpleHash(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}

async function embedQuery(query: string) {
  // Call Triton (placeholder)
  const payload = { inputs: [{ name: 'input__0', shape: [1], datatype: 'BYTES', contents: { bytes: [query] } }] } as any;
  const res = await fetch(TRITON_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('Triton embed failed');
  const body = await res.json();
  return body.outputs || [];
}

// Very small placeholder for similarity scoring. Replace with GPU/Triton similarity.
function scoreMatches(queryEmbedding: number[], candidates: Array<{ id: string; embedding: number[] }>) {
  return candidates.map((c) => ({ id: c.id, score: Math.random(), snippet: 'TODO: snippet' }));
}

app.post('/search', async (req, res) => {
  const { query, userId } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });
  const cacheKey = `topk:${userId || 'anon'}:${simpleHash(query)}`;
  const cache = await redis.get(cacheKey);
  if (cache) {
    return res.json({ fromCache: true, results: JSON.parse(cache) });
  }
  try {
    const qEmb = await embedQuery(query);
    // TODO: fetch candidate docs from PGVector/Qdrant (here we return mock candidates)
    const candidates = [{ id: 'doc:1', embedding: [0.1, 0.2] }, { id: 'doc:2', embedding: [0.3, 0.1] }];
    const results = scoreMatches([], candidates);
    // cache top-k in Redis (12KB-sized entries guidance in your design)
    await redis.set(cacheKey, JSON.stringify(results), 'EX', 60 * 5);
    return res.json({ fromCache: false, results });
  } catch (err) {
    console.error('ranker error', err);
    return res.status(500).json({ error: 'internal' });
  }
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`Ranker listening ${PORT}`));
