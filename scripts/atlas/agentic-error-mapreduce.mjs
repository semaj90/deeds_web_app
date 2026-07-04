#!/usr/bin/env node
/**
 * Agentic Error MapReduce
 *
 * Runs every 5 minutes (or on demand). Groups error signals from the last
 * window by (error_class, model_name, task_id), reduces to cluster rows,
 * and warms the BitFrost repair cache.
 *
 * Usage:
 *   node scripts/atlas/agentic-error-mapreduce.mjs [--dry-run] [--window-minutes 5]
 *
 * Hard rules:
 * - Groups by semantic keys (error_class, model_name, task_id) — never raw log text
 * - HMM classification is separate — this script only groups and counts
 * - BitFrost cache: bifrost:repair:{error_class}:{model_name} → cluster JSON
 */

import pg from 'pg';
import Redis from 'ioredis';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    'dry-run':        { type: 'boolean', default: false },
    'window-minutes': { type: 'string',  default: '5' },
    verbose:          { type: 'boolean', default: false },
  },
  strict: false,
});

const DRY_RUN        = args['dry-run'];
const WINDOW_MINUTES = parseInt(args['window-minutes'] ?? '5', 10);
const VERBOSE        = args['verbose'];
const REPAIR_TTL     = 300; // seconds

const pool = new pg.Pool({
  host:     process.env.PGHOST     || '127.0.0.1',
  port:     parseInt(process.env.PGPORT || '5434', 10),
  database: process.env.PGDATABASE || 'legal_ai_db',
  user:     process.env.PGUSER     || 'legal_admin',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || '',
});

const redis = new Redis({
  host:              process.env.REDIS_HOST     || '127.0.0.1',
  port:              parseInt(process.env.REDIS_PORT || '6379', 10),
  password:          process.env.REDIS_PASSWORD || 'redis',
  lazyConnect:       true,
  enableOfflineQueue: false,
  retryStrategy:     () => null,
});

async function mapPhase(windowMinutes) {
  const result = await pool.query(`
    SELECT
      packet_key,
      task_id,
      error_class,
      model_name,
      COUNT(*) AS count
    FROM error_signal_stream
    WHERE ingested_at > NOW() - INTERVAL '${windowMinutes} minutes'
    GROUP BY packet_key, task_id, error_class, model_name
    ORDER BY count DESC
  `);
  return result.rows;
}

function reducePhase(signals) {
  const clusters = new Map();

  for (const sig of signals) {
    const key = `${sig.error_class}:${sig.model_name}:${sig.task_id}`;
    if (!clusters.has(key)) {
      clusters.set(key, {
        error_class: sig.error_class,
        model_name:  sig.model_name,
        task_id:     sig.task_id,
        packet_keys: [],
        count: 0,
      });
    }
    const cluster = clusters.get(key);
    if (!cluster.packet_keys.includes(sig.packet_key)) {
      cluster.packet_keys.push(sig.packet_key);
    }
    cluster.count += parseInt(sig.count, 10);
  }

  return clusters;
}

async function writePhase(clusters) {
  let written = 0;

  for (const [, cluster] of clusters) {
    if (DRY_RUN) {
      if (VERBOSE) {
        console.log(`[dry-run] Would upsert cluster: ${cluster.error_class}:${cluster.model_name}:${cluster.task_id} (${cluster.count} signals, ${cluster.packet_keys.length} packets)`);
      }
      continue;
    }

    await pool.query(`
      INSERT INTO error_cluster_groups
        (error_class, model_name, task_id, packet_keys, failure_count, last_seen)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (error_class, model_name, task_id)
      DO UPDATE SET
        packet_keys   = $4,
        failure_count = $5,
        last_seen     = NOW()
    `, [
      cluster.error_class,
      cluster.model_name,
      cluster.task_id,
      cluster.packet_keys,
      cluster.count,
    ]);

    written++;
  }

  return written;
}

async function warmBitFrost(clusters) {
  if (DRY_RUN) return 0;

  let warmed = 0;
  const pipeline = redis.pipeline();

  for (const [key, cluster] of clusters) {
    const cacheKey = `bifrost:repair:${key}`;
    pipeline.setex(cacheKey, REPAIR_TTL, JSON.stringify({
      packet_keys:   cluster.packet_keys,
      failure_count: cluster.count,
      last_seen:     new Date().toISOString(),
    }));
    warmed++;
  }

  await pipeline.exec();
  return warmed;
}

async function run() {
  console.log(`[mapreduce] Starting error signal grouping (window: ${WINDOW_MINUTES}m, dry-run: ${DRY_RUN})`);

  try {
    await redis.connect();
  } catch {
    console.warn('[mapreduce] Redis unavailable — BitFrost warming skipped');
  }

  try {
    // MAP
    const signals = await mapPhase(WINDOW_MINUTES);
    console.log(`[mapreduce] MAP: ${signals.length} signal rows from last ${WINDOW_MINUTES} minutes`);

    if (!signals.length) {
      console.log('[mapreduce] No signals in window — nothing to reduce');
      return;
    }

    // REDUCE
    const clusters = reducePhase(signals);
    console.log(`[mapreduce] REDUCE: ${clusters.size} clusters`);

    if (VERBOSE) {
      for (const [key, cluster] of clusters) {
        console.log(`  ${key}: ${cluster.count} signals, ${cluster.packet_keys.length} distinct packets`);
      }
    }

    // WRITE clusters to Postgres
    const written = await writePhase(clusters);
    console.log(`[mapreduce] WRITE: ${DRY_RUN ? '(dry-run)' : written} cluster rows upserted`);

    // WARM BitFrost repair cache
    const warmed = await warmBitFrost(clusters);
    console.log(`[mapreduce] WARM: ${DRY_RUN ? '(dry-run)' : warmed} repair cache keys set (TTL ${REPAIR_TTL}s)`);

  } finally {
    await pool.end().catch(() => {});
    if (redis.status === 'ready') await redis.quit().catch(() => {});
  }
}

run().catch((err) => {
  console.error('[mapreduce] Fatal:', err.message);
  process.exit(1);
});
