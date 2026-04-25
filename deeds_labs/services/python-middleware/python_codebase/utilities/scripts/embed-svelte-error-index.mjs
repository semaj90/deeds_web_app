import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import { QdrantClient } from "@qdrant/js-client-rest";
import { createClient as createRedis } from "redis";
import pgPkg from "pg";

const INDEX_DIR = path.resolve("svelte-check-errors-index");
const TOP_FILES_PATH = path.join(INDEX_DIR, "top-files.json");
const TOP_MESSAGES_PATH = path.join(INDEX_DIR, "top-messages.json");

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const EMBED_MODEL = process.env.EMBED_MODEL || "embeddinggemma:latest";
const TARGET_DIM = process.env.TARGET_DIM ? Number(process.env.TARGET_DIM) : undefined; // optional 768/512/384
const USE_FILES = (process.env.EMBED_SOURCE || "files") === "files";
const LIMIT = Number(process.env.EMBED_LIMIT || 500); // cap to avoid huge upserts

const QDRANT_URL = process.env.QDRANT_URL; // e.g. http://localhost:6333
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || "svelte_errors";

const REDIS_URL = process.env.REDIS_URL; // e.g. redis://localhost:6379
const PG_URL = process.env.DATABASE_URL; // postgresql://...
const PG_DIM = process.env.PGVECTOR_DIM ? Number(process.env.PGVECTOR_DIM) : undefined;

function ollama(urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({ method: 'POST', hostname: u.hostname, port: u.port, path: u.pathname, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function getEmbedding(text, redis) {
  const key = `embed:v1:${EMBED_MODEL}:${Buffer.from(text).toString('base64').slice(0,128)}`;
  if (redis) {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  }
  const url = OLLAMA_URL.endsWith('/') ? `${OLLAMA_URL}api/embeddings` : `${OLLAMA_URL}/api/embeddings`;
  let vec = null;
  // Prefer `input` field; fallback to deprecated `prompt` if needed.
  try {
    const res = await ollama(url, { model: EMBED_MODEL, input: text });
    vec = res?.embedding || res?.data?.[0]?.embedding;
  } catch (err) {
    console.warn('Embedding input call failed, retrying with prompt:', err?.message || err);
  }
  if (!Array.isArray(vec)) {
    const resFallback = await ollama(url, { model: EMBED_MODEL, prompt: text });
    vec = resFallback?.embedding || resFallback?.data?.[0]?.embedding;
  }
  if (!Array.isArray(vec) || vec.length === 0) throw new Error('No embedding returned');
  // Optional dimensionality reduction by truncation (fast, lossy). Use when downstream DB requires fixed dims.
  if (TARGET_DIM && TARGET_DIM > 0 && vec.length > TARGET_DIM) {
    vec = vec.slice(0, TARGET_DIM);
  }
  if (redis) await redis.set(key, JSON.stringify(vec), { EX: 60 * 60 * 24 });
  return vec;
}

async function upsertQdrant(points, dim) {
  if (!QDRANT_URL) return;
  const client = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY });
  try {
    await client.getCollections();
  } catch (_) {}
  try {
    await client.createCollection(QDRANT_COLLECTION, { vectors: { size: dim, distance: 'Cosine' } });
  } catch (_) {}
  await client.upsert(QDRANT_COLLECTION, { points });
}

async function upsertPostgres(rows, dim) {
  if (!PG_URL || !dim) return;
  const { Client } = pgPkg;
  const client = new Client({ connectionString: PG_URL });
  await client.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(`CREATE TABLE IF NOT EXISTS svelte_error_embeddings (
      id bigserial PRIMARY KEY,
      kind text,
      file text,
      message text,
      count integer,
      embedding vector(${dim})
    )`);
    const insertText = `INSERT INTO svelte_error_embeddings(kind,file,message,count,embedding) VALUES ($1,$2,$3,$4,$5)`;
    for (const r of rows) {
      await client.query(insertText, [r.kind, r.file || null, r.message || null, r.count || 0, `[${r.vector.join(',')}]`]);
    }
    console.log(`Inserted ${rows.length} rows into Postgres (pgvector dim=${dim}).`);
  } finally {
    await client.end();
  }
}

async function main() {
  if (!fs.existsSync(INDEX_DIR)) {
    console.error(`Index folder not found: ${INDEX_DIR}. Run analyze script first.`);
    process.exit(1);
  }
  const sourcePath = USE_FILES ? TOP_FILES_PATH : TOP_MESSAGES_PATH;
  const arr = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const take = arr.slice(0, LIMIT);

  const redis = REDIS_URL ? createRedis({ url: REDIS_URL }) : null;
  if (redis) await redis.connect();

  const points = [];
  let dim = null;
  for (let i = 0; i < take.length; i++) {
    const item = take[i];
    const text = USE_FILES
      ? `[FILE] ${item.file}\nCount=${item.count}\nMessages:\n${(item.items||[]).map(x=>`- ${x.level?.toUpperCase()||''} ${x.code||''} ${x.message||''}`).join('\n')}`
      : `[MESSAGE] (${item.count}) ${item.message}`;

    try {
      const vec = await getEmbedding(text, redis);
      if (!dim) dim = vec.length;
      const payload = USE_FILES ? { type: 'file', file: item.file, count: item.count } : { type: 'message', message: item.message, count: item.count };
      points.push({ id: i, vector: vec, payload });
    } catch (e) {
      console.error('Embedding failed for item', i, e.message);
    }
  }

  if (points.length && QDRANT_URL) {
    await upsertQdrant(points, dim);
    console.log(`Upserted ${points.length} items to Qdrant collection ${QDRANT_COLLECTION} (dim=${dim}).`);
  } else {
    const out = path.join(INDEX_DIR, USE_FILES ? 'embeddings-files.json' : 'embeddings-messages.json');
    fs.writeFileSync(out, JSON.stringify(points, null, 2));
    console.log(`Wrote ${points.length} embeddings to ${out}`);
  }

  // Optional Postgres upsert
  if (points.length && PG_URL && dim) {
    const rows = points.map(p => ({
      kind: USE_FILES ? 'file' : 'message',
      file: p.payload.file,
      message: p.payload.message,
      count: p.payload.count,
      vector: p.vector
    }));
    await upsertPostgres(rows, dim);
  }

  if (redis) await redis.quit();
}

main();
