#!/usr/bin/env node
/**
 * auto-train-lane-router.mjs
 *
 * Online learning scheduler for the Tier-1 lane router.
 * Watches chunk_hit_log for new rows with rerank_score and retriggers
 * kb:lane-router:full when enough data has accumulated.
 *
 * Uses a Redis watermark (lane:router:train:watermark_ts) to track when
 * the last training run happened and how many rows it covered.
 *
 * Run modes:
 *   one-shot   (default)  — check once, train if threshold met, exit
 *   --watch               — loop forever with --interval-s sleep between checks
 *   --force               — train immediately ignoring thresholds
 *
 * Usage:
 *   node scripts/kb/auto-train-lane-router.mjs
 *   node scripts/kb/auto-train-lane-router.mjs --min-rows 20
 *   node scripts/kb/auto-train-lane-router.mjs --watch --interval-s 300
 *   node scripts/kb/auto-train-lane-router.mjs --force
 *   node scripts/kb/auto-train-lane-router.mjs --dry-run
 *
 * Wired into startup by ace-incremental-startup.mjs heavy lane when:
 *   ace:lane:router:new_rerank_hits counter >= MIN_ROWS
 */

import pg             from 'pg';
import Redis          from 'ioredis';
import { execSync }   from 'node:child_process';
import path           from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir  = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__dir, '../..');

// ── Args ─────────────────────────────────────────────────────────────────────
const argv        = process.argv.slice(2);
const DRY_RUN     = argv.includes('--dry-run');
const WATCH       = argv.includes('--watch');
const FORCE       = argv.includes('--force');
const MIN_I       = argv.indexOf('--min-rows');
const MIN_ROWS    = MIN_I >= 0 ? Number(argv[MIN_I + 1]) : 30;
const INT_I       = argv.indexOf('--interval-s');
const INTERVAL_S  = INT_I >= 0 ? Number(argv[INT_I + 1]) : 300; // 5 min default

const DB_URL    = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL    ?? 'redis://localhost:6379';

const WATERMARK_KEY  = 'lane:router:train:watermark_ts';   // ISO timestamp of last train
const ROWS_SINCE_KEY = 'lane:router:train:rows_at_last';   // row count at last train
const STATUS_KEY     = 'lane:router:train:status';         // 'idle'|'training'|'error'
const TRAIN_TTL      = 86400;                              // 24h — matches policy TTL

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function run(cmd, label) {
  console.log(`[auto-train] ▶ ${label}`);
  if (DRY_RUN) { console.log(`[auto-train]   DRY: would run: ${cmd}`); return; }
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    if (out.trim()) console.log(out.trim().split('\n').map(l => `[auto-train]   ${l}`).join('\n'));
  } catch (err) {
    const msg = (err.stdout ?? '') + (err.stderr ?? '');
    console.error(`[auto-train] ✗ ${label} failed:\n${msg.slice(0, 800)}`);
    throw err;
  }
}

// ── DB: count new rerank_score rows since last training ───────────────────────
async function countNewRows(pool, sinceTs) {
  const where = sinceTs
    ? `WHERE rerank_score IS NOT NULL AND hit_at > $1`
    : `WHERE rerank_score IS NOT NULL`;
  const params = sinceTs ? [sinceTs] : [];
  const { rows: [{ n }] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM chunk_hit_log ${where}`, params
  );
  return n;
}

async function totalRows(pool) {
  const { rows: [{ n }] } = await pool.query(`SELECT COUNT(*)::int AS n FROM chunk_hit_log`);
  return n;
}

// ── Main check-and-train cycle ────────────────────────────────────────────────
async function checkAndTrain(pool, redis) {
  // Read watermark
  const lastTsRaw = await redis.get(WATERMARK_KEY).catch(() => null);
  const lastTs    = lastTsRaw ?? null;

  const newRows = await countNewRows(pool, lastTs);
  const total   = await totalRows(pool);

  console.log(`[auto-train] chunk_hit_log: ${total} total  /  ${newRows} new rerank_score rows since ${lastTs ?? 'epoch'}`);

  if (!FORCE && newRows < MIN_ROWS) {
    console.log(`[auto-train] Threshold not met (${newRows} < ${MIN_ROWS}) — skipping training`);
    return false;
  }

  if (FORCE) console.log('[auto-train] --force flag: training regardless of row count');

  // Mark as training
  await redis.set(STATUS_KEY, 'training', 'EX', 600).catch(() => {});

  const trainStart = Date.now();
  const nowTs      = new Date().toISOString();

  try {
    // Run full pipeline: export → train → evaluate
    run(`node ${path.join('sveltekit-frontend/scripts/kb/export-lane-router-training-set.mjs')}`, 'export training set');
    run(`node ${path.join('sveltekit-frontend/scripts/kb/train-lane-router.mjs')}`, 'train lane router');
    run(`node ${path.join('sveltekit-frontend/scripts/kb/eval-lane-router-policy.mjs')}`, 'evaluate policy');

    // Update watermark
    const elapsed = ((Date.now() - trainStart) / 1000).toFixed(1);
    if (!DRY_RUN) {
      const pipe = redis.pipeline();
      pipe.set(WATERMARK_KEY, nowTs, 'EX', TRAIN_TTL * 7); // keep 7 days
      pipe.set(ROWS_SINCE_KEY, String(total), 'EX', TRAIN_TTL * 7);
      pipe.set(STATUS_KEY, 'idle', 'EX', TRAIN_TTL);
      await pipe.exec();
    }
    console.log(`[auto-train] ✅ Training complete in ${elapsed}s`);
    return true;
  } catch (err) {
    await redis.set(STATUS_KEY, 'error', 'EX', 3600).catch(() => {});
    console.error(`[auto-train] ✗ Training pipeline failed: ${err.message}`);
    return false;
  }
}

// ── Entry point ──────────────────────────────────────────────────────────────
async function main() {
  console.log(`[auto-train] Lane router auto-trainer — min-rows=${MIN_ROWS}, watch=${WATCH}, force=${FORCE}, dry=${DRY_RUN}`);

  const pool = new pg.Pool({ connectionString: DB_URL, max: 2, idleTimeoutMillis: 5000 });
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true, maxRetriesPerRequest: 1,
    enableOfflineQueue: false, retryStrategy: () => null,
  });
  redis.on('error', () => {});

  let dbOk    = false;
  let redisOk = false;

  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch (err) {
    console.warn(`[auto-train] Postgres unavailable: ${err.message}`);
  }
  try {
    await redis.connect();
    await redis.ping();
    redisOk = true;
  } catch {
    console.warn('[auto-train] Redis unavailable — watermark disabled');
  }

  if (!dbOk) {
    console.error('[auto-train] Cannot continue without Postgres');
    await pool.end();
    redis.disconnect();
    process.exit(1);
  }

  if (WATCH) {
    console.log(`[auto-train] Watch mode — checking every ${INTERVAL_S}s`);
    let tick = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      tick++;
      console.log(`\n[auto-train] ── Tick ${tick} ── ${new Date().toISOString()}`);
      try {
        await checkAndTrain(pool, redis);
      } catch { /* already logged */ }
      console.log(`[auto-train] Next check in ${INTERVAL_S}s`);
      await sleep(INTERVAL_S * 1000);
    }
  } else {
    const trained = await checkAndTrain(pool, redis);
    await pool.end();
    redis.disconnect();
    process.exit(trained || DRY_RUN ? 0 : 2); // exit 2 = threshold not met (not an error)
  }
}

main().catch(err => {
  console.error('[auto-train]', err.message);
  process.exit(1);
});