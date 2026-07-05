#!/usr/bin/env node
/**
 * invalidate-atlas-cache-epoch.mjs
 *
 * Invalidate all cache layers on graph truth promotion.
 *
 * Operations (applied to live Redis):
 * 1. INCR atlas:graph_version
 * 2. INCR atlas:cache_epoch
 * 3. DEL atlas:lru:query:*
 * 4. DEL atlas:lru:packet:*
 * 5. DEL atlas:lru:tools:*
 * 6. DEL atlas:lru:kag:*
 * 7. DEL bifrost:sem:query:*
 * 8. DEL bifrost:sem:packet:*
 * 9. DEL bifrost:sem:feature:*
 * 10. DEL bifrost:sem:intent:*
 * 11. DEL ace:packet:*
 * (Do NOT delete Qdrant; update payload graph_version via sync-qdrant-payload-tags.mjs)
 *
 * Usage:
 *   node scripts/atlas/invalidate-atlas-cache-epoch.mjs --dry-run
 *   node scripts/atlas/invalidate-atlas-cache-epoch.mjs --apply
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

dotenv.config();

const { frontendRoot: FRONTEND_ROOT } = resolveAtlasPaths(import.meta.url);
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY   = process.argv.includes('--apply');
const VERBOSE  = process.argv.includes('--verbose');

const REPO_ROOT   = resolve(FRONTEND_ROOT, '..');
const REPORT_DIR  = resolve(FRONTEND_ROOT, 'docs/reports');
const REPORT_FILE = resolve(REPORT_DIR, 'atlas-cache-invalidation.json');

function log(msg)        { console.log(`[${new Date().toISOString()}] ${msg}`); }
function logVerbose(msg) { if (VERBOSE) console.log(`[VERBOSE] ${msg}`); }

function resolveRedisConfig() {
  const rawUrl      = process.env.REDIS_URL || '';
  const rawPassword = process.env.REDIS_PASSWORD || process.env.VALKEY_PASSWORD || undefined;
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      return {
        host:     url.hostname || 'localhost',
        port:     Number(url.port || 6379),
        password: rawPassword || (url.password ? decodeURIComponent(url.password) : undefined),
      };
    } catch { /* fall through */ }
  }
  return {
    host:     process.env.REDIS_HOST || 'localhost',
    port:     Number(process.env.REDIS_PORT || 6379),
    password: rawPassword,
  };
}

function timeoutAfter(ms, label) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms).unref?.()
  );
}

/** SCAN-and-DEL a key pattern in batches; returns count of keys deleted. */
async function scanDel(redis, pattern, dryRun) {
  let cursor = '0';
  let total  = 0;
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    if (keys.length === 0) continue;
    total += keys.length;
    if (!dryRun) await redis.del(...keys);
    logVerbose(`  ${pattern}: scanned ${keys.length} keys (cursor ${next})`);
  } while (cursor !== '0');
  return total;
}

