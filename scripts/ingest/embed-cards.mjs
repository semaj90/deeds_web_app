#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const ROOT = process.cwd();
const CARDS_DIR = path.join(ROOT, '.opencode', 'cards');
const OUT_DIR = path.join(ROOT, '.opencode', 'embeddings');

await fs.mkdir(OUT_DIR, { recursive: true });

function pseudoEmbedding(text, dim = 768) {
  // Deterministic pseudo-embedding: SHA256 stream -> floats
  const out = new Float32Array(dim);
  let seed = crypto.createHash('sha256').update(text).digest();
  for (let i = 0; i < dim; i++) {
    // expand seed
    seed = crypto.createHash('sha256').update(seed).digest();
    // use first 4 bytes as uint32
    const v = seed.readUInt32BE(0);
    out[i] = ((v / 0xffffffff) * 2) - 1; // -1..1
  }
  return Array.from(out);
}

async function fetchEmbedding(text) {
  const ollamaUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434')
    .replace(/^0\.0\.0\.0/, '127.0.0.1').replace(/\/$/, '');
  const embedModel = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
  try {
    // Use /api/embed (batch API) — faster than legacy /api/embeddings
    const res = await fetch(`${ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: embedModel, input: [text] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const d = await res.json();
      const vec = d.embeddings?.[0] ?? d.embedding;
      if (Array.isArray(vec) && vec.length === 768) return vec;
    }
  } catch {}
  return pseudoEmbedding(text);
}

async function pool(tasks, limit) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

async function run() {
  const files = await fs.readdir(CARDS_DIR).catch(() => []);
  let count = 0;
  // Prefer SIMD-accelerated batch parsing via simd-bridge worker pool if available.
  let useSimd = false;
  let WorkerPool = null;
  try {
    WorkerPool = await import('../../simd-bridge/worker-pool.js');
    useSimd = true;
  } catch (e) {
    useSimd = false;
  }

  const tasks = [];

  if (useSimd) {
    const wp = new WorkerPool.default(path.join(process.cwd(), 'simd-bridge', 'worker.js'));
    const jsonFiles = files.filter((f) => /\.json$/.test(f)).map((f) => path.join(CARDS_DIR, f));
    const batchSize = 128;
    for (let i = 0; i < jsonFiles.length; i += batchSize) {
      const batch = jsonFiles.slice(i, i + batchSize);
      // Read contents locally to avoid worker file I/O
      const contents = await Promise.all(batch.map((p) => fs.readFile(p, 'utf8')));
      const res = await wp.exec({ type: 'parse', contents });
      
      if (!res || !res.success) {
        console.warn('SIMD worker batch failed:', res && res.error);
        // fallback to sequential parse for this batch
        for (const p of batch) {
          tasks.push(async () => {
            const j = JSON.parse(await fs.readFile(p, 'utf8'));
            const vec = await fetchEmbedding(j.text);
            const out = { id: j.id, vector: vec, metadata: { title: j.title, source: j.source } };
            await fs.writeFile(path.join(OUT_DIR, `${j.id}.json`), JSON.stringify(out));
            count++;
          });
        }
      } else {
        const parsed = res.result || [];
        for (let k = 0; k < parsed.length; k++) {
          const j = parsed[k];
          const obj = typeof j === 'string' ? JSON.parse(j) : j;
          tasks.push(async () => {
            const vec = await fetchEmbedding(obj.text);
            const out = {
              id: obj.id,
              vector: vec,
              metadata: { title: obj.title, source: obj.source },
            };
            await fs.writeFile(path.join(OUT_DIR, `${obj.id}.json`), JSON.stringify(out));
            count++;
          });
        }
      }
    }
    wp.destroy();
  } else {
    for (const f of files) {
      if (!/\.json$/.test(f)) continue;
      const p = path.join(CARDS_DIR, f);
      tasks.push(async () => {
        const j = JSON.parse(await fs.readFile(p, 'utf8'));
        const vec = await fetchEmbedding(j.text);
        const out = { id: j.id, vector: vec, metadata: { title: j.title, source: j.source } };
        await fs.writeFile(path.join(OUT_DIR, `${j.id}.json`), JSON.stringify(out));
        count++;
      });
    }
  }

  // Run embeddings requests in parallel (pool size 10)
  console.log(`Processing ${tasks.length} cards for embedding...`);
  await pool(tasks, 10);
  console.log('Embedded', count, 'cards ->', OUT_DIR);
}

run().catch(e => { console.error(e); process.exit(1); });
