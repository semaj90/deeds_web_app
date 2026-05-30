#!/usr/bin/env node
/**
 * load-parent-atlas-to-redis.mjs
 *
 * Warm Redis cache with parent atlas index for Bitfrost L2 semantic reranking.
 *
 * Cache keys produced (24h TTL by default):
 *   atlas:parent:node:{lane}:{node_id}         → JSON node row
 *   atlas:parent:lane:{lane}                   → JSON lane summary
 *   atlas:parent:cluster:{som_row}:{som_col}   → JSON cluster summary
 *   atlas:parent:cluster:rank                  → ZSET (score=card_count, member=row:col)
 *   atlas:parent:degree:rank                   → ZSET (score=degree, member=lane:node_id)
 *   atlas:parent:meta                          → HASH with build metadata
 *
 * Reads from .tmp/ingest/parent_atlas_full.parquet via DuckDB CLI.
 *
 * Usage:
 *   node scripts/atlas/load-parent-atlas-to-redis.mjs --apply
 *   node scripts/atlas/load-parent-atlas-to-redis.mjs --apply --ttl 3600
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const ttlIdx = argv.indexOf('--ttl');
const TTL = ttlIdx >= 0 ? parseInt(argv[ttlIdx + 1], 10) : 86400; // 24h default

// ─── Env Loader ──────────────────────────────────────────────────────────

function loadEnv() {
  const env = { ...process.env };
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

const env = loadEnv();
const REDIS_HOST = env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(env.REDIS_PORT || '6379', 10);
const REDIS_PASS = env.REDIS_PASSWORD || env.REDIS_PASS || '';

// ─── Parquet Reader (file-based, Windows-safe) ───────────────────────────

function parquetToJSON(parquetPath) {
  const tmpJson = parquetPath + '.tmp.json';
  const pq = parquetPath.replace(/\\/g, '/');
  const tj = tmpJson.replace(/\\/g, '/');
  const r = spawnSync('duckdb', [
    '-c',
    `COPY (SELECT * FROM read_parquet('${pq}')) TO '${tj}' (FORMAT JSON, ARRAY TRUE);`,
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`duckdb failed: ${r.stderr || r.stdout}`);
  const data = JSON.parse(fs.readFileSync(tmpJson, 'utf8'));
  fs.unlinkSync(tmpJson);
  return data;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Load Parent Atlas → Redis ──────────────────────────');
  console.log(`  Redis: ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`  TTL:   ${TTL}s (${(TTL / 3600).toFixed(1)}h)`);
  console.log(`  Mode:  ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  if (!APPLY) {
    console.log('\n  [DRY-RUN] Use --apply to write to Redis.');
    return;
  }

  // ioredis cold-start safe config (per ioredis-coldstart-pattern memory)
  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASS || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {}); // silence reconnect spam

  try {
    await redis.connect();
    await redis.ping();
    console.log('  ✅ Redis connected\n');
  } catch (e) {
    console.error('  ❌ Redis unreachable:', e.message);
    redis.disconnect();
    process.exit(1);
  }

  // Load parquet artifacts
  console.log('  Step 1: Read parquet via DuckDB...');
  const nodes = parquetToJSON(path.join(ROOT, '.tmp', 'ingest', 'parent_atlas_full.parquet'));
  const lanes = parquetToJSON(path.join(ROOT, '.tmp', 'ingest', 'lane_summary.parquet'));
  const clusters = parquetToJSON(path.join(ROOT, '.tmp', 'ingest', 'cluster_summary.parquet'));
  console.log(`  ✅ Loaded ${nodes.length} nodes, ${lanes.length} lanes, ${clusters.length} clusters\n`);

  // Step 2: Pipeline node writes
  console.log('  Step 2: Pipeline node writes...');
  const BATCH = 1000;
  let written = 0;
  for (let i = 0; i < nodes.length; i += BATCH) {
    const slice = nodes.slice(i, i + BATCH);
    const pipe = redis.pipeline();
    for (const n of slice) {
      const key = `atlas:parent:node:${n.lane}:${n.node_id}`;
      pipe.set(key, JSON.stringify(n), 'EX', TTL);
      // Degree ZSET for top-K queries
      if (n.degree && n.degree > 0) {
        pipe.zadd('atlas:parent:degree:rank', n.degree, `${n.lane}:${n.node_id}`);
      }
    }
    await pipe.exec();
    written += slice.length;
    if (VERBOSE) console.log(`    ...batch ${i / BATCH + 1}: ${written}/${nodes.length}`);
  }
  await redis.expire('atlas:parent:degree:rank', TTL);
  console.log(`  ✅ Wrote ${written} nodes + degree ZSET\n`);

  // Step 3: Lane summaries
  console.log('  Step 3: Write lane summaries...');
  const lanePipe = redis.pipeline();
  for (const l of lanes) {
    lanePipe.set(`atlas:parent:lane:${l.lane}`, JSON.stringify(l), 'EX', TTL);
  }
  await lanePipe.exec();
  console.log(`  ✅ Wrote ${lanes.length} lane summaries\n`);

  // Step 4: Cluster summaries + heat ZSET
  console.log('  Step 4: Write cluster summaries + heat ZSET...');
  const clusterPipe = redis.pipeline();
  for (const c of clusters) {
    const key = `atlas:parent:cluster:${c.som_row}:${c.som_col}`;
    clusterPipe.set(key, JSON.stringify(c), 'EX', TTL);
    clusterPipe.zadd('atlas:parent:cluster:rank', Number(c.card_count) || 0, `${c.som_row}:${c.som_col}`);
  }
  await clusterPipe.exec();
  await redis.expire('atlas:parent:cluster:rank', TTL);
  console.log(`  ✅ Wrote ${clusters.length} clusters + heat ZSET\n`);

  // Step 5: Meta
  console.log('  Step 5: Write build metadata...');
  await redis.hset('atlas:parent:meta', {
    built_at: new Date().toISOString(),
    total_nodes: nodes.length,
    total_lanes: lanes.length,
    total_clusters: clusters.length,
    ttl_seconds: TTL,
    source: 'parent_atlas_full.parquet',
  });
  await redis.expire('atlas:parent:meta', TTL);
  console.log('  ✅ Metadata written\n');

  // Step 6: Quick sanity check
  console.log('  Step 6: Sanity check...');
  const topClusters = await redis.zrevrange('atlas:parent:cluster:rank', 0, 4, 'WITHSCORES');
  console.log('  Top 5 hottest SOM clusters (by card_count):');
  for (let i = 0; i < topClusters.length; i += 2) {
    console.log(`    ${topClusters[i].padEnd(8)} → ${topClusters[i + 1]} cards`);
  }

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    redis: `${REDIS_HOST}:${REDIS_PORT}`,
    ttl_seconds: TTL,
    written: {
      nodes: written,
      lanes: lanes.length,
      clusters: clusters.length,
    },
    zsets: ['atlas:parent:degree:rank', 'atlas:parent:cluster:rank'],
    meta_key: 'atlas:parent:meta',
  };
  const reportPath = path.join(ROOT, 'memory', 'exports', 'parent-atlas-redis-warmup.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n  ✅ Report → ${reportPath}`);

  await redis.quit();
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
