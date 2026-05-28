#!/usr/bin/env node
/**
 * bifrost-trace-smoke.mjs
 *
 * Smoke-tests the Bifrost L1→L2→L3 cache cascade:
 *   L1: Redis exact-match (SHA-256 key)
 *   L2: Qdrant semantic cache (direct HTTP, fastJsonParse hot path)
 *   L3: Ollama direct completion (fastJsonParse hot path)
 *
 * Does NOT call Ollama for generation — probes L1 and L2 availability only,
 * then verifies the fastJsonParse path parses a synthetic Qdrant response.
 *
 * Exit 0 = smoke pass. Exit 1 = critical failure.
 *
 * Usage:
 *   node scripts/smoke/bifrost-trace-smoke.mjs
 *   QDRANT_URL=http://localhost:6333 node scripts/smoke/bifrost-trace-smoke.mjs
 */

import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

const QDRANT_URL  = process.env.QDRANT_URL  || 'http://127.0.0.1:6333';
const REDIS_URL   = process.env.REDIS_URL   || 'redis://127.0.0.1:6379';
const OLLAMA_URL  = process.env.OLLAMA_URL  || 'http://127.0.0.1:11434';

// ── Load simdjson native addon ─────────────────────────────────────────────────
const esmRequire = createRequire(import.meta.url);
let nativeAddon = null;
for (const p of [
  resolve(ROOT, 'simd-bridge', 'cpp', 'build', 'Release', 'tensorrt_bridge.node'),
  resolve(ROOT, 'simd-bridge', 'build', 'Release', 'tensorrt_bridge.node'),
]) {
  if (!existsSync(p)) continue;
  try {
    const m = esmRequire(p);
    if (typeof m.simdJsonParse === 'function') { nativeAddon = m; break; }
  } catch { /* try next */ }
}

function fastJsonParse(text) {
  if (nativeAddon && text.length >= 1024) {
    try { return JSON.parse(nativeAddon.simdJsonParse(text)); } catch { /* fall */ }
  }
  return JSON.parse(text);
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

async function probe(label, fn) {
  const t0 = performance.now();
  try {
    const result = await fn();
    const ms = (performance.now() - t0).toFixed(1);
    console.log(`  ✅ ${label.padEnd(30)} ${ms}ms`);
    return { ok: true, ms: parseFloat(ms), result };
  } catch (e) {
    const ms = (performance.now() - t0).toFixed(1);
    console.log(`  ❌ ${label.padEnd(30)} ${ms}ms  — ${e.message}`);
    return { ok: false, ms: parseFloat(ms), error: e.message };
  }
}

// ── Probes ─────────────────────────────────────────────────────────────────────

async function probeRedis() {
  // Use ioredis (installed in sveltekit-frontend) with no auto-reconnect for smoke checks
  const ioredisPath = resolve(ROOT, 'sveltekit-frontend', 'node_modules', 'ioredis', 'built', 'index.js');
  const { default: Redis } = await import(pathToFileURL(ioredisPath).href);
  const client = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    connectTimeout: 2000,
  });
  client.on('error', () => {});
  await client.connect();
  const pong = await client.ping();
  await client.quit();
  if (pong !== 'PONG') throw new Error(`unexpected ping response: ${pong}`);
  return pong;
}

async function probeQdrant() {
  const res = await fetch(`${QDRANT_URL}/collections`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const data = fastJsonParse(text);
  const count = data?.result?.collections?.length ?? 0;
  return { collections: count, parser: nativeAddon && text.length >= 1024 ? 'simdjson' : 'json.parse', bytes: text.length };
}

async function probeOllamaHealth() {
  const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const data = fastJsonParse(text);
  const models = data?.models?.length ?? 0;
  return { models, bytes: text.length };
}

async function probeFastJsonParsePath() {
  // Synthesise a Qdrant-shaped response that would come back from L2 semantic cache search
  const synthetic = JSON.stringify({
    result: Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      score: 0.9 - i * 0.05,
      payload: {
        response: JSON.stringify({ choices: [{ message: { content: `cached answer ${i}` } }] }),
        model: 'gemma4-rotorquant:latest',
        cache_key: 'global',
      },
    })),
    status: 'ok',
    time: 0.001,
  });

  const t0 = performance.now();
  const parsed = fastJsonParse(synthetic);
  const ms = performance.now() - t0;
  const hit = parsed?.result?.[0];
  if (!hit) throw new Error('parse returned no result');
  const nested = JSON.parse(hit.payload.response);
  if (!nested?.choices?.[0]?.message?.content) throw new Error('nested parse failed');
  return {
    parser: nativeAddon && synthetic.length >= 1024 ? 'simdjson' : 'json.parse',
    bytes: synthetic.length,
    ms: ms.toFixed(3),
    topScore: hit.score,
    cachedContent: nested.choices[0].message.content,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══ Bifrost Trace Smoke ════════════════════════════════════════');
  console.log(`  QDRANT  : ${QDRANT_URL}`);
  console.log(`  REDIS   : ${REDIS_URL}`);
  console.log(`  OLLAMA  : ${OLLAMA_URL}`);
  console.log(`  simdjson: ${nativeAddon ? '✅ native SIMD/CPU loaded' : '⚠️  not loaded (JSON.parse fallback)'}`);
  console.log();

  const results = {};

  results.redis       = await probe('L1 Redis ping',              probeRedis);
  results.qdrant      = await probe('L2 Qdrant /collections',     probeQdrant);
  results.ollamaHealth= await probe('L3 Ollama /api/tags',        probeOllamaHealth);
  results.fastJson    = await probe('fastJsonParse L2 shape',     probeFastJsonParsePath);

  // Detail on fastJson result
  if (results.fastJson.ok) {
    const r = results.fastJson.result;
    console.log(`       parser: ${r.parser}  bytes: ${r.bytes}  parse: ${r.ms}ms  topScore: ${r.topScore}`);
  }

  // Tally
  const passed = Object.values(results).filter(r => r.ok).length;
  const total  = Object.keys(results).length;
  const critical = !results.fastJson.ok; // fastJsonParse path is always local — must pass

  console.log(`\n── Result: ${passed}/${total} passed ` + (critical ? '❌ CRITICAL FAILURE' : passed === total ? '✅ ALL PASS' : '⚠️  DEGRADED') + ' ──');

  if (!results.redis.ok)  console.log('  Redis offline — L1 exact-match cache disabled');
  if (!results.qdrant.ok) console.log('  Qdrant offline — L2 semantic cache disabled, L3 will be hot path');
  if (!results.ollamaHealth.ok) console.log('  Ollama offline — L3 inference unavailable');

  // Write report
  const report = {
    generatedAt: new Date().toISOString(),
    nativeAddon: !!nativeAddon,
    passed,
    total,
    results,
  };
  await fs.mkdir(resolve(ROOT, '.tmp'), { recursive: true });
  const outPath = resolve(ROOT, '.tmp', 'bifrost-trace-smoke.json');
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`  report → ${outPath}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (critical) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });