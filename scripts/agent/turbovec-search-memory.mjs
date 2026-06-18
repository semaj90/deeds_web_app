#!/usr/bin/env node
/**
 * turbovec-search-memory.mjs — Phase 11H
 * User intent embedding cache with TurboVec-ready 64-dim compression.
 *
 * Stores recent intent vectors per user in Redis:
 *   turbovec:memory:{user_id}  — hash: intentHash → JSON{intent, vector64, ts}
 *   turbovec:memory:global     — last 200 intents across all users
 *
 * Embedding path:
 *   1. Try Ollama /api/embeddings (embeddinggemma:latest, 768-dim)
 *   2. Compress 768→64 via PCA mean-pool (no GPU needed, deterministic)
 *   3. Fallback: pseudo-embed (SHA-256 hash stream → float32) if Ollama down
 *
 * Usage:
 *   node scripts/agent/turbovec-search-memory.mjs "query text" [--user USER_ID]
 *   node scripts/agent/turbovec-search-memory.mjs --recall [--user USER_ID]
 *   node scripts/agent/turbovec-search-memory.mjs --stats
 *   node scripts/agent/turbovec-search-memory.mjs --dry-run "query text"
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { loadRepoEnv, resolveRedisUrl } from '../atlas/connection-config.mjs';

const ROOT    = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const RECALL  = process.argv.includes('--recall');
const STATS   = process.argv.includes('--stats');

const userIdx  = process.argv.indexOf('--user');
const USER_ID  = userIdx !== -1 ? process.argv[userIdx + 1] : 'default';

const queryArg = process.argv
  .slice(2)
  .filter(a => !a.startsWith('--') && process.argv.indexOf(a) !== userIdx + 1)
  .join(' ')
  .trim();

const DIM_FULL = 768;
const DIM_COMP = 64;
const TTL_SECS = 7 * 24 * 3600; // 7 days
const MAX_INTENTS = 200;

function intentHash(text) {
  return crypto.createHash('sha256').update(text.toLowerCase().trim()).digest('hex').slice(0, 16);
}

// Deterministic pseudo-embed (SHA-256 stream → float32)
function pseudoEmbed768(text) {
  let seed = crypto.createHash('sha256').update(String(text)).digest();
  const out = new Float32Array(DIM_FULL);
  for (let i = 0; i < DIM_FULL; i++) {
    seed   = crypto.createHash('sha256').update(seed).digest();
    out[i] = (seed.readUInt32BE(0) / 0xffffffff) * 2 - 1;
  }
  return Array.from(out);
}

// Mean-pool 768→64 (12 blocks of 12 dims each)
function compress768to64(vec768) {
  const blockSize = Math.floor(DIM_FULL / DIM_COMP); // 12
  const out = new Array(DIM_COMP).fill(0);
  for (let i = 0; i < DIM_COMP; i++) {
    let sum = 0;
    const start = i * blockSize;
    const end = Math.min(start + blockSize, DIM_FULL);
    for (let j = start; j < end; j++) sum += vec768[j];
    out[i] = sum / (end - start);
  }
  // L2 normalise
  const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
  return out.map(v => Math.round(v / norm * 10000) / 10000);
}

async function ollamaEmbed(text) {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text }),
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.embedding ?? null;
  } catch { return null; }
}

async function loadRedis() {
  const env = loadRepoEnv(process.env);
  const redisUrl = resolveRedisUrl(env);
  const candidates = [
    path.join(ROOT, 'sveltekit-frontend', 'node_modules', 'ioredis'),
    path.join(ROOT, 'node_modules', 'ioredis'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const mod = await import(p + '/built/index.js').catch(() => import(p));
      const Redis = mod.default ?? mod;
      const redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      redis.on('error', () => {});
      try {
        await redis.connect();
        await redis.ping();
        return redis;
      } catch { redis.disconnect(); }
    }
  }
  return null;
}

async function handleStats(redis) {
  if (!redis) { console.log('  ⚠️  Redis offline'); return; }
  const keys = await redis.keys('turbovec:memory:*');
  console.log(`\n  turbovec:memory keys: ${keys.length}`);
  for (const k of keys.slice(0, 10)) {
    const count = await redis.hlen(k);
    console.log(`    ${k}  — ${count} entries`);
  }
}

async function handleRecall(redis) {
  if (!redis) { console.log('  ⚠️  Redis offline'); return; }
  const key = `turbovec:memory:${USER_ID}`;
  const raw = await redis.hgetall(key);
  if (!raw || !Object.keys(raw).length) {
    console.log(`  no entries for user "${USER_ID}"`);
    return;
  }
  const entries = Object.values(raw).map(v => JSON.parse(v))
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, 10);
  console.log(`\n  Recent intents for user "${USER_ID}" (${entries.length} shown):`);
  for (const e of entries) {
    console.log(`    ${e.ts.slice(0, 19)}  ${e.intentHash}  "${e.intent.slice(0, 60)}"`);
  }
}

async function main() {
  console.log('\n── TurboVec Search Memory (Phase 11H) ────────────────────');

  const redis = await loadRedis();
  console.log(`  redis  : ${redis ? '✅ connected' : '⚠️  offline'}`);

  if (STATS) {
    await handleStats(redis);
    console.log('──────────────────────────────────────────────────────────\n');
    if (redis) redis.disconnect();
    return;
  }

  if (RECALL) {
    await handleRecall(redis);
    console.log('──────────────────────────────────────────────────────────\n');
    if (redis) redis.disconnect();
    return;
  }

  if (!queryArg) {
    console.error('  error: provide a query string or use --recall / --stats');
    process.exit(1);
  }

  console.log(`  query  : "${queryArg}"`);
  console.log(`  user   : ${USER_ID}`);

  const ih = intentHash(queryArg);
  console.log(`  hash   : ${ih}`);

  // Check if already stored
  if (redis && !DRY_RUN) {
    const exists = await redis.hexists(`turbovec:memory:${USER_ID}`, ih).catch(() => 0);
    if (exists) {
      console.log(`  cache  : HIT — already stored, refreshing TTL`);
      await redis.expire(`turbovec:memory:${USER_ID}`, TTL_SECS);
      console.log('──────────────────────────────────────────────────────────\n');
      redis.disconnect();
      return;
    }
  }

  // Embed
  let vec768 = await ollamaEmbed(queryArg);
  const embedSource = vec768 ? 'ollama' : 'pseudo';
  if (!vec768) vec768 = pseudoEmbed768(queryArg);
  console.log(`  embed  : ${embedSource} (768-dim)`);

  // Compress
  const vec64 = compress768to64(vec768);
  console.log(`  compressed → 64-dim`);

  const entry = {
    intentHash: ih,
    intent:     queryArg,
    userId:     USER_ID,
    vec64,
    embedSource,
    ts:         new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log(`\n  dry-run: would HSET turbovec:memory:${USER_ID} ${ih}`);
    console.log(`  vec64 preview: [${vec64.slice(0, 4).join(', ')} ...]`);
    console.log('──────────────────────────────────────────────────────────\n');
    if (redis) redis.disconnect();
    return;
  }

  if (!redis) {
    console.log('  ⚠️  Redis offline — cannot store');
    console.log('──────────────────────────────────────────────────────────\n');
    return;
  }

  const entryJson = JSON.stringify(entry);
  const userKey   = `turbovec:memory:${USER_ID}`;
  const globalKey = 'turbovec:memory:global';

  await redis.hset(userKey, ih, entryJson);
  await redis.expire(userKey, TTL_SECS);

  // Trim global list to last MAX_INTENTS
  await redis.hset(globalKey, ih, entryJson);
  const globalCount = await redis.hlen(globalKey);
  if (globalCount > MAX_INTENTS) {
    const allKeys = await redis.hkeys(globalKey);
    const toDelete = allKeys.slice(0, globalCount - MAX_INTENTS);
    if (toDelete.length) await redis.hdel(globalKey, ...toDelete);
  }
  await redis.expire(globalKey, TTL_SECS);

  console.log(`\n  ✅ HSET ${userKey} [${ih}]  (TTL 7d, embed:${embedSource})`);
  console.log(`  ✅ HSET ${globalKey} [${ih}]  (${Math.min(globalCount, MAX_INTENTS)} total)`);
  console.log('──────────────────────────────────────────────────────────\n');

  redis.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
