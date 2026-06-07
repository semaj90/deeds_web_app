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
const TTL = ttlIdx >= 0 ? parseInt(argv[ttlIdx + 1], 10) : 604800; // 7 days default

// ─── Env Loader ──────────────────────────────────────────────────────────

function loadEnv() {
  const env = { ...process.env };
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
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

  const DOCKER_CONTAINER = env.REDIS_CONTAINER ?? 'legal-ai-valkey';
  const FORCE_DOCKER = argv.includes('--docker');
  let useDocker = FORCE_DOCKER;

  async function probeDirectRedis() {
    const r = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASS || undefined,
      family: 4,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
      connectTimeout: 2000,
    });
    r.on('error', () => {});
    await r.connect();
    await r.ping();
    return r;
  }

  let redis = null;
  if (!useDocker) {
    try {
      redis = await probeDirectRedis();
      console.log(`  ✅ Redis connected directly (${REDIS_HOST}:${REDIS_PORT})\n`);
    } catch {
      console.log(`  ⚠️  Direct Redis unreachable — using docker exec proxy (container: ${DOCKER_CONTAINER})\n`);
      useDocker = true;
    }
  } else {
    console.log(`  🐳 Force Docker mode — using docker exec proxy (container: ${DOCKER_CONTAINER})\n`);
  }

  // Thin wrapper: route commands through docker exec redis-cli
  const { execFile, spawn } = await import('node:child_process');
  function dockerExecRedis(...args) {
    return new Promise((resolve, reject) => {
      execFile('docker', [
        'exec', DOCKER_CONTAINER,
        'redis-cli', '-a', REDIS_PASS, '--no-auth-warning',
        ...args,
      ], { timeout: 5000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.trim() || err.message));
        else resolve(stdout.trim());
      });
    });
  }

  function runDockerPipe(respData) {
    return new Promise((resolve, reject) => {
      const child = spawn('docker', [
        'exec', '-i', DOCKER_CONTAINER,
        'redis-cli', '-a', REDIS_PASS, '--no-auth-warning', '--pipe'
      ]);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (code) => {
        if (code !== 0 && !stdout.includes('errors: 0')) {
          reject(new Error(`redis-cli --pipe failed (code ${code}): ${stderr || stdout}`));
        } else {
          resolve(stdout);
        }
      });
      child.stdin.write(respData);
      child.stdin.end();
    });
  }

  function toResp(args) {
    let res = `*${args.length}\r\n`;
    for (const arg of args) {
      const s = String(arg);
      res += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
    }
    return res;
  }

  async function executePipeline(commands) {
    if (!useDocker && redis) {
      const pipe = redis.pipeline();
      for (const [cmd, ...args] of commands) {
        pipe[cmd.toLowerCase()](...args);
      }
      return pipe.exec();
    } else {
      console.log(`    Piping ${commands.length} commands to docker container ${DOCKER_CONTAINER}...`);
      const BATCH_SIZE = 5000;
      for (let i = 0; i < commands.length; i += BATCH_SIZE) {
        const batch = commands.slice(i, i + BATCH_SIZE);
        const chunk = batch.map(toResp).join('');
        await runDockerPipe(chunk);
      }
    }
  }

  // Verify the fallback works
  if (useDocker) {
    try {
      const pong = await dockerExecRedis('PING');
      if (pong !== 'PONG') throw new Error(`unexpected: ${pong}`);
      console.log(`  ✅ Redis via docker exec: PING → PONG\n`);
    } catch (e) {
      console.error('  ❌ Redis unreachable via docker exec:', e.message);
      process.exit(1);
    }
  }

  // Load parquet artifacts
  console.log('  Step 1: Read parquet via DuckDB...');
  const nodes = parquetToJSON(path.join(ROOT, '.tmp', 'ingest', 'parent_atlas_full.parquet'));
  const lanes = parquetToJSON(path.join(ROOT, '.tmp', 'ingest', 'lane_summary.parquet'));
  const clusters = parquetToJSON(path.join(ROOT, '.tmp', 'ingest', 'cluster_summary.parquet'));
  console.log(`  ✅ Loaded ${nodes.length} nodes, ${lanes.length} lanes, ${clusters.length} clusters\n`);

  const pipelineCommands = [];

  // Step 2: Queue node writes
  console.log('  Step 2: Queue node writes...');
  for (const n of nodes) {
    const key = `atlas:parent:node:${n.lane}:${n.node_id}`;
    pipelineCommands.push(['SET', key, JSON.stringify(n), 'EX', String(TTL)]);
    if (n.degree && n.degree > 0) {
      pipelineCommands.push(['ZADD', 'atlas:parent:degree:rank', String(n.degree), `${n.lane}:${n.node_id}`]);
    }
  }
  pipelineCommands.push(['EXPIRE', 'atlas:parent:degree:rank', String(TTL)]);

  // Step 3: Lane summaries
  console.log('  Step 3: Queue lane summaries...');
  for (const l of lanes) {
    pipelineCommands.push(['SET', `atlas:parent:lane:${l.lane}`, JSON.stringify(l), 'EX', String(TTL)]);
  }

  // Step 4: Cluster summaries + heat ZSET
  console.log('  Step 4: Queue cluster summaries + heat ZSET...');
  for (const c of clusters) {
    const key = `atlas:parent:cluster:${c.som_row}:${c.som_col}`;
    pipelineCommands.push(['SET', key, JSON.stringify(c), 'EX', String(TTL)]);
    pipelineCommands.push(['ZADD', 'atlas:parent:cluster:rank', String(Number(c.card_count) || 0), `${c.som_row}:${c.som_col}`]);
  }
  pipelineCommands.push(['EXPIRE', 'atlas:parent:cluster:rank', String(TTL)]);

  // Step 5: Meta
  console.log('  Step 5: Queue build metadata...');
  pipelineCommands.push(['HSET', 'atlas:parent:meta',
    'built_at', new Date().toISOString(),
    'total_nodes', String(nodes.length),
    'total_lanes', String(lanes.length),
    'total_clusters', String(clusters.length),
    'ttl_seconds', String(TTL),
    'source', 'parent_atlas_full.parquet',
  ]);
  pipelineCommands.push(['EXPIRE', 'atlas:parent:meta', String(TTL)]);

  console.log('  Step 6: Executing integration pipeline...');
  await executePipeline(pipelineCommands);
  console.log('  ✅ Pipeline executed successfully\n');

  // Step 7: Quick sanity check
  console.log('  Step 7: Sanity check...');
  const topClustersRaw = useDocker
    ? (await dockerExecRedis('ZREVRANGE', 'atlas:parent:cluster:rank', '0', '4', 'WITHSCORES')).split(/\r?\n/)
    : await redis.zrevrange('atlas:parent:cluster:rank', 0, 4, 'WITHSCORES');

  console.log('  Top 5 hottest SOM clusters (by card_count):');
  for (let i = 0; i < topClustersRaw.length; i += 2) {
    console.log(`    ${topClustersRaw[i].padEnd(8)} → ${topClustersRaw[i + 1]} cards`);
  }

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    redis: `${REDIS_HOST}:${REDIS_PORT}`,
    ttl_seconds: TTL,
    written: {
      nodes: nodes.length,
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

  if (redis) {
    await redis.quit();
  }
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
