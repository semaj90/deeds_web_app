#!/usr/bin/env node
/**
 * warm-bifrost-semantic-cache.mjs
 *
 * Reads memory/packets/semantic-cache-candidates.jsonl (produced by
 * scripts/packets/semantic-cache-candidates.sql via DuckDB) and writes
 * the hot semantic routing state to Valkey under the bifrost:sem:* key layout.
 *
 * Key layout:
 *   bifrost:sem:packet:{query_hash}        → JSON packet value  TTL 3600s
 *   bifrost:sem:feature:{feature_id}       → JSON[] array       TTL 3600s
 *   bifrost:sem:sourceRef:{sha256(ref)}    → query_hash         TTL 7200s
 *   bifrost:sem:intent:{intent_hash}       → query_hash         TTL 3600s
 *   bifrost:sem:reward:zset                → ZADD reward score
 *   bifrost:sem:stale:zset                 → ZADD mtime epoch
 *
 * Usage:
 *   node scripts/cache/warm-bifrost-semantic-cache.mjs [--dry-run] [--limit N]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import Redis from 'ioredis';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

dotenv.config({ path: resolve(ROOT, '.env.local'), override: false });
dotenv.config({ path: resolve(ROOT, '.env'), override: false });

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const LIMIT_IDX = argv.indexOf('--limit');
const LIMIT = LIMIT_IDX >= 0 ? parseInt(argv[LIMIT_IDX + 1], 10) : 0;

const CANDIDATES_PATH = resolve(ROOT, 'memory', 'packets', 'semantic-cache-candidates.jsonl');
const TTL_PACKET  = 86400;   // 24h
const TTL_FEATURE = 86400;   // 24h
const TTL_SRCREF  = 172800;  // 48h

if (!fs.existsSync(CANDIDATES_PATH)) {
  console.error(`[bifrost-warm] candidates file not found: ${CANDIDATES_PATH}`);
  console.error(`  Run: npm run packets:duckdb:semantic  (requires DuckDB CLI)`);
  process.exit(1);
}

const redis = new Redis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis',
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
  connectTimeout: 3000,
});
redis.on('error', () => {});

// ── Helpers ───────────────────────────────────────────────────────────────
function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// Normalize a raw query to a stable intent string for cross-phrasing cache hits
function intentNormalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function makePacketValue(c) {
  return {
    packet_uuid: c.packet_uuid ?? c.query_hash,
    feature_id: c.feature_id,
    source_refs: Array.isArray(c.source_refs) ? c.source_refs : [],
    state: { route: c.prompt, som_cluster: c.som_cluster, cache_tier: c.cache_tier },
    token_hints: Array.isArray(c.token_hints) ? c.token_hints : [],
    answer_hint: c.answer_hint ?? '',
    reward: Number(c.reward) || 0,
    confidence: Number(c.confidence) || 0,
    created_at: new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[bifrost-warm] ${DRY_RUN ? 'DRY-RUN' : 'WRITE'} mode`);

  if (!DRY_RUN) {
    await redis.connect();
    await redis.ping();
    console.log(`[bifrost-warm] Valkey connected`);
  }

  const rl = createInterface({
    input: fs.createReadStream(CANDIDATES_PATH),
    crlfDelay: Infinity,
  });

  const featureIndex = new Map(); // feature_id → [packet_value, ...]
  let processed = 0;
  let written = 0;
  let skipped = 0;
  let intents = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (LIMIT > 0 && processed >= LIMIT) break;
    processed++;

    let c;
    try { c = JSON.parse(line); } catch { skipped++; continue; }

    const reward = Number(c.reward) || 0;
    if (reward <= 0) { skipped++; continue; }

    const packetVal = makePacketValue(c);
    const packetJson = JSON.stringify(packetVal);

    if (DRY_RUN) {
      if (processed <= 3) {
        console.log(`  [dry] bifrost:sem:packet:${c.query_hash} → reward=${reward.toFixed(4)}`);
      }
      written++;
      continue;
    }

    const pipeline = redis.pipeline();

    // 1. packet key
    pipeline.setex(`bifrost:sem:packet:${c.query_hash}`, TTL_PACKET, packetJson);

    // 2. sourceRef index
    for (const ref of (Array.isArray(c.source_refs) ? c.source_refs : [])) {
      const refHash = sha256hex(ref);
      pipeline.setex(`bifrost:sem:sourceRef:${refHash}`, TTL_SRCREF, c.query_hash);
      // stale tracking: score = now epoch so we can expire by mtime
      pipeline.zadd('bifrost:sem:stale:zset', Date.now(), String(ref).slice(0, 200));
    }

    // 3. reward sorted set
    pipeline.zadd('bifrost:sem:reward:zset', reward, c.query_hash);

    // 4. intent index — normalized prompt text → query_hash (enables cross-phrasing hits)
    const promptText = c.prompt || c.answer_hint || '';
    if (promptText) {
      const intentHash = sha256hex(intentNormalize(promptText)).slice(0, 16);
      pipeline.setex(`bifrost:sem:intent:${intentHash}`, TTL_PACKET, c.query_hash);
      intents++;
    }

    await pipeline.exec();
    written++;

    // collect for feature index
    if (c.feature_id) {
      if (!featureIndex.has(c.feature_id)) featureIndex.set(c.feature_id, []);
      featureIndex.get(c.feature_id).push(packetVal);
    }
  }

  // 4. feature index keys (best 10 per feature, sorted by reward)
  if (!DRY_RUN) {
    for (const [fid, packets] of featureIndex) {
      const top10 = packets
        .sort((a, b) => (b.reward || 0) - (a.reward || 0))
        .slice(0, 10);
      await redis.setex(`bifrost:sem:feature:${fid}`, TTL_FEATURE, JSON.stringify(top10));
    }
    console.log(`[bifrost-warm] feature index: ${featureIndex.size} features written`);
  }

  console.log(`[bifrost-warm] processed=${processed}  written=${written}  skipped=${skipped}  intents=${intents}`);

  if (!DRY_RUN) {
    // Summary key for monitoring
    await redis.setex('bifrost:sem:warm:summary', 86400, JSON.stringify({
      ts: new Date().toISOString(),
      processed,
      written,
      skipped,
      features: featureIndex.size,
      intents,
    }));
    await redis.quit();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
