#!/usr/bin/env node
/**
 * project-valkey-centroid-prefill.mjs
 *
 * NE-28 (openspec/changes/parent-atlas-neural-prefill-encoder): populate the
 * Valkey centroid/SOM working-set entries only through a bounded projection
 * script with dry-run and readback modes.
 *
 * This is a bounded CLI wrapper around the existing centroid owner, not a
 * second one: it reads `gpu_cluster_centroids` (Postgres, the same table
 * `src/lib/server/retrieval/centroid-cache.ts::loadCentroidsFromDB` reads)
 * and writes the same Redis key scheme that module already owns:
 *   taxonomy:clusters:gpu:<clusterId>   (from `centroidKey.cluster`)
 *   taxonomy:clusters:som:<x>:<y>       (from `centroidKey.som`, when SOM rows exist)
 *
 * No canonical identity or source data (Postgres) is ever mutated by this
 * script — it only ever reads Postgres and writes/reads the Redis mirror.
 *
 * Usage:
 *   node scripts/atlas/project-valkey-centroid-prefill.mjs                # dry-run (default)
 *   node scripts/atlas/project-valkey-centroid-prefill.mjs --apply        # write to Redis
 *   node scripts/atlas/project-valkey-centroid-prefill.mjs --apply --readback  # write + verify round-trip
 *   node scripts/atlas/project-valkey-centroid-prefill.mjs --readback-only     # verify existing keys only, no writes
 *   node scripts/atlas/project-valkey-centroid-prefill.mjs --cluster-type=som --limit=50
 *
 * Exit codes: 0 = success (incl. clean dry-run), 2 = Postgres error, 3 = Redis error, 4 = readback mismatch
 */

import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import pg from 'pg';
import Redis from 'ioredis';
import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv(resolve('.'));

const ROOT = resolve('.');
const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const TTL_SECONDS = 6 * 60 * 60; // matches TTL.CENTROID in cache-keys.ts

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const READBACK = args.includes('--readback') || args.includes('--readback-only');
const READBACK_ONLY = args.includes('--readback-only');
const CLUSTER_TYPE = (args.find((a) => a.startsWith('--cluster-type=')) || '').split('=')[1] || 'gpu';
const LIMIT = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0) || null;

function centroidClusterKey(clusterId) {
  return `taxonomy:clusters:gpu:${clusterId}`;
}
function centroidSomKey(x, y) {
  return `taxonomy:clusters:som:${x}:${y}`;
}

async function loadRowsFromPostgres() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const limitClause = LIMIT ? 'LIMIT $2' : '';
    const params = LIMIT ? [CLUSTER_TYPE, LIMIT] : [CLUSTER_TYPE];
    const { rows } = await pool.query(
      `SELECT cluster_id, cluster_type, centroid_vec, topo_class, topo_byte, chunk_count, updated_at
         FROM gpu_cluster_centroids
        WHERE cluster_type = $1
        ORDER BY cluster_id
        ${limitClause}`,
      params,
    );
    return rows;
  } finally {
    await pool.end();
  }
}

function redisPassword() {
  return process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';
}

function connectRedis() {
  return new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: redisPassword(),
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
}

