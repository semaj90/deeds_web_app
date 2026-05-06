#!/usr/bin/env node
/**
 * warm-forest-clusters.mjs — Seed cluster:forest:embed:* in Redis
 *
 * Reads all cluster:summary:{id} keys, embeds each summary text via
 * cluster-summary-forest.ts logic (Ollama HTTP), and caches the result.
 *
 * Run after graphify:daily once cluster summaries are written.
 * Idempotent: skips clusters that already have cached embeddings.
 *
 * Usage:
 *   node scripts/warm-forest-clusters.mjs [--force]
 */

import { createClient } from 'redis';

const FORCE      = process.argv.includes('--force');
const REDIS_URL  = process.env.REDIS_URL      ?? 'redis://127.0.0.1:6379';
const REDIS_PASS = process.env.REDIS_PASSWORD;
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const EMBED_MODEL= process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';
const TTL        = 3_600;

const redis = createClient({ url: REDIS_URL, ...(REDIS_PASS ? { password: REDIS_PASS } : {}) });
await redis.connect();

// ── helpers ───────────────────────────────────────────────────────────────────

function float32ToBase64(arr) {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).toString('base64');
}

async function embedText(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const { embedding } = await res.json();
  if (!Array.isArray(embedding) || embedding.length !== 768) throw new Error('bad embedding shape');
  return new Float32Array(embedding);
}

function summaryText(clusterId, data) {
  if (typeof data.summary     === 'string' && data.summary.length     > 5) return data.summary;
  if (typeof data.description === 'string' && data.description.length > 5) return data.description;
  if (typeof data.label       === 'string' && data.label.length       > 5) return data.label;
  const paths = Array.isArray(data.topPaths) ? data.topPaths.slice(0, 6) : [];
  if (paths.length > 0) return `Cluster ${clusterId}: ${paths.join(', ')}`;
  return null;
}

// ── SCAN + embed ──────────────────────────────────────────────────────────────

const keys = [];
let cursor = '0';
do {
  const [next, found] = await redis.scan(cursor, { MATCH: 'cluster:summary:*', COUNT: 100 });
  cursor = next;
  keys.push(...found);
} while (cursor !== '0');

console.log(`Found ${keys.length} cluster:summary:* keys`);
let warmed = 0, skipped = 0, failed = 0;

for (const key of keys) {
  const clusterId = Number(key.replace('cluster:summary:', ''));
  if (isNaN(clusterId)) { skipped++; continue; }

  const forestKey = `cluster:forest:embed:${clusterId}`;
  if (!FORCE && await redis.exists(forestKey)) { skipped++; continue; }

  let data;
  try {
    const raw = await redis.get(key);
    if (!raw) { skipped++; continue; }
    data = JSON.parse(raw);
  } catch { skipped++; continue; }

  const text = summaryText(clusterId, data);
  if (!text) { skipped++; continue; }

  try {
    const vec = await embedText(text);
    const pl  = redis.multi();
    pl.setEx(forestKey, TTL, float32ToBase64(vec));
    pl.sAdd('cluster:forest:known_ids', String(clusterId));
    await pl.exec();
    warmed++;
    process.stdout.write(`  ✓ cluster ${clusterId} (${text.slice(0, 50)})\n`);
  } catch (err) {
    failed++;
    console.warn(`  ✗ cluster ${clusterId}: ${err.message}`);
  }
}

await redis.quit();
console.log(`\nDone: ${warmed} warmed, ${skipped} skipped, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
