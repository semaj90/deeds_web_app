#!/usr/bin/env node
/**
 * load-som-packets-to-redis.mjs
 *
 * Reads .opencode/ndjson/cluster-summary.ndjson (MapReduce output) and
 * populates the ace:cluster:* Redis keys consumed by som-packet-store.ts.
 *
 * Key schema (matches som-packet-store.ts):
 *   ace:cluster:<row>:<col>   → SomClusterPacket JSON  (TTL 24h)
 *   ace:cluster:rank          → ZSET score=card_count  (TTL 24h)
 *   ace:cluster:index         → SET of cluster_ids     (TTL 24h)
 *
 * Usage:
 *   node scripts/atlas/load-som-packets-to-redis.mjs            # dry-run
 *   node scripts/atlas/load-som-packets-to-redis.mjs --apply
 *   node scripts/atlas/load-som-packets-to-redis.mjs --apply --docker
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import Redis from 'ioredis';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE_DOCKER = argv.includes('--docker');
const TTL = 86_400; // 24h

// ── Env loader ───────────────────────────────────────────────────────────────

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
const DOCKER_CONTAINER = env.REDIS_CONTAINER || 'legal-ai-valkey';

// ── NDJSON reader ────────────────────────────────────────────────────────────

function readNdjson(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  return lines.map((l, i) => {
    try { return JSON.parse(l); }
    catch (e) { console.warn(`  ⚠️  Line ${i + 1} parse error: ${e.message}`); return null; }
  }).filter(Boolean);
}

// ── RESP serializer for --pipe mode ──────────────────────────────────────────

function toResp(args) {
  let res = `*${args.length}\r\n`;
  for (const arg of args) {
    const s = String(arg);
    res += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
  }
  return res;
}

function dockerExecRedis(...args) {
  return new Promise((resolve, reject) => {
    execFile('docker', [
      'exec', DOCKER_CONTAINER,
      'redis-cli', ...(REDIS_PASS ? ['-a', REDIS_PASS, '--no-auth-warning'] : []),
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
      'redis-cli', ...(REDIS_PASS ? ['-a', REDIS_PASS, '--no-auth-warning'] : []), '--pipe',
    ]);
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', code => {
      if (code !== 0 && !stdout.includes('errors: 0'))
        reject(new Error(`redis-cli --pipe failed (${code}): ${stderr || stdout}`));
      else resolve(stdout);
    });
    child.stdin.write(respData);
    child.stdin.end();
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Load SOM Cluster Packets → Redis ───────────────────');
  console.log(`  Mode:    ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  TTL:     ${TTL}s (24h)`);

  const ndjsonPath = path.join(ROOT, '.opencode', 'ndjson', 'cluster-summary.ndjson');
  if (!fs.existsSync(ndjsonPath)) {
    console.error(`  ❌ Not found: ${ndjsonPath}`);
    console.error('  Run: npm run ndjson:mapreduce');
    process.exit(1);
  }

  const clusters = readNdjson(ndjsonPath);
  console.log(`  Clusters: ${clusters.length}`);

  if (!APPLY) {
    console.log('\n  [DRY-RUN] Sample packet:');
    if (clusters[0]) {
      const s = clusters[0];
      console.log(`    cluster_key: ${s.cluster_key}`);
      console.log(`    card_count:  ${s.card_count}`);
      console.log(`    feature_ids: ${(s.feature_ids || []).join(', ') || '(none)'}`);
    }
    console.log('\n  Use --apply to write to Redis.');
    return;
  }

  // Connect
  let redis = null;
  let useDocker = FORCE_DOCKER;

  if (!useDocker) {
    try {
      redis = new Redis({
        host: REDIS_HOST, port: REDIS_PORT,
        password: REDIS_PASS || undefined,
        family: 4, lazyConnect: true, maxRetriesPerRequest: 1,
        enableOfflineQueue: false, retryStrategy: () => null,
        connectTimeout: 2000,
      });
      redis.on('error', () => {});
      await redis.connect();
      await redis.ping();
      console.log(`  ✅ Redis direct (${REDIS_HOST}:${REDIS_PORT})\n`);
    } catch {
      console.log(`  ⚠️  Direct Redis unavailable → docker exec (${DOCKER_CONTAINER})\n`);
      useDocker = true;
      redis = null;
    }
  } else {
    console.log(`  🐳 Docker mode (${DOCKER_CONTAINER})\n`);
  }

  if (useDocker) {
    const pong = await dockerExecRedis('PING').catch(e => `ERR:${e.message}`);
    if (pong !== 'PONG') {
      console.error(`  ❌ Docker Redis unreachable: ${pong}`);
      process.exit(1);
    }
    console.log(`  ✅ Docker Redis: PING → PONG\n`);
  }

  // Build pipeline commands
  const now = new Date().toISOString();
  const cmds = [];

  for (const c of clusters) {
    const row = c.som_row ?? 0;
    const col = c.som_col ?? 0;
    const clusterId = `${row}:${col}`;
    const packet = {
      cluster_id: clusterId,
      som_row: row,
      som_col: col,
      card_count: c.card_count ?? 0,
      candidate_count: c.candidate_count ?? 0,
      avg_som_dist: c.avg_som_dist ?? null,
      top_keywords: c.top_keywords ?? [],
      top_tags: c.top_tags ?? [],
      card_sample: c.card_sample ?? [],
      feature_ids: c.feature_ids ?? [],
      lane_ids: c.lane_ids ?? [],
      source_refs: c.source_refs ?? [],
      adjacent_clusters: c.adjacent_clusters ?? [],
      created_at: now,
      updated_at: now,
    };

    cmds.push(['SET', `ace:cluster:${row}:${col}`, JSON.stringify(packet), 'EX', String(TTL)]);
    cmds.push(['ZADD', 'ace:cluster:rank', String(packet.card_count), clusterId]);
    cmds.push(['SADD', 'ace:cluster:index', clusterId]);
  }

  cmds.push(['EXPIRE', 'ace:cluster:rank', String(TTL)]);
  cmds.push(['EXPIRE', 'ace:cluster:index', String(TTL)]);

  console.log(`  Executing ${cmds.length} commands...`);

  if (!useDocker && redis) {
    const pipe = redis.pipeline();
    for (const [cmd, ...args] of cmds) pipe[cmd.toLowerCase()](...args);
    await pipe.exec();
  } else {
    const BATCH = 5000;
    for (let i = 0; i < cmds.length; i += BATCH) {
      const chunk = cmds.slice(i, i + BATCH).map(toResp).join('');
      await runDockerPipe(chunk);
      process.stdout.write(`\r  Piped ${Math.min(i + BATCH, cmds.length)}/${cmds.length}`);
    }
    console.log();
  }

  // Verify
  let written, indexed;
  if (!useDocker && redis) {
    written = await redis.zcard('ace:cluster:rank');
    indexed = await redis.scard('ace:cluster:index');
  } else {
    written = await dockerExecRedis('ZCARD', 'ace:cluster:rank');
    indexed = await dockerExecRedis('SCARD', 'ace:cluster:index');
  }

  console.log(`\n  ✅ ace:cluster:rank  → ${written} entries`);
  console.log(`  ✅ ace:cluster:index → ${indexed} entries`);

  const reportPath = path.join(ROOT, 'memory', 'exports', 'som-packets-redis-load.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: now,
    clusters_loaded: clusters.length,
    commands: cmds.length,
    ace_cluster_rank: Number(written),
    ace_cluster_index: Number(indexed),
    ttl_seconds: TTL,
  }, null, 2));
  console.log(`  Report → ${reportPath}`);

  if (redis) await redis.quit();
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