async function main() {
  const report = {
    schema: 'atlas.ne28-centroid-prefill-projection-report.v1',
    mode: READBACK_ONLY ? 'READBACK_ONLY' : APPLY ? (READBACK ? 'APPLY_WITH_READBACK' : 'APPLY') : 'DRY_RUN',
    clusterType: CLUSTER_TYPE,
    limit: LIMIT,
    startedAt: new Date().toISOString(),
    rowsRead: 0,
    keysWritten: 0,
    keysVerified: 0,
    mismatches: [],
    errors: [],
  };

  let rows = [];
  if (!READBACK_ONLY) {
    try {
      rows = await loadRowsFromPostgres();
      report.rowsRead = rows.length;
    } catch (err) {
      report.errors.push(`postgres: ${err.message}`);
      writeReport(report);
      console.error(`Postgres read failed: ${err.message}`);
      process.exit(2);
    }
  }

  console.log(`[NE-28] mode=${report.mode} clusterType=${CLUSTER_TYPE} rows=${rows.length}`);

  if (!APPLY && !READBACK_ONLY) {
    for (const row of rows) {
      const key = row.cluster_type === 'som' ? centroidSomKey(row.cluster_id, 0) : centroidClusterKey(row.cluster_id);
      console.log(`  DRY_RUN would write ${key} (dim=${row.centroid_vec?.length ?? 0}, chunkCount=${row.chunk_count})`);
    }
    report.finishedAt = new Date().toISOString();
    writeReport(report);
    console.log(`[NE-28] dry-run complete: ${rows.length} rows would be projected, 0 Redis writes performed.`);
    return;
  }

  const redis = connectRedis();
  try {
    await redis.connect();
    await redis.ping();
  } catch (err) {
    report.errors.push(`redis: ${err.message}`);
    writeReport(report);
    console.error(`Redis connection failed: ${err.message}`);
    process.exit(3);
  }

  try {
    if (APPLY) {
      const pipe = redis.pipeline();
      const written = [];
      for (const row of rows) {
        const key = row.cluster_type === 'som' ? centroidSomKey(row.cluster_id, 0) : centroidClusterKey(row.cluster_id);
        const payload = JSON.stringify({
          vector: row.centroid_vec,
          topoClass: row.topo_class,
          topoByte: row.topo_byte,
        });
        pipe.setex(key, TTL_SECONDS, payload);
        written.push({ key, row });
      }
      await pipe.exec();
      report.keysWritten = written.length;
      console.log(`[NE-28] wrote ${written.length} centroid keys to Redis (TTL=${TTL_SECONDS}s).`);

      if (READBACK) {
        for (const { key, row } of written) {
          const raw = await redis.get(key);
          if (!raw) {
            report.mismatches.push({ key, reason: 'MISSING_AFTER_WRITE' });
            continue;
          }
          const parsed = JSON.parse(raw);
          const expectedDim = row.centroid_vec?.length ?? 0;
          const actualDim = Array.isArray(parsed.vector) ? parsed.vector.length : 0;
          if (actualDim !== expectedDim) {
            report.mismatches.push({ key, reason: 'DIMENSION_MISMATCH', expectedDim, actualDim });
            continue;
          }
          report.keysVerified++;
        }
      }
    } else if (READBACK_ONLY) {
      const keys = await redis.keys(CLUSTER_TYPE === 'som' ? 'taxonomy:clusters:som:*' : 'taxonomy:clusters:gpu:*');
      for (const key of keys) {
        const raw = await redis.get(key);
        if (!raw) {
          report.mismatches.push({ key, reason: 'KEY_LISTED_BUT_UNREADABLE' });
          continue;
        }
        try {
          JSON.parse(raw);
          report.keysVerified++;
        } catch {
          report.mismatches.push({ key, reason: 'UNPARSEABLE_PAYLOAD' });
        }
      }
      report.rowsRead = keys.length;
    }
  } finally {
    await redis.quit();
  }

  report.finishedAt = new Date().toISOString();
  writeReport(report);

  if (report.mismatches.length > 0) {
    console.error(`[NE-28] readback found ${report.mismatches.length} mismatch(es).`);
    process.exit(4);
  }
  console.log(
    `[NE-28] complete: ${report.keysWritten} written, ${report.keysVerified} readback-verified, 0 mismatches.`,
  );
}

function writeReport(report) {
  const outDir = resolve(ROOT, 'docs/reports');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'ne28-centroid-prefill-projection.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`[NE-28] report written to ${outPath}`);
}

main().catch((err) => {
  console.error(`[NE-28] fatal: ${err.stack || err.message}`);
  process.exit(1);
});
