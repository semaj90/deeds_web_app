#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Redis from 'ioredis';
import { rerank } from '../../sveltekit-frontend/src/lib/server/ai/turbovec-rerank.ts';

// Simple smoke runner: reads embeddings JSONL and runs rerank for a sample query
const EMB_FILE = process.argv[2] || path.resolve('.tmp', 'scenario_embeddings.jsonl');
const QUERY = process.argv[3] || 'where is the bathroom?';

function pseudoEmbed(text, dim = 768) {
  const h = crypto.createHash('sha256').update(text).digest();
  const vec = new Float32Array(dim);
  for (let i = 0; i < dim; i++) vec[i] = ((h[i % h.length] & 0xff) - 128) / 128;
  let s = 0; for (let i = 0; i < dim; i++) s += vec[i] * vec[i]; s = Math.sqrt(s) || 1e-12;
  for (let i = 0; i < dim; i++) vec[i] = vec[i] / s;
  return Array.from(vec);
}

async function run() {
  if (!fs.existsSync(EMB_FILE)) {
    console.error('Embeddings file not found:', EMB_FILE);
    process.exit(1);
  }
  const lines = fs.readFileSync(EMB_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  const candidates = lines.map(l => JSON.parse(l)).map((o) => ({ id: o.id, vector: o.vector, payload: o.payload }));
  const qvec = pseudoEmbed(QUERY);
  // Check Redis exact cache first (hash of query)
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const redis = new Redis(redisUrl);
  const qhash = crypto.createHash('sha1').update(QUERY).digest('hex');
  const exact = await redis.get(`scenario:exact:${qhash}`);
  if (exact) {
    console.log('Redis exact cache hit. Returning cached response:', exact);
    await redis.quit();
    return;
  }
  // dynamic import of rerank utility from the sveltekit frontend built file
  const { rerank: rv } = await import('../../sveltekit-frontend/src/lib/server/ai/turbovec-rerank.ts');
  const ranked = rv(qvec, candidates);
  // If top candidate is strong, write an exact cache key for future
  const top = ranked[0];
  if (top && top.score >= 0.90) {
    const store = JSON.stringify({ id: top.id, response: top.payload?.response || top.payload?.name });
    await redis.set(`scenario:exact:${qhash}`, store, 'EX', 60 * 60 * 24); // 24h
    console.log('Cached exact response in Redis for query hash', qhash);
    await redis.quit();
  } else {
    await redis.quit();
  }
  console.log('Top 5 results:');
  for (let i = 0; i < Math.min(5, ranked.length); i++) {
    const r = ranked[i];
    console.log(i+1, r.id, r.score.toFixed(4), r.payload && r.payload.name);
  }
  if (top.score >= 0.90) console.log('Confidence high - return cached response');
  else if (top.score >= 0.75) console.log('Confidence medium - rewrite cached response with LLM');
  else console.log('Low confidence - run full RAG + Gemma4');
}

run().catch(e => { console.error(e); process.exit(2); });
