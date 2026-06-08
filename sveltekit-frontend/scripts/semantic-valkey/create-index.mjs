#!/usr/bin/env node
/**
 * Create (or verify) the Valkey FT index for semantic prompt caching.
 *
 * Index name : prompt:sem:idx
 * Key prefix : prompt:sem:v1:*
 * Fields     : kind (TAG), tags (TAG), model (TAG), vec (VECTOR HNSW 768-dim cosine)
 *
 * Run once after Valkey starts, or whenever the index is dropped.
 * Safe to re-run — skips creation when index already exists.
 *
 * Usage:
 *   node scripts/semantic-valkey/create-index.mjs
 *   node scripts/semantic-valkey/create-index.mjs --drop-first
 */

import { createClient } from 'redis';

const REDIS_URL  = process.env.REDIS_URL  ?? `redis://${process.env.REDIS_HOST ?? '127.0.0.1'}:${process.env.REDIS_PORT ?? 6379}`;
const REDIS_PASS = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';

const INDEX_NAME = 'prompt:sem:idx';
const KEY_PREFIX = 'prompt:sem:v1:';
const DIM = 768;

const dropFirst = process.argv.includes('--drop-first');

const redis = createClient({
  url: REDIS_URL,
  password: REDIS_PASS,
  socket: { connectTimeout: 4000 },
});
redis.on('error', () => {});
await redis.connect();

// ── Drop existing index ───────────────────────────────────────────────────────
if (dropFirst) {
  try {
    await redis.sendCommand(['FT.DROPINDEX', INDEX_NAME]);
    console.log(`✅ Dropped existing index ${INDEX_NAME}`);
  } catch {
    console.log(`ℹ️  No existing index to drop`);
  }
}

// ── Check if index already exists ────────────────────────────────────────────
try {
  const info = await redis.sendCommand(['FT.INFO', INDEX_NAME]);
  console.log(`✅ Index ${INDEX_NAME} already exists — skipping creation`);
  // Print basic stats
  const infoArr = info;
  const numDocs = Array.isArray(infoArr)
    ? infoArr[infoArr.indexOf('num_docs') + 1] ?? '?'
    : '?';
  console.log(`   num_docs: ${numDocs}`);
  await redis.quit();
  process.exit(0);
} catch {
  // Index doesn't exist — create it
}

// ── Create HNSW index ─────────────────────────────────────────────────────────
await redis.sendCommand([
  'FT.CREATE', INDEX_NAME,
  'ON', 'HASH',
  'PREFIX', '1', KEY_PREFIX,
  'SCHEMA',
  'kind',  'TAG',                          // pre-filter: prompt | rule | fix | source_ref | error
  'tags',  'TAG',  'SEPARATOR', ',',       // comma-separated tag list
  'model', 'TAG',                          // pre-filter by model name
  'vec',   'VECTOR', 'HNSW', '8',
           'TYPE',            'FLOAT32',
           'DIM',             String(DIM),
           'DISTANCE_METRIC', 'COSINE',
           'M',               '16',
           'EF_CONSTRUCTION', '200',
]);

console.log(`✅ Created index ${INDEX_NAME}`);
console.log(`   prefix  : ${KEY_PREFIX}`);
console.log(`   vector  : HNSW FLOAT32 ${DIM}-dim cosine`);
console.log(`   fields  : kind(TAG), tags(TAG), model(TAG), vec(VECTOR)`);

await redis.quit();