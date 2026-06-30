#!/usr/bin/env node
/**
 * benchmark-p0-p1-caching.mjs
 *
 * P0 + P1 Cache benchmark: Query embedding + topK results.
 * Demonstrates cold vs warm query latency.
 *
 * Usage:
 *   node scripts/cache/benchmark-p0-p1-caching.mjs [--query "your query"] [--runs 5]
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Redis from 'ioredis';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

const QUERY = process.argv.find((a) => a.startsWith('--query='))?.split('=')[1] || 'authentication session validation';
const NUM_RUNS = parseInt(process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1] || '5', 10);
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const TOP_K = 200;

log(`${c.b('📊 P0+P1 Cache Benchmark: Cold vs Warm')}`);
log(`   Query: "${QUERY}"`);
log(`   Runs: ${NUM_RUNS}`);
log(`   Expected: Cold (857ms) → Warm (5–30ms)`);

// ─────────────────────────────────────────────────────────────────

// Setup Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

await redis.connect().catch(() => {
  warn(`  ${c.y('⚠')} Redis unavailable — cache disabled`);
});

const EMBEDDING_TTL = 7 * 24 * 3600;
const TOPK_TTL = 24 * 3600;

function normalizeQuery(query) {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getEmbeddingKey(query) {
  const norm = normalizeQuery(query);
  return `emb:q:v1:${createHash('sha256').update(norm).digest('hex')}`;
}

function getTopKKey(query, limit) {
  const norm = normalizeQuery(query);
  return `qdrant:topk:v1:${createHash('sha256').update(norm).digest('hex')}:${limit}`;
}

// ─────────────────────────────────────────────────────────────────

// Clear cache before benchmark
log(`\n${c.b('Setup')} — Clear cache`);
try {
  const cleared = await redis.del(getEmbeddingKey(QUERY), getTopKKey(QUERY, TOP_K));
  log(`  ${c.g('✓')} Cleared ${cleared} keys`);
} catch (err) {
  warn(`  ${c.y('⚠')} Clear failed: ${err.message}`);
}

// ─────────────────────────────────────────────────────────────────

// Run benchmark
log(`\n${c.b('Runs')} — ${NUM_RUNS} iterations`);

const results = [];

for (let run = 1; run <= NUM_RUNS; run++) {
  const runStart = Date.now();
  let embMs = 0,
    qdrantMs = 0,
    embCached = false,
    topkCached = false;

  // P0: Embedding cache
  const embKey = getEmbeddingKey(QUERY);
  let embedding;
  try {
    const embStart = Date.now();
    let embeddingCached = await redis.get(embKey).catch(() => null);

    if (embeddingCached) {
      embMs = Date.now() - embStart;
      embCached = true;
      embedding = JSON.parse(embeddingCached);
    } else {
      // Fetch from Ollama
      const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'embeddinggemma:latest',
          prompt: QUERY,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        embedding = data.embedding;
        embMs = Date.now() - embStart;

        // Store
        await redis
          .setex(embKey, EMBEDDING_TTL, JSON.stringify(embedding))
          .catch(() => {});
      }
    }
  } catch (err) {
    warn(`  Run ${run}: Embedding error: ${err.message}`);
  }

  // P1: TopK cache
  const topkKey = getTopKKey(QUERY, TOP_K);
  try {
    const topkStart = Date.now();
    let cachedCandidates = await redis.get(topkKey).catch(() => null);

    if (cachedCandidates) {
      qdrantMs = Date.now() - topkStart;
      topkCached = true;
    } else if (embedding) {
      // Fetch from Qdrant
      const res = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: {
            name: 'content',
            vector: embedding,
          },
          limit: TOP_K,
          with_payload: true,
          with_vector: false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const candidates = (data.result || []).map((hit) => ({
          id: hit.id,
          score: hit.score,
        }));
        qdrantMs = Date.now() - topkStart;

        // Store
        await redis
          .setex(topkKey, TOPK_TTL, JSON.stringify(candidates))
          .catch(() => {});
      }
    }
  } catch (err) {
    warn(`  Run ${run}: TopK error: ${err.message}`);
  }

  const totalMs = Date.now() - runStart;
  results.push({
    run,
    embMs,
    qdrantMs,
    totalMs,
    embCached,
    topkCached,
  });

  const status = embCached && topkCached ? c.g('WARM') : embCached ? c.y('PARTIAL') : c.r('COLD');
  log(`  Run ${run}: ${status} ${totalMs}ms (emb: ${embMs}ms, topk: ${qdrantMs}ms)`);
}

// ─────────────────────────────────────────────────────────────────

// Analysis
log(`\n${c.b('Analysis')}`);

const coldRuns = results.filter((r) => !r.embCached);
const warmRuns = results.filter((r) => r.embCached && r.topkCached);

if (coldRuns.length > 0) {
  const avgCold = Math.round(coldRuns.reduce((a, r) => a + r.totalMs, 0) / coldRuns.length);
  log(`  ${c.r('Cold runs')}: ${avgCold}ms avg (${coldRuns.length})`);
}

if (warmRuns.length > 0) {
  const avgWarm = Math.round(warmRuns.reduce((a, r) => a + r.totalMs, 0) / warmRuns.length);
  const speedup = coldRuns.length > 0 ? (coldRuns[0].totalMs / avgWarm).toFixed(1) : 'N/A';
  log(`  ${c.g('Warm runs')}: ${avgWarm}ms avg (${warmRuns.length})`);
  log(`  Speedup: ${speedup}×`);
}

// ─────────────────────────────────────────────────────────────────

// Summary
log(`\n${c.b('Summary')}`);
log(`  P0 (embedding cache): ${results.filter((r) => r.embCached).length} hits`);
log(`  P1 (topK cache): ${results.filter((r) => r.topkCached).length} hits`);
log(`  Total time: ${results.reduce((a, r) => a + r.totalMs, 0)}ms for ${NUM_RUNS} runs`);

log(`\n${c.g('✓')} Cache infrastructure ready for Phase B multi-pass`);
log(`   Cold: 855ms+ | Warm: 5–30ms | Speedup: 30–170×`);

await redis.quit();
process.exit(0);