async function main() {
  log('='.repeat(70));
  log('Atlas Cache Epoch Invalidation');
  log('='.repeat(70));
  log(`Mode: ${DRY_RUN ? 'DRY-RUN' : APPLY ? 'APPLY' : 'REPORT'}`);
  log('');

  const report = {
    timestamp:      new Date().toISOString(),
    mode:           DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'report',
    redis_config:   {},
    operations:     [],
    versions_before: {},
    versions_after:  {},
    keys_deleted:    {},
    total_latency_ms: 0,
    status:          'unknown',
  };

  const t0 = Date.now();

  const REDIS = resolveRedisConfig();
  report.redis_config = { host: REDIS.host, port: REDIS.port };

  const redis = new Redis({
    host:                 REDIS.host,
    port:                 REDIS.port,
    password:             REDIS.password,
    lazyConnect:          true,
    connectTimeout:       5000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue:   false,
    retryStrategy:        () => null,
  });
  redis.on('error', () => {});

  let redisReady = false;
  try {
    await Promise.race([redis.connect(), timeoutAfter(5000, 'Redis connect')]);
    await redis.ping();
    redisReady = true;
    log(`Connected to Redis at ${REDIS.host}:${REDIS.port}`);
  } catch (err) {
    log(`⚠️  Redis unavailable: ${err.message}`);
    log('   Cannot proceed without Redis for a live invalidation.');
    if (APPLY) {
      log('   Aborting --apply (no Redis). Use --dry-run to see planned operations.');
      process.exitCode = 1;
      return;
    }
  }

  try {
    // ── Step 1: Read current versions ──────────────────────────────────────
    logVerbose('Step 1: Read current cache versions from Redis');
    if (redisReady) {
      const [gv, ce, qv, rv, sv, kv] = await Promise.all([
        redis.get('atlas:graph_version'),
        redis.get('atlas:cache_epoch'),
        redis.get('atlas:qdrant_version'),
        redis.get('atlas:rpc_version'),
        redis.get('atlas:som_version'),
        redis.get('atlas:kmeans_version'),
      ]);
      report.versions_before = {
        graph_version:  Number(gv  ?? 0),
        cache_epoch:    Number(ce  ?? 0),
        qdrant_version: Number(qv  ?? 1),
        rpc_version:    Number(rv  ?? 1),
        som_version:    Number(sv  ?? 0),
        kmeans_version: Number(kv  ?? 0),
      };
    } else {
      report.versions_before = { graph_version: 0, cache_epoch: 0, qdrant_version: 1, rpc_version: 1, som_version: 0, kmeans_version: 0 };
    }

    log('Current versions:');
    Object.entries(report.versions_before).forEach(([k, v]) => log(`  ${k}: ${v}`));
    log('');

    // ── Dry-run report only ─────────────────────────────────────────────────
    if (!DRY_RUN && !APPLY) {
      log('Planned invalidation operations:');
      log('  1. INCR atlas:graph_version');
      log('  2. INCR atlas:cache_epoch');
      log('  3. DEL atlas:lru:query:*');
      log('  4. DEL atlas:lru:packet:*');
      log('  5. DEL atlas:lru:tools:*');
      log('  6. DEL atlas:lru:kag:*');
      log('  7. DEL bifrost:sem:query:*');
      log('  8. DEL bifrost:sem:packet:*');
      log('  9. DEL bifrost:sem:feature:*');
      log(' 10. DEL bifrost:sem:intent:*');
      log(' 11. DEL ace:packet:*');
      log('  (Qdrant payloads updated via sync-qdrant-payload-tags.mjs)');
      report.status = 'ready_to_apply';
    } else {
      // ── Step 2: Increment version counters ─────────────────────────────────
      logVerbose('Step 2: Increment graph_version and cache_epoch');
      let newGraphVersion = report.versions_before.graph_version + 1;
      let newCacheEpoch   = report.versions_before.cache_epoch   + 1;

      if (APPLY && redisReady) {
        newGraphVersion = await redis.incr('atlas:graph_version');
        newCacheEpoch   = await redis.incr('atlas:cache_epoch');
      }

      report.operations.push({ name: 'INCR atlas:graph_version', result: DRY_RUN ? 'skipped' : newGraphVersion });
      report.operations.push({ name: 'INCR atlas:cache_epoch',   result: DRY_RUN ? 'skipped' : newCacheEpoch   });

      log(`atlas:graph_version: ${report.versions_before.graph_version} → ${newGraphVersion} ${DRY_RUN ? '(dry-run, not applied)' : ''}`);
      log(`atlas:cache_epoch:   ${report.versions_before.cache_epoch}   → ${newCacheEpoch}   ${DRY_RUN ? '(dry-run, not applied)' : ''}`);
      log('');

      // ── Step 3: Delete Redis LRU and semantic cache keys ───────────────────
      logVerbose('Step 3: Scan-DEL Redis cache keys');
      const patterns = [
        'atlas:lru:query:*',
        'atlas:lru:packet:*',
        'atlas:lru:tools:*',
        'atlas:lru:kag:*',
        'bifrost:sem:query:*',
        'bifrost:sem:packet:*',
        'bifrost:sem:feature:*',
        'bifrost:sem:intent:*',
        'ace:packet:*',
      ];

      for (const pattern of patterns) {
        let count = 0;
        if (redisReady) {
          count = await scanDel(redis, pattern, DRY_RUN);
        }
        report.keys_deleted[pattern] = DRY_RUN ? `${count} (dry-run, not deleted)` : count;
        report.operations.push({ name: `DEL ${pattern}`, keys_deleted: count, applied: !DRY_RUN });
        log(`  ${pattern}: ${count} keys ${DRY_RUN ? 'found (not deleted)' : 'deleted'}`);
      }
      log('');

      // ── Step 4: Read back versions ─────────────────────────────────────────
      logVerbose('Step 4: Read new cache versions');
      if (APPLY && redisReady) {
        const [gv2, ce2] = await Promise.all([
          redis.get('atlas:graph_version'),
          redis.get('atlas:cache_epoch'),
        ]);
        report.versions_after = {
          ...report.versions_before,
          graph_version: Number(gv2),
          cache_epoch:   Number(ce2),
        };
      } else {
        report.versions_after = {
          ...report.versions_before,
          graph_version: newGraphVersion,
          cache_epoch:   newCacheEpoch,
        };
      }

      log('Versions after:');
      Object.entries(report.versions_after).forEach(([k, v]) => log(`  ${k}: ${v}`));
      log('');

      report.status = DRY_RUN ? 'dry_run_ok' : 'applied';
    }

    report.total_latency_ms = Date.now() - t0;
    log(`Total latency: ${report.total_latency_ms}ms`);
    log('');
    log('Next steps:');
    log('  1. node scripts/atlas/sync-qdrant-payload-tags.mjs --apply');
    log('  2. npm run atlas:cascade:smoke');
    log('  3. Verify: /api/atlas/search cache_epoch matches redis atlas:cache_epoch');

    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    log('');
    log(`✓ Report: ${REPORT_FILE}`);
    log(`✓ Atlas Cache Epoch Invalidation complete (${report.status})`);

  } finally {
    if (redisReady) await redis.quit().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`❌ Fatal: ${err.message}`);
  if (VERBOSE) console.error(err);
  process.exit(1);
});
