#!/usr/bin/env node
/**
 * smoke-context-assembler-bifrost.mjs
 *
 * Verifies that the Bifrost telemetry path in context-assembler.ts is firing:
 *   1. Redis has bitfrost:retrieval:* keys from recent context assembly calls
 *   2. The key shape matches the expected BifrostRetrievalLog schema
 *   3. Bifrost port :3040 is reachable (optional, soft failure)
 *
 * Run: node scripts/smoke/smoke-context-assembler-bifrost.mjs
 */

import Redis from 'ioredis';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from repo root so REDIS_PASSWORD is picked up without cross-env
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = existsSync(resolve(ROOT, 'sveltekit-frontend/.env'))
  ? resolve(ROOT, 'sveltekit-frontend/.env')
  : resolve(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const REDIS_PASS = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || '';
const REDIS_URL = process.env.REDIS_URL ?? `redis://${REDIS_PASS ? `:${REDIS_PASS}@` : ''}127.0.0.1:6379`;
const BIFROST_URL = process.env.BIFROST_URL ?? 'http://localhost:3040';

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', () => {});

let pass = 0;
let fail = 0;

function ok(label, detail) { console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); pass++; }
function err(label, detail) { console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); fail++; }
function warn(label, detail) { console.log(`  ⚠ ${label}${detail ? ' — ' + detail : ''}`); }

async function run() {
  console.log('\n── Context Assembler + Bifrost smoke ───────────────────────');

  try {
    await redis.connect();
    await redis.ping();
    ok('Redis connected');
  } catch (e) {
    err('Redis connect', e.message);
    await redis.disconnect();
    process.exit(1);
  }

  // Scan for bitfrost:retrieval:* keys
  let cursor = '0';
  const bifrostKeys = [];
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'bitfrost:retrieval:*', 'COUNT', 100);
    cursor = next;
    bifrostKeys.push(...keys);
  } while (cursor !== '0' && bifrostKeys.length < 50);

  if (bifrostKeys.length > 0) {
    ok(`Found ${bifrostKeys.length} bitfrost:retrieval:* keys in Redis`);

    // Validate schema of first key
    const sample = await redis.get(bifrostKeys[0]);
    if (sample) {
      try {
        const parsed = JSON.parse(sample);
        const required = ['query_hash', 'source_refs', 'cache_hit', 'latency_ms', 'logged_at'];
        const missing = required.filter(k => !(k in parsed));
        if (missing.length === 0) ok('Bifrost telemetry key schema valid');
        else err('Bifrost telemetry key missing fields', missing.join(', '));

        if (Array.isArray(parsed.source_refs) && parsed.source_refs.length > 0) {
          ok(`source_refs populated (${parsed.source_refs.length} refs)`);
        } else {
          warn('source_refs empty in sample key', 'context assembler may not be firing with real data');
        }

        if (parsed.atlas_cluster_ids?.length > 0) ok('atlas_cluster_ids present');
        else warn('atlas_cluster_ids empty', 'Qdrant payload may not have som_cluster field yet');

        if (parsed.feature_ids?.length > 0) ok('feature_ids present');
        else warn('feature_ids empty', 'Qdrant payload may not have feature_ids yet');
      } catch {
        err('Bifrost telemetry key JSON parse failed');
      }
    } else {
      err('Bifrost telemetry key returned null');
    }
  } else {
    warn('No bitfrost:retrieval:* keys found',
      'context assembler has not run or all TTLs expired (7200s); trigger a chat query to populate');
  }

  // Check ace:packet:latest
  const latestId = await redis.get('ace:packet:latest');
  if (latestId) {
    ok('ace:packet:latest exists', latestId);
    const latestRaw = await redis.get(`ace:packet:${latestId}`);
    if (latestRaw) {
      const p = JSON.parse(latestRaw);
      if (p.ranked_cards?.length > 0) ok(`Latest packet has ${p.ranked_cards.length} ranked_cards`);
      else warn('Latest packet has empty ranked_cards');
      if (!p.degraded) ok('Latest packet is not degraded');
      else warn('Latest packet is degraded', 'source_refs may be empty');
    }
  } else {
    warn('ace:packet:latest missing', 'no ACE packets written — run query-router or trigger a chat');
  }

  // Soft-check Bifrost :3040
  try {
    const res = await fetch(`${BIFROST_URL}/health`, { signal: AbortSignal.timeout(2_000) });
    if (res.ok) ok('Bifrost :3040 /health reachable');
    else warn(`Bifrost /health HTTP ${res.status}`, 'semantic cache may be down');
  } catch {
    warn('Bifrost :3040 not reachable', 'semantic cache offline — direct Qdrant fallback active');
  }

  console.log(`\n  Result: ${pass} passed, ${fail} failed (⚠ = soft warning, not counted as fail)`);
  await redis.disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
