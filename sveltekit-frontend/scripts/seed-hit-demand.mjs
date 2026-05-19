#!/usr/bin/env node
/**
 * seed-hit-demand.mjs
 *
 * Aggregates `chunk_hit_log` (Postgres) into a Redis hot-rank hash so the
 * atlas context_for_file rank can include a real-time demand signal.
 *
 * What it writes:
 *   Redis HASH  ace:rank:demand   (TTL 1h)
 *     field = relative_path (atlas-normalized, no src/ prefix)
 *     value = JSON { hits, hot_score, last_hit_at, avg_rerank }
 *
 *   Redis KEY   ace:rank:demand:meta  (TTL 1h)
 *     value = JSON { window_hours, total_files, total_hits, generated_at }
 *
 * Strategy: pull the last N hours from chunk_hit_log, group by relative_path,
 * compute hot_score = hits × avg(coalesce(rerank_score, score, 0.5)).
 * Idempotent — re-run replaces the hash atomically.
 *
 * Usage:
 *   node scripts/seed-hit-demand.mjs                  # 24h window, --apply
 *   node scripts/seed-hit-demand.mjs --dry-run        # preview only
 *   node scripts/seed-hit-demand.mjs --hours=48       # wider window
 */
import pg from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

// Retry pg.Client.connect() when Postgres is still initializing (error code
// 57P03 "the database system is starting up" or ECONNREFUSED on Docker start).
async function connectWithRetry(client, { maxAttempts = 8, delayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.connect();
      return;
    } catch (err) {
      const isStarting = err.code === '57P03' || /starting up|ECONNREFUSED/.test(err.message);
      if (!isStarting || attempt === maxAttempts) throw err;
      console.log(`   pg not ready (attempt ${attempt}/${maxAttempts}) — retrying in ${delayMs}ms…`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

const args  = process.argv.slice(2);
const DRY   = args.includes('--dry-run');
const HOURS = parseInt(
  args.find(a => a.startsWith('--hours='))?.split('=')[1] ??
  (args.includes('--hours') ? args[args.indexOf('--hours') + 1] : '24'),
  10,
) || 24;

const DB_URL    = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
if (!DB_URL) { console.error('❌ DATABASE_URL not set'); process.exit(1); }

const HASH_KEY = 'ace:rank:demand';
const META_KEY = 'ace:rank:demand:meta';
const TTL      = 3600; // 1 hour — refresh on each cron tick

console.log(`\n🔥 Hit-demand seeder${DRY ? ' [DRY]' : ''} — window=${HOURS}h\n`);

function normalizePath(p) {
  return String(p ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/^src\//, '');
}

async function main() {
  const pgClient = new pg.Client({ connectionString: DB_URL });
  await connectWithRetry(pgClient);

  // ── Adaptive guard: watermark on chunk_hit_log.id ─────────────────────────
  // The 24h rolling window means rows fall off the back as new ones land, so
  // we can't be incremental on the AGGREGATE itself. But we CAN be adaptive
  // on the trigger: if max(id) hasn't moved since last seeded, no new hits
  // landed → the cached Redis hash is still authoritative for the window's
  // shape. Skip the DEL+HSET cycle entirely. The Redis TTL keeps it correct.
  const { rows: [{ max_id }] } = await pgClient.query(
    'SELECT coalesce(max(id), 0)::text AS max_id FROM chunk_hit_log',
  );
  const currentMax = parseInt(max_id, 10) || 0;
  const probeRedis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
  await probeRedis.connect().catch(() => {});
  const lastWaterMark = parseInt((await probeRedis.get(`${META_KEY}:water`).catch(() => null)) ?? '0', 10);
  const force = process.argv.includes('--force');
  if (!DRY && !force && currentMax > 0 && currentMax <= lastWaterMark) {
    console.log(`   no new chunk_hit_log rows since last run (max_id=${currentMax} ≤ watermark=${lastWaterMark})`);
    console.log(`   Redis hash kept (TTL self-evicts stale 24h window). Pass --force to rebuild anyway.`);
    await probeRedis.quit();
    await pgClient.end();
    return;
  }
  await probeRedis.quit();

  const { rows } = await pgClient.query(
    `SELECT relative_path,
            count(*)                                            AS hits,
            avg(coalesce(rerank_score, score, 0.5))::real       AS avg_rerank,
            max(hit_at)                                         AS last_hit_at
       FROM chunk_hit_log
      WHERE hit_at > now() - ($1 || ' hours')::interval
        AND relative_path IS NOT NULL
      GROUP BY relative_path`,
    [String(HOURS)],
  );

  if (rows.length === 0) {
    console.log(`   no hits in last ${HOURS}h — nothing to seed`);
    console.log(`   (chunk_hit_log will populate as ACE retrievals fire — this is fine for cold dev)`);
    await pgClient.end();
    return;
  }

  console.log(`   ${rows.length} unique files hit in last ${HOURS}h`);
  const totalHits = rows.reduce((s, r) => s + Number(r.hits), 0);
  console.log(`   ${totalHits} total hits`);

  // Build the hash payload
  const payload = {};
  let topByHotScore = null;
  for (const r of rows) {
    const norm     = normalizePath(r.relative_path);
    const hits     = Number(r.hits) || 0;
    const avg      = Number(r.avg_rerank) || 0.5;
    const hotScore = hits * avg;
    payload[norm] = JSON.stringify({
      hits,
      hot_score:   +hotScore.toFixed(4),
      avg_rerank:  +avg.toFixed(4),
      last_hit_at: r.last_hit_at?.toISOString?.() ?? null,
    });
    if (!topByHotScore || hotScore > topByHotScore.hot) {
      topByHotScore = { path: norm, hot: hotScore, hits };
    }
  }

  if (DRY) {
    console.log('\n   [dry] would set:');
    console.log(`     HASH ${HASH_KEY} (${Object.keys(payload).length} fields, TTL ${TTL}s)`);
    console.log(`     KEY  ${META_KEY} (meta, TTL ${TTL}s)`);
    if (topByHotScore) console.log(`     top:  ${topByHotScore.path} (${topByHotScore.hits} hits, hot=${topByHotScore.hot.toFixed(2)})`);
    await pgClient.end();
    return;
  }

  const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
  await redis.connect();

  // Atomic replace: DEL old hash, write new entries, set TTL, write meta.
  // Using pipeline for fewer round-trips on big payloads.
  // Also persists the high-water mark so the next run can early-exit if
  // chunk_hit_log hasn't grown.
  const pipe = redis.pipeline();
  pipe.del(HASH_KEY);
  if (Object.keys(payload).length > 0) pipe.hset(HASH_KEY, payload);
  pipe.expire(HASH_KEY, TTL);
  pipe.set(`${META_KEY}:water`, String(currentMax), 'EX', 86400);
  pipe.set(
    META_KEY,
    JSON.stringify({
      window_hours: HOURS,
      total_files:  Object.keys(payload).length,
      total_hits:   totalHits,
      top:          topByHotScore,
      high_water:   currentMax,
      generated_at: new Date().toISOString(),
    }),
    'EX', TTL,
  );
  await pipe.exec();

  console.log(`\n   ✅ wrote ${HASH_KEY} (${Object.keys(payload).length} fields, TTL ${TTL}s)`);
  if (topByHotScore) console.log(`   top: ${topByHotScore.path} — ${topByHotScore.hits} hits, hot=${topByHotScore.hot.toFixed(2)}`);

  await redis.quit();
  await pgClient.end();
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
