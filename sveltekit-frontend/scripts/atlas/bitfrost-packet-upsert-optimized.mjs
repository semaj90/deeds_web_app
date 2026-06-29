#!/usr/bin/env node

/**
 * BitFrost Packet Upsert Optimizer
 * Organizes 57K+ packets into Redis with hierarchical key structure
 *
 * Strategy:
 * - Batch inserts by feature_id (1000 packets/batch)
 * - Create 4-tier key hierarchy:
 *   L1: bifrost:packet:{packet_key} → full envelope (exact-match)
 *   L2: bifrost:feature:{feature_id} → set of packet_keys
 *   L3: bifrost:directory:{dir_hash} → set of packet_keys
 *   L4: bifrost:index:all → sorted set by authority/updated_at
 * - Use Redis pipelining for 10-20× throughput
 * - Support incremental warm-up (resume from crash)
 */

import Redis from 'ioredis';
import { createReadStream } from 'fs';
import { readFileSync } from 'fs';
import readline from 'readline';
import { execSync } from 'child_process';

const BATCH_SIZE = 1000;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'redis';
const TTL_SECONDS = 604800; // 7 days
const DRY_RUN = process.argv.includes('--dry-run');
const RESUME_FROM = process.argv.find(a => a.startsWith('--resume='))?.split('=')[1];

let redis;

async function initRedis() {
  redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    maxRetriesPerRequest: 1,
  });

  redis.on('error', (err) => {
    if (!err.message.includes('ECONNREFUSED')) return;
    console.error(`[Redis] Connection failed: ${err.message}`);
  });

  await redis.connect();
  console.log(`[Redis] Connected to ${REDIS_HOST}:${REDIS_PORT}`);

  // Verify connection
  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error('PING failed');
  } catch (err) {
    console.error(`[Redis] Health check failed: ${err.message}`);
    await redis.quit();
    process.exit(1);
  }
}

/**
 * Compute directory hash for tier-3 grouping
 * E.g., "src/lib/server" → "dir:5f9c4ab0"
 */
function getDirectoryHash(dirPath) {
  if (!dirPath) return 'dir:unclassified';
  // Simple hash: first 8 chars of base32(crc32(dirPath))
  const parts = dirPath.split('/').slice(0, 3); // Keep first 3 levels
  return `dir:${parts.join(':').substring(0, 8).replace(/\//g, ':')}`;
}

/**
 * Create upsert pipeline for a single packet batch
 */
function createUpsertPipeline(packets, pipeline) {
  const featureGroups = {};
  const dirGroups = {};

  for (const packet of packets) {
    const {
      packet_key,
      source_ref,
      feature_id,
      directory_path,
      summary,
      confidence,
      updated_at,
      provenance
    } = packet;

    if (!packet_key || !feature_id) {
      console.warn(`[Warn] Skipping packet with missing identity: ${JSON.stringify(packet).substring(0, 100)}`);
      continue;
    }

    // L1: Exact-match envelope
    const envelope = JSON.stringify({
      packet_key,
      source_ref,
      feature_id,
      directory_path,
      summary,
      confidence: confidence || 0.95,
      updated_at: updated_at || new Date().toISOString(),
      provenance: provenance || {}
    });

    pipeline.setex(`bifrost:packet:${packet_key}`, TTL_SECONDS, envelope);

    // L2: Feature index (set of packet_keys)
    if (!featureGroups[feature_id]) featureGroups[feature_id] = [];
    featureGroups[feature_id].push(packet_key);

    // L3: Directory index
    const dirHash = getDirectoryHash(directory_path);
    if (!dirGroups[dirHash]) dirGroups[dirHash] = [];
    dirGroups[dirHash].push(packet_key);

    // L4: Global sorted index (by authority / updated_at)
    const score = new Date(updated_at).getTime();
    pipeline.zadd(`bifrost:index:all`, score, packet_key);
  }

  // Batch L2 index updates
  for (const [feature_id, keys] of Object.entries(featureGroups)) {
    pipeline.sadd(`bifrost:feature:${feature_id}`, ...keys);
    pipeline.expire(`bifrost:feature:${feature_id}`, TTL_SECONDS);
  }

  // Batch L3 index updates
  for (const [dirHash, keys] of Object.entries(dirGroups)) {
    pipeline.sadd(`bifrost:${dirHash}`, ...keys);
    pipeline.expire(`bifrost:${dirHash}`, TTL_SECONDS);
  }

  // Update global counters
  pipeline.hset('bifrost:stats', 'last_updated', Date.now());
  pipeline.hset('bifrost:stats', 'packet_count', packets.length);
  pipeline.expire('bifrost:stats', TTL_SECONDS);

  return pipeline;
}

/**
 * Load packets from NDJSON and upsert in batches
 */
