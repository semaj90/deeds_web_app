#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { QdrantClient } from '@qdrant/js-client-rest';

const ROOT = process.cwd();
const EMB_DIR = path.join(ROOT, '.opencode', 'embeddings');

function cosine(a, b) {
  let na = 0, nb = 0, dot = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb) + 1e-12);
}

async function localSearch(vec, top = 10) {
  const files = await fs.readdir(EMB_DIR).catch(() => []);
  const res = [];
  for (const f of files) {
    if (!/\.json$/.test(f)) continue;
    let content;
    try {
      content = await fs.readFile(path.join(EMB_DIR, f), 'utf8');
      const j = JSON.parse(content);
      if (!j.vector) continue;
      const score = cosine(vec, j.vector);
      res.push({ id: j.id, score, metadata: j.metadata });
    } catch (e) {
      // skip malformed/partial files
      continue;
    }
  }
  res.sort((a,b)=>b.score-a.score);
  return res.slice(0, top);
}

async function embedQuery(q) {
  // deterministic pseudo-embedding to match embed-cards
  const seed = crypto.createHash('sha256').update(q).digest();
  const vec = new Float32Array(768);
  let s = seed;
  for (let i=0;i<768;i++){ s = crypto.createHash('sha256').update(s).digest(); vec[i]=((s.readUInt32BE(0)/0xffffffff)*2)-1; }
  return Array.from(vec);
}

async function main() {
  const q = process.argv.slice(2).join(' ') || 'What is similar to ACE?';
  const vec = await embedQuery(q);
  const qdrantUrl = process.env.QDRANT_URL || process.env.QDRANT_HOST;
  if (qdrantUrl) {
    const client = new QdrantClient({ url: qdrantUrl });
    const collection = process.env.QDRANT_COLLECTION || 'rag_cards';
    console.log('Querying Qdrant', collection);
    try {
      const resp = await client.search(collection, { vector: vec, limit: 10 });
      console.log('Qdrant results:', resp);
      return;
    } catch (e) { console.warn('Qdrant search failed, falling back', e.message); }
  }
  console.log('Falling back to local search');
  const hits = await localSearch(vec, 10);
  console.log('Top hits:');
  for (const h of hits) console.log(h.score.toFixed(4), h.id, h.metadata.title);
}

main().catch(e=>{ console.error(e); process.exit(1); });
