#!/usr/bin/env node
/**
 * warm-bifrost-semantic-cache.mjs
 *
 * Reads memory/packets/semantic-cache-candidates.jsonl (output of DuckDB SQL join)
 * and writes each candidate into Valkey using the bifrost:sem:* key layout:
 *
 *   bifrost:sem:packet:{query_hash}       → full JSON packet (TTL 24h)
 *   bifrost:sem:feature:{feature_id}      → query_hash pointer (TTL 24h)
 *   bifrost:sem:sourceRef:{sha256(ref)}   → query_hash pointer (TTL 24h)
 *   bifrost:sem:reward:zset               → ZADD reward score → query_hash
 *   bifrost:sem:stale:zset                → ZADD mtime_epoch → source_ref
 *
 * Usage:
 *   node scripts/cache/warm-bifrost-semantic-cache.mjs
 *   node scripts/cache/warm-bifrost-semantic-cache.mjs --dry-run
 *   node scripts/cache/warm-bifrost-semantic-cache.mjs --min-reward 0.7
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

const CANDIDATES_PATH = path.join(ROOT, 'memory', 'packets', 'semantic-cache-candidates.jsonl');

const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASS = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';

const DRY_RUN    = process.argv.includes('--dry-run');
const MIN_REWARD = parseFloat(process.argv.find(a => a.startsWith('--min-reward='))?.split('=')[1] ?? '0.6');
const TTL        = 86_400; // 24h

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

const redis = DRY_RUN ? null : new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASS || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis?.on('error', () => {});

async function main() {
  if (!DRY_RUN) await redis.connect();

  const rl = createInterface({
    input: createReadStream(CANDIDATES_PATH, 'utf8'),
    crlfDelay: Infinity,
  });

  let total = 0, written = 0, skipped = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let candidate;
    try { candidate = JSON.parse(trimmed); } catch { continue; }

    total++;

    if ((candidate.reward ?? 0) < MIN_REWARD) { skipped++; continue; }

    const {
      cache_key, query_hash, feature_id, source_refs,
      prompt, answer_hint, context_summary,
      reward, confidence, outcome_count, accepted_count,
      som_row, som_col, latest_timestamp,
    } = candidate;

    const packet = JSON.stringify({
      cache_key,
      query_hash,
      feature_id,
      source_refs: Array.isArray(source_refs) ? source_refs : [source_refs],
      prompt,
      answer_hint,
      context_summary,
      reward,
      confidence,
      outcome_count,
      accepted_count,
      som_row,
      som_col,
      created_at: new Date().toISOString(),
      sourced_at: latest_timestamp,
    });

    if (DRY_RUN) {
      console.log(`[dry-run] would write: bifrost:sem:packet:${query_hash}`);
      if (feature_id) console.log(`          bifrost:sem:feature:${feature_id}`);
      written++;
      continue;
    }

    const pipe = redis.pipeline();

    // L1: full packet by query hash
    pipe.setex(`bifrost:sem:packet:${query_hash}`, TTL, packet);

    // L2: feature_id → query_hash pointer
    if (feature_id) {
      pipe.setex(`bifrost:sem:feature:${feature_id}`, TTL, query_hash);
    }

    // L3: sourceRef sha256 → query_hash pointer
    const refs = Array.isArray(source_refs) ? source_refs : [source_refs];
    for (const ref of refs) {
      if (ref) pipe.setex(`bifrost:sem:sourceRef:${sha256(ref)}`, TTL, query_hash);
    }

    // Sorted sets: reward ranking + stale tracking
    pipe.zadd('bifrost:sem:reward:zset', reward, query_hash);
    const mtime = latest_timestamp ? new Date(latest_timestamp).getTime() : Date.now();
    for (const ref of refs) {
      if (ref) pipe.zadd('bifrost:sem:stale:zset', mtime, ref);
    }

    await pipe.exec();
    written++;
  }

  if (!DRY_RUN) await redis.quit();

  console.log(JSON.stringify({
    ok: true,
    dry_run: DRY_RUN,
    total_lines: total,
    written,
    skipped,
    min_reward: MIN_REWARD,
  }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
