#!/usr/bin/env node
import fetch from 'node-fetch';
import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'scenarios';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

function sha256Hex(input) { return crypto.createHash('sha256').update(input).digest('hex'); }

function pseudoEmbed(text, dim = 768) {
  const h = sha256Hex(text);
  const buf = Buffer.from(h, 'hex');
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) out[i] = (buf[i % buf.length] / 255) * 2 - 1;
  return Array.from(out);
}

async function redisGet(key) {
  try {
    const redis = await import('redis');
    const client = redis.createClient({ url: REDIS_URL });
    await client.connect();
    const v = await client.get(key);
    await client.disconnect();
    return v;
  } catch (e) {
    // Redis not available — treat as cache miss
    return null;
  }
}

function cosine(a, b) {
  let da = 0, db = 0, dot = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; da += a[i]*a[i]; db += b[i]*b[i]; }
  return dot / (Math.sqrt(da)*Math.sqrt(db) + 1e-12);
}

async function qdrantSearch(vector, limit = 10) {
  const url = `${QDRANT_URL.replace(/\/$/, '')}/collections/${encodeURIComponent(QDRANT_COLLECTION)}/points/search`;
  const body = { vector, limit, with_payload: true, with_vector: true };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Qdrant search failed: ' + await res.text());
  return res.json();
}

async function main() {
  const query = process.argv[2] || 'where is the bathroom?';
  const cacheKey = `prompt_cache:${sha256Hex(query)}`;
  const cached = await redisGet(cacheKey);
  if (cached) {
    console.log('Redis cache hit — returning cached answer (Gemma4 NOT called):');
    console.log(cached);
    return;
  }

  // embed
  let qvec = null;
  if (process.env.EMBED_URL) {
    try {
      const res = await fetch(process.env.EMBED_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts: [query] }) });
      const j = await res.json();
      qvec = j.embeddings?.[0] || null;
    } catch (e) { qvec = null; }
  }
  if (!qvec) qvec = pseudoEmbed(query);

  const before = await qdrantSearch(qvec, 10);
  const hits = (before.result || []).map(h => ({ id: String(h.id || h.payload?.content_hash || h.payload?.source_ref || ''), score: h.score ?? 0, payload: h.payload || {}, vector: h.vector || null }));

  // Rerank using simple cosine (TurboVec placeholder) preserving sourceRefs
  const reranked = hits.map(h => ({ ...h, sim: h.vector ? cosine(qvec, h.vector) : h.score })).sort((a,b)=>b.sim - a.sim);

  console.log('=== Before Rerank (top 5) ===');
  hits.slice(0,5).forEach((h,i)=> console.log(`#${i+1}`, h.payload.source_ref || h.id, 'score:', h.score));
  console.log('\n=== After Rerank (top 5) ===');
  reranked.slice(0,5).forEach((h,i)=> console.log(`#${i+1}`, h.payload.source_ref || h.id, 'sim:', h.sim));

  // Emit before/after diff JSON to stdout file for acceptance
  const out = { query, before: hits.slice(0,10), after: reranked.slice(0,10) };
  const outFile = process.env.OUT || '.tmp/scenario_rerank_diff.json';
  await fs.mkdir('.tmp', { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote rerank diff to', outFile);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e=>{ console.error(e); process.exit(1); });
