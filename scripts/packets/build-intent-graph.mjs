#!/usr/bin/env node
/**
 * packets:intent:build (Phase 4)
 *
 * Reads nes-chrom-packets.jsonl → groups by query_hash → feature_id →
 * emits RESOLVES_INTENT edges → appends to atlas-graph-edges.jsonl →
 * optionally loads into Neo4j + increments Valkey counter.
 *
 * Usage:
 *   node scripts/packets/build-intent-graph.mjs [--dry-run] [--no-neo4j] [--no-valkey]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const ARGS = new Set(process.argv.slice(2));
const DRY_RUN  = ARGS.has('--dry-run');
const NO_NEO4J = ARGS.has('--no-neo4j');
const NO_VALKEY = ARGS.has('--no-valkey');

const PACKETS_FILE = path.join(ROOT, 'memory', 'packets', 'nes-chrom-packets.jsonl');
const EDGES_FILE   = path.join(ROOT, 'memory', 'packets', 'atlas-graph-edges.jsonl');

async function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch {}
  }
  return rows;
}

async function run() {
  console.log(`\n=== packets:intent:build${DRY_RUN ? ' [DRY-RUN]' : ''} ===`);

  const packets = await readJsonl(PACKETS_FILE);
  console.log(`  packets: ${packets.length}`);

  // Group query_hash → most common feature_id
  const intentMap = new Map(); // query_hash → { feature_id, count, packet_uuids[] }
  for (const p of packets) {
    if (!p.query_hash || !p.feature_id) continue;
    const key = p.query_hash;
    if (!intentMap.has(key)) {
      intentMap.set(key, { feature_id: p.feature_id, count: 0, packet_uuids: [] });
    }
    const entry = intentMap.get(key);
    entry.count++;
    if (p.packet_id) entry.packet_uuids.push(p.packet_id);
  }

  const NOW = new Date().toISOString();
  const edges = [];
  for (const [queryHash, { feature_id, count, packet_uuids }] of intentMap) {
    edges.push({
      id: randomUUID(),
      packet_uuid: packet_uuids[0] ?? null,
      src: queryHash,
      dst: feature_id,
      edge_type: 'RESOLVES_INTENT',
      weight: count,
      metadata: { query_hash: queryHash, packet_count: count },
      feature_id,
      som_cluster: null,
      created_at: NOW,
    });
  }

  console.log(`  RESOLVES_INTENT edges: ${edges.length}`);
  if (edges.length === 0) { console.log('  Nothing to write.\n'); return; }

  if (!DRY_RUN) {
    // Append to atlas-graph-edges.jsonl
    const appendLines = edges.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFileSync(EDGES_FILE, appendLines, 'utf8');
    console.log(`  Appended ${edges.length} edges to ${path.basename(EDGES_FILE)}`);
  }

  // Neo4j load
  if (!DRY_RUN && !NO_NEO4J) {
    try {
      const neo4j = await import('neo4j-driver');
      const driver = neo4j.default.driver(
        process.env.NEO4J_URI ?? 'bolt://localhost:7687',
        neo4j.default.auth.basic(
          process.env.NEO4J_USER ?? 'neo4j',
          process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'password'
        )
      );
      const session = driver.session();
      try {
        const BATCH = 500;
        for (let i = 0; i < edges.length; i += BATCH) {
          const chunk = edges.slice(i, i + BATCH).map(e => ({
            src: e.src, dst: e.dst, weight: e.weight,
            packet_uuid: e.packet_uuid, feature_id: e.feature_id,
            created_at: e.created_at,
          }));
          await session.run(`
            UNWIND $rows AS row
            MERGE (a:PacketNode {id: row.src})
            MERGE (b:PacketNode {id: row.dst})
            MERGE (a)-[r:PACKET_EDGE {edge_type: 'RESOLVES_INTENT', src: row.src, dst: row.dst}]->(b)
            SET r.weight = row.weight, r.packet_uuid = row.packet_uuid,
                r.feature_id = row.feature_id, r.created_at = row.created_at
          `, { rows: chunk });
        }
        console.log('  Neo4j: RESOLVES_INTENT edges merged');
      } finally {
        await session.close();
        await driver.close();
      }
    } catch (e) {
      console.warn(`  Neo4j skipped: ${e.message}`);
    }
  }

  // Valkey counters
  if (!DRY_RUN && !NO_VALKEY) {
    try {
      const Redis = (await import('ioredis')).default;
      for (const envFile of [path.join(ROOT, '.env'), path.join(ROOT, 'sveltekit-frontend', '.env')]) {
        if (fs.existsSync(envFile)) {
          for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
            const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
          }
          break;
        }
      }
      const redis = new Redis({
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? '6379'),
        password: process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis',
        lazyConnect: true, maxRetriesPerRequest: 1,
        enableOfflineQueue: false, retryStrategy: () => null,
      });
      redis.on('error', () => {});
      await redis.connect();
      const pipeline = redis.pipeline();
      for (const { feature_id, count } of intentMap.values()) {
        pipeline.incrby(`intent:feature:${feature_id}`, count);
      }
      await pipeline.exec();
      console.log(`  Valkey: incremented ${intentMap.size} intent:feature:* counters`);
      await redis.quit();
    } catch (e) {
      console.warn(`  Valkey skipped: ${e.message}`);
    }
  }

  console.log('Done.\n');
}

run().catch(e => { console.error(e.message); process.exit(1); });