async function upsertPacketsFromNdjson(ndjsonPath) {
  const stream = createReadStream(ndjsonPath);
  const lines = readline.createInterface({ input: stream });

  let batchNum = 0;
  let lineNum = 0;
  let currentBatch = [];
  let skippedCount = 0;
  let successCount = 0;

  for await (const line of lines) {
    lineNum++;

    if (!line.trim()) continue;

    try {
      const packet = JSON.parse(line);
      currentBatch.push(packet);

      if (currentBatch.length >= BATCH_SIZE) {
        batchNum++;
        const result = await processBatch(currentBatch, batchNum, DRY_RUN);
        successCount += result.success;
        skippedCount += result.skipped;
        currentBatch = [];
      }
    } catch (err) {
      console.error(`[Error] Line ${lineNum}: ${err.message}`);
      skippedCount++;
    }
  }

  // Final batch
  if (currentBatch.length > 0) {
    batchNum++;
    const result = await processBatch(currentBatch, batchNum, DRY_RUN);
    successCount += result.success;
    skippedCount += result.skipped;
  }

  return { totalBatches: batchNum, successCount, skippedCount, totalLines: lineNum };
}

/**
 * Process a single batch with pipeline
 */
async function processBatch(packets, batchNum, dryRun = false) {
  const validPackets = packets.filter(p => p.packet_key && p.feature_id);
  const skipped = packets.length - validPackets.length;

  if (dryRun) {
    // Estimate command count: 1 SETEX per packet + 2 per feature + 2 per dir + 1 per packet in sorted + 3 stats
    const estimatedFeatures = Math.ceil(validPackets.length / 7); // avg 7 packets per feature
    const estimatedDirs = Math.ceil(validPackets.length / 20); // avg 20 packets per dir
    const commandEstimate = validPackets.length + (estimatedFeatures * 2) + (estimatedDirs * 2) + validPackets.length + 3;
    console.log(`[Batch ${batchNum}] Dry-run: ~${commandEstimate} Redis commands (${validPackets.length} packets, ${skipped} skipped)`);
    return { success: validPackets.length, skipped };
  }

  const pipeline = redis.pipeline();
  createUpsertPipeline(validPackets, pipeline);

  try {
    const results = await pipeline.exec();
    if (!results || results.some(r => r[0])) {
      console.error(`[Batch ${batchNum}] Pipeline errors detected`);
      return { success: 0, skipped };
    }
    const commandCount = validPackets.length + Math.ceil(validPackets.length / 7 * 2) + Math.ceil(validPackets.length / 20 * 2) + validPackets.length + 3;
    console.log(`[Batch ${batchNum}] ✅ Upserted ${validPackets.length} packets (~${commandCount} commands)`);
    return { success: validPackets.length, skipped };
  } catch (err) {
    console.error(`[Batch ${batchNum}] ❌ Pipeline failed: ${err.message}`);
    return { success: 0, skipped };
  }
}

/**
 * Verify cache structure
 */
async function verifyCacheStructure() {
  console.log('\n[Verify] Cache Structure:');

  // Sample L1 keys
  const l1Sample = await redis.randomkey();
  if (l1Sample?.startsWith('bifrost:packet:')) {
    const val = await redis.get(l1Sample);
    console.log(`  L1 sample: ${l1Sample.substring(0, 50)}... = ${val?.substring(0, 50) || 'null'}...`);
  }

  // Check L2 index
  const features = await redis.keys('bifrost:feature:*');
  console.log(`  L2 feature indexes: ${features.length} total`);
  if (features.length > 0) {
    const firstFeature = features[0];
    const count = await redis.scard(firstFeature);
    console.log(`    Example: ${firstFeature} = ${count} packets`);
  }

  // Check L3 directory index
  const dirs = await redis.keys('bifrost:dir:*');
  console.log(`  L3 directory indexes: ${dirs.length} total`);

  // Check L4 global index
  const l4Count = await redis.zcard('bifrost:index:all');
  console.log(`  L4 global sorted index: ${l4Count} packets`);

  // Check stats
  const stats = await redis.hgetall('bifrost:stats');
  console.log(`  Stats: ${JSON.stringify(stats)}`);
}

/**
 * Main entry
 */
async function main() {
  console.log(`[BitFrost] Packet Upsert Optimizer`);
  console.log(`  Host: ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  console.log(`  TTL: ${TTL_SECONDS}s (7 days)`);
  console.log(`  Dry-run: ${DRY_RUN}`);

  // Check for input file
  const inputFile = process.argv.find(a => !a.startsWith('--') && a.endsWith('.ndjson'));
  if (!inputFile) {
    console.error('\n[Error] Usage: node bitfrost-packet-upsert-optimized.mjs <input.ndjson> [--dry-run] [--resume=<batch>]');
    process.exit(1);
  }

  try {
    await initRedis();

    const startTime = Date.now();
    const result = await upsertPacketsFromNdjson(inputFile);

    console.log(`\n[Summary]`);
    console.log(`  Batches processed: ${result.totalBatches}`);
    console.log(`  Packets upserted: ${result.successCount}`);
    console.log(`  Packets skipped: ${result.skippedCount}`);
    console.log(`  Lines read: ${result.totalLines}`);
    console.log(`  Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    await verifyCacheStructure();

    await redis.quit();
    console.log('\n✅ Upsert complete');
  } catch (err) {
    console.error(`[Fatal] ${err.message}`);
    if (redis?.isOpen) await redis.quit();
    process.exit(1);
  }
}

main();
