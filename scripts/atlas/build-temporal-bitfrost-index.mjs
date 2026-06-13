#!/usr/bin/env node
/**
 * build-temporal-bitfrost-index.mjs
 *
 * Builds a temporal index over atlas_packets, merging Bifrost/Redis semantic
 * cache metadata with packet timestamps to produce a time-ordered TOC for
 * ndjson replay and cache warm-up.
 *
 * What it does:
 *   1. Scans atlas_packets ordered by created_at DESC (temporal window)
 *   2. Enriches each packet with its Bifrost cache status (Redis key exists?)
 *   3. Writes a time-ordered ndjson TOC to .opencode/ndjson/temporal-index.ndjson
 *   4. Writes a Redis sorted set (temporal:packet:zset) keyed by packet_key
 *      with score = unix timestamp, for O(log N) range queries
 *   5. Writes temporal cohort buckets to Redis hashes:
 *        temporal:cohort:{YYYY-MM} → JSON array of packet_keys
 *   6. Writes a coverage report to docs/reports/temporal-bitfrost-index.json
 *
 * Why this matters:
 *   - Bifrost semantic cache (port 3040) stores embeddings by content hash.
 *     Knowing WHEN a packet was indexed lets the cache warm schedule prioritize
 *     recently-written packets (freshness bias) vs. cold archive packets.
 *   - The ndjson TOC gives the MapReduce pipeline a stable replay order —
 *     older packets replay first so newer rewrites always win on merge.
 *   - XGBoost feature export can attach temporal decay as a feature signal
 *     (recent packets get higher freshness_score).
 *
 * Usage:
 *   node scripts/atlas/build-temporal-bitfrost-index.mjs             # dry-run
 *   node scripts/atlas/build-temporal-bitfrost-index.mjs --apply
 *   node scripts/atlas/build-temporal-bitfrost-index.mjs --apply --verbose
 *   node scripts/atlas/build-temporal-bitfrost-index.mjs --apply --window=30d
 *   node scripts/atlas/build-temporal-bitfrost-index.mjs --apply --limit=5000
 */

import pg        from 'pg';
import Redis     from 'ioredis';
import { writeFileSync, mkdirSync, createWriteStream } from 'node:fs';
import path      from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto    from 'node:crypto';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Config ────────────────────────────────────────────────────────────────────
const APPLY   = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = !APPLY;

const WINDOW_ARG = process.argv.find(a => a.startsWith('--window='));
const LIMIT_ARG  = process.argv.find(a => a.startsWith('--limit='));
const WINDOW_DAYS = WINDOW_ARG ? parseDays(WINDOW_ARG.split('=')[1]) : null; // null = all time
const MAX_ROWS    = LIMIT_ARG  ? parseInt(LIMIT_ARG.split('=')[1], 10) : 50_000;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST   = process.env.REDIS_HOST   || '127.0.0.1';
const REDIS_PORT   = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASS   = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';
const BIFROST_URL  = process.env.BIFROST_URL   || 'http://127.0.0.1:3040';

const NDJSON_DIR  = path.resolve(ROOT, '.opencode/ndjson');
const NDJSON_FILE = path.resolve(NDJSON_DIR, 'temporal-index.ndjson');
const REPORT_DIR  = path.resolve(ROOT, 'docs/reports');

const REDIS_ZSET_KEY    = 'temporal:packet:zset';
const REDIS_COHORT_PFX  = 'temporal:cohort:';
const REDIS_INDEX_META  = 'temporal:index:meta';
const COHORT_TTL_S      = 60 * 60 * 24 * 7; // 7 days

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDays(s) {
  if (s.endsWith('d')) return parseInt(s, 10);
  if (s.endsWith('h')) return parseInt(s, 10) / 24;
  return parseInt(s, 10);
}

function isoToCohort(isoStr) {
  return (isoStr ?? '').slice(0, 7); // "YYYY-MM"
}

/** Freshness score: 1.0 for now, decays to 0.1 over 365 days */
function freshnessScore(createdAt) {
  const ageMs  = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / 86_400_000;
  return Math.max(0.1, 1.0 - (ageDays / 365) * 0.9);
}

/** Check if Bifrost has a cached embedding for a content hash */
async function bifrostCacheStatus(contentHash) {
  try {
    const res = await fetch(`${BIFROST_URL}/cache/status`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ hash: contentHash }),
      signal:  AbortSignal.timeout(3_000),
    });
    if (!res.ok) return false;
    const d = await res.json();
    return d.exists === true;
  } catch {
    return false; // Bifrost offline → treat as uncached
  }
}

