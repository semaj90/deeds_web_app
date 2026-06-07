#!/usr/bin/env node
/**
 * packets:valkey:warm
 *
 * Reads memory/packets/nes-chrom-packets.jsonl and populates Valkey hot caches:
 *
 *   packet:qhash:{query_hash}   → packet_id   (TTL 3600s)
 *   packet:feature:{feature_id} → JSON array of last-5 packet_ids (TTL 1800s)
 *   packet:state:{packet_id}    → JSON state snapshot (TTL 3600s)
 *
 * Also reads atlas-state-snapshots.jsonl to load state into the state cache.
 *
 * Usage:
 *   node scripts/packets/warm-valkey-packets.mjs [--dry-run] [--limit=<n>]
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

for (const envFile of [path.join(ROOT, '.env'), path.join(ROOT, 'sveltekit-frontend', '.env')]) {
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
    break;
  }
}

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const LIMIT = Number(ARGS.find(a => a.startsWith('--limit='))?.slice(8) ?? '0') || Infinity;

const OUT_DIR = path.join(ROOT, 'memory', 'packets');
const TTL_QHASH   = 3600;
const TTL_FEATURE = 1800;
const TTL_STATE   = 3600;

const redis = new Redis({
  host:              process.env.REDIS_HOST ?? '127.0.0.1',
  port:              Number(process.env.REDIS_PORT ?? '6379'),
  password:          process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis',
  lazyConnect:       true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy:     () => null,
});
redis.on('error', () => {});

async function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch { /* skip */ }
    if (rows.length >= LIMIT) break;
  }
  return rows;
}

async function run() {
  console.log(`\n=== packets:valkey:warm${DRY_RUN ? ' [DRY-RUN]' : ''} ===`);

  if (!DRY_RUN) {
    await redis.connect();
    await redis.ping();
    console.log('  Valkey: connected');
  }

  const packets = await readJsonl(path.join(OUT_DIR, 'nes-chrom-packets.jsonl'));
  const snapshots = await readJsonl(path.join(OUT_DIR, 'atlas-state-snapshots.jsonl'));
  console.log(`  packets: ${packets.length}, snapshots: ${snapshots.length}`);

  if (DRY_RUN) {
    console.log('  (dry-run) would write:');
    const qhashes = packets.filter(p => p.query_hash && p.packet_id).length;
    const features = new Set(packets.filter(p => p.feature_id).map(p => p.feature_id)).size;
    console.log(`    ${qhashes} query_hash keys, ${features} feature keys, ${snapshots.length} state keys`);
    return;
  }

  // Build feature_id → sorted packet_id list (most recent first)
  const featureMap = new Map();
  for (const p of packets) {
    if (!p.feature_id || !p.packet_id) continue;
    if (!featureMap.has(p.feature_id)) featureMap.set(p.feature_id, []);
    featureMap.get(p.feature_id).push(p.packet_id);
  }

  const pipeline = redis.pipeline();
  let keyCount = 0;

  // query_hash → packet_id
  for (const p of packets) {
    if (!p.query_hash || !p.packet_id) continue;
    pipeline.setex(`packet:qhash:${p.query_hash}`, TTL_QHASH, p.packet_id);
    keyCount++;
  }

  // feature_id → last-5 packet_ids JSON array
  for (const [featureId, ids] of featureMap) {
    pipeline.setex(`packet:feature:${featureId}`, TTL_FEATURE, JSON.stringify(ids.slice(0, 5)));
    keyCount++;
  }

  // state snapshots
  const stateByPacket = new Map();
  for (const s of snapshots) {
    if (!s.packet_uuid) continue;
    if (!stateByPacket.has(s.packet_uuid)) {
      stateByPacket.set(s.packet_uuid, s);
    }
  }
  for (const [packetId, snap] of stateByPacket) {
    pipeline.setex(`packet:state:${packetId}`, TTL_STATE, JSON.stringify(snap.compressed_state ?? {}));
    keyCount++;
  }

  await pipeline.exec();
  console.log(`  Wrote ${keyCount} Valkey keys`);
  console.log('Done.\n');
}

run()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { try { await redis.quit(); } catch {} });