/** SHA-256 of summary text — used as Bifrost content hash proxy */
function contentHash(summary) {
  if (!summary) return null;
  return crypto.createHash('sha256').update(summary.slice(0, 512)).digest('hex');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ Temporal Bitfrost Index ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══\n`);
  if (WINDOW_DAYS) console.log(`Window: last ${WINDOW_DAYS} days`);
  console.log(`Max rows: ${MAX_ROWS.toLocaleString()}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

  // Redis client (lazy, fail-open)
  let redis = null;
  let redisReady = false;
  try {
    redis = new Redis({
      host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS,
      lazyConnect: true, maxRetriesPerRequest: 1,
      enableOfflineQueue: false, retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    await redis.ping();
    redisReady = true;
    console.log('Redis: connected');
  } catch {
    console.log('Redis: offline — temporal zset/cohort writes skipped');
  }

  try {
    // ── 1. Fetch packets ordered by created_at ─────────────────────────────────
    const windowClause = WINDOW_DAYS
      ? `AND created_at >= NOW() - INTERVAL '${Math.ceil(WINDOW_DAYS)} days'`
      : '';

    const { rows } = await pool.query(`
      SELECT
        packet_key,
        source_ref,
        feature_id,
        community_id,
        source_kind,
        concept_ids,
        summary,
        reward_prior,
        community_confidence,
        created_at,
        updated_at,
        metadata
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
        ${windowClause}
      ORDER BY created_at DESC
      LIMIT $1
    `, [MAX_ROWS]);

    console.log(`Packets fetched: ${rows.length.toLocaleString()}`);

    // ── 2. Probe Bifrost for warm cache status (sample if > 200) ──────────────
    // Full probe is too slow for large datasets; sample the first 200 only.
    // Rest are marked as unknown.
    const BIFROST_PROBE_LIMIT = 200;
    const bifrostWarm = new Map(); // packet_key → boolean

    let bifrostAvailable = false;
    try {
      const healthRes = await fetch(`${BIFROST_URL}/health`, { signal: AbortSignal.timeout(2_000) });
      bifrostAvailable = healthRes.ok;
    } catch { /* offline */ }

    if (bifrostAvailable) {
      console.log(`Probing Bifrost cache for first ${BIFROST_PROBE_LIMIT} packets…`);
      const toProbe = rows.slice(0, BIFROST_PROBE_LIMIT);
      let warmCount = 0;
      for (const row of toProbe) {
        const hash = contentHash(row.summary);
        const warm = hash ? await bifrostCacheStatus(hash) : false;
        bifrostWarm.set(row.packet_key, warm);
        if (warm) warmCount++;
      }
      console.log(`  Bifrost warm: ${warmCount}/${toProbe.length} in probe sample`);
    } else {
      console.log('Bifrost: offline — cache status not probed');
    }

    // ── 3. Build temporal cohort buckets ──────────────────────────────────────
    const cohorts = new Map(); // "YYYY-MM" → packet_key[]
    const indexEntries = [];

    for (const row of rows) {
      const cohort     = isoToCohort(row.created_at?.toISOString?.() ?? '');
      const freshness  = freshnessScore(row.created_at);
      const inBifrost  = bifrostWarm.get(row.packet_key) ?? null; // null = not probed

      const entry = {
        packet_key:         row.packet_key,
        source_ref:         row.source_ref,
        feature_id:         row.feature_id,
        community_id:       row.community_id,
        source_kind:        row.source_kind,
        concept_ids:        row.concept_ids ?? [],
        reward_prior:       row.reward_prior !== null ? Number(row.reward_prior) : 0,
        community_confidence: row.community_confidence !== null ? Number(row.community_confidence) : null,
        freshness_score:    Math.round(freshness * 1000) / 1000,
        cohort,
        bifrost_warm:       inBifrost,
        created_at:         row.created_at?.toISOString?.() ?? null,
        updated_at:         row.updated_at?.toISOString?.() ?? null,
      };

      indexEntries.push(entry);

      if (!cohorts.has(cohort)) cohorts.set(cohort, []);
      cohorts.get(cohort).push(row.packet_key);
    }

    // ── 4. Stats ──────────────────────────────────────────────────────────────
    const cohortList     = [...cohorts.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    const warmTotal      = [...bifrostWarm.values()].filter(Boolean).length;
    const avgFreshness   = indexEntries.reduce((s, e) => s + e.freshness_score, 0) / (indexEntries.length || 1);
    const withReward     = indexEntries.filter(e => e.reward_prior > 0).length;

    console.log(`\nCohorts found: ${cohorts.size}`);
    if (VERBOSE) {
      for (const [month, keys] of cohortList.slice(0, 12)) {
        console.log(`  ${month}: ${keys.length} packets`);
      }
    }
    console.log(`Avg freshness score: ${avgFreshness.toFixed(3)}`);
    console.log(`With reward signal: ${withReward}`);
    console.log(`Bifrost warm (probed): ${warmTotal}/${Math.min(rows.length, BIFROST_PROBE_LIMIT)}`);

    if (DRY_RUN) {
      console.log('\n(dry-run — no writes; run with --apply to apply)');
      writeReport({ mode: 'dry-run', total: rows.length, cohorts: cohorts.size,
                    avgFreshness, withReward, warmTotal, cohortList: cohortList.slice(0, 12).map(([m,k]) => ({ month: m, count: k.length })) });
      return;
    }

    // ── 5. Write ndjson TOC (oldest-first for MapReduce replay) ───────────────
    mkdirSync(NDJSON_DIR, { recursive: true });
    const sortedForNdjson = [...indexEntries].sort((a, b) =>
      (a.created_at ?? '').localeCompare(b.created_at ?? '')
    );
    const ndjsonStream = createWriteStream(NDJSON_FILE, { encoding: 'utf8' });
    for (const entry of sortedForNdjson) {
      ndjsonStream.write(JSON.stringify(entry) + '\n');
    }
    await new Promise((res, rej) => { ndjsonStream.end(); ndjsonStream.on('finish', res); ndjsonStream.on('error', rej); });
    console.log(`\nNdjson TOC written: ${NDJSON_FILE} (${sortedForNdjson.length} entries)`);

    // ── 6. Write Redis sorted set + cohort hashes ─────────────────────────────
    if (redisReady) {
      console.log('Writing Redis temporal sorted set…');
      // Batch zadd in chunks of 500
      const ZADD_BATCH = 500;
      let zaddCount = 0;
      for (let i = 0; i < indexEntries.length; i += ZADD_BATCH) {
        const batch = indexEntries.slice(i, i + ZADD_BATCH);
        const args = [];
        for (const e of batch) {
          const score = e.created_at ? new Date(e.created_at).getTime() / 1000 : 0;
          args.push(score, e.packet_key);
        }
        await redis.zadd(REDIS_ZSET_KEY, ...args);
        zaddCount += batch.length;
      }
      await redis.expire(REDIS_ZSET_KEY, COHORT_TTL_S);
      console.log(`  temporal:packet:zset: ${zaddCount} members`);

      // Cohort hashes
      let cohortCount = 0;
      for (const [month, keys] of cohorts.entries()) {
        const key = `${REDIS_COHORT_PFX}${month}`;
        await redis.set(key, JSON.stringify(keys), 'EX', COHORT_TTL_S);
        cohortCount++;
      }
      console.log(`  temporal:cohort:* keys: ${cohortCount}`);

      // Index metadata
      await redis.hset(REDIS_INDEX_META, {
        built_at:      new Date().toISOString(),
        total_packets: indexEntries.length,
        cohorts:       cohorts.size,
        window_days:   WINDOW_DAYS ?? 'all',
        ndjson_path:   NDJSON_FILE,
      });
      await redis.expire(REDIS_INDEX_META, COHORT_TTL_S);
    }

    // ── 7. Write report ───────────────────────────────────────────────────────
    writeReport({
      mode: 'apply',
      total: indexEntries.length,
      cohorts: cohorts.size,
      avgFreshness,
      withReward,
      warmTotal,
      bifrostProbeLimit: BIFROST_PROBE_LIMIT,
      ndjsonPath: NDJSON_FILE,
      redisWritten: redisReady,
      cohortList: cohortList.slice(0, 24).map(([month, keys]) => ({ month, count: keys.length })),
    });

    console.log('\n✅ Temporal Bitfrost index build complete');
    console.log(`   Ndjson TOC:     ${NDJSON_FILE}`);
    console.log(`   Redis zset:     ${REDIS_ZSET_KEY} (${indexEntries.length} members)`);
    console.log(`   Cohort keys:    ${REDIS_COHORT_PFX}* (${cohorts.size} months)`);
    console.log(`   Report:         docs/reports/temporal-bitfrost-index.json`);

  } finally {
    await pool.end();
    if (redisReady) await redis.quit().catch(() => {});
  }
}

function writeReport(data) {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(
    path.resolve(REPORT_DIR, 'temporal-bitfrost-index.json'),
    JSON.stringify({ generated: new Date().toISOString(), ...data }, null, 2)
  );
}

main().catch(e => { console.error(e); process.exit(1); });
