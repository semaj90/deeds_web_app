#!/usr/bin/env node
/**
 * Phase 1d: Redis SOM Cell Cache Population
 *
 * Purpose: Populate Redis SMEMBERS for each SOM cell (0-399) with all packet IDs
 * Enables O(1) lookups in bifrost-som-prefilter.ts for ANN candidate prefiltering
 *
 * Storage: som:cell:<N> = set of packet_key strings (TTL: 5 minutes)
 * Example: som:cell:42 = {ace:packet:auth:001, ace:packet:db:023, ...}
 *
 * Usage:
 *   node scripts/atlas/phase-1d-redis-som-cell-cache.mjs [--dry-run] [--apply]
 */

import pg from 'pg';
import { createClient } from 'redis';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

const flags = {
  dryRun: process.argv.includes('--dry-run'),
  apply: process.argv.includes('--apply')
};

const mode = flags.apply ? 'APPLY' : 'DRY-RUN';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 1d: Redis SOM Cell Cache Population                    ║');
console.log(`║  Mode: ${mode}${' '.repeat(48 - mode.length)}║`);
console.log('║  Grid: 20×20 = 400 cells, som_cluster 0-399                   ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function populateSomCellCaches() {
  console.log('📊 Step 1: Fetch all packets with som_cluster\n');

  try {
    const result = await pgPool.query(`
      SELECT packet_key, som_cluster
      FROM atlas_codebase_packets
      WHERE som_cluster IS NOT NULL
      ORDER BY som_cluster, packet_key
    `);

    const packets = result.rows;
    console.log(`   ✅ Fetched ${packets.length} packets with som_cluster\n`);

    // Group by som_cluster
    const cellMap = new Map();
    for (const pkt of packets) {
      if (!cellMap.has(pkt.som_cluster)) {
        cellMap.set(pkt.som_cluster, []);
      }
      cellMap.get(pkt.som_cluster).push(pkt.packet_key);
    }

    console.log(`   📦 Cell distribution:`);
    console.log(`      Cells with packets: ${cellMap.size}/400`);
    console.log(`      Sparse cells: ${400 - cellMap.size}\n`);

    // Show distribution statistics
    const cellSizes = Array.from(cellMap.values()).map(v => v.length);
    const minSize = Math.min(...cellSizes);
    const maxSize = Math.max(...cellSizes);
    const avgSize = cellSizes.reduce((a, b) => a + b, 0) / cellSizes.length;

    console.log(`   📈 Cell statistics:`);
    console.log(`      Min size: ${minSize} packets`);
    console.log(`      Max size: ${maxSize} packets`);
    console.log(`      Avg size: ${avgSize.toFixed(1)} packets\n`);

    if (flags.dryRun) {
      console.log('   [DRY-RUN] Would populate Redis with:');
      let previewCount = 0;
      for (const [cluster, packetKeys] of cellMap) {
        if (previewCount < 5) {
          console.log(`      som:cell:${cluster} → ${packetKeys.length} packets`);
          previewCount++;
        }
      }
      if (cellMap.size > 5) {
        console.log(`      ... and ${cellMap.size - 5} more cells\n`);
      }
      return { success: true, cellsPopulated: cellMap.size, totalMappings: packets.length };
    }

    // APPLY: connect to Redis and populate
    console.log('💾 Step 2: Connect to Redis\n');

    await redisClient.connect();
    console.log('   ✅ Connected to Redis\n');

    console.log('🧠 Step 3: Populate SOM cell caches\n');

    let cellsPopulated = 0;
    let totalMappings = 0;
    const SOM_CACHE_TTL = 300; // 5 minutes

    for (const [cluster, packetKeys] of cellMap) {
      const cacheKey = `som:cell:${cluster}`;

      // SADD to add all packet keys to the set
      await redisClient.sAdd(cacheKey, packetKeys);

      // EXPIRE to set TTL
      await redisClient.expire(cacheKey, SOM_CACHE_TTL);

      cellsPopulated++;
      totalMappings += packetKeys.length;

      if (cellsPopulated % 50 === 0) {
        console.log(`   ⏳ Populated ${cellsPopulated} cells, ${totalMappings} mappings...`);
      }
    }

    console.log(`   ✅ Populated ${cellsPopulated} cells\n`);
    return { success: true, cellsPopulated, totalMappings };
  } catch (err) {
    console.error('   ❌ Error:', err.message);
    return { success: false, cellsPopulated: 0, totalMappings: 0 };
  }
}

// Verify cache population
async function verify() {
  console.log('✅ Step 4: Verify cache\n');

  try {
    // Get all som:cell:* keys
    const keys = await redisClient.keys('som:cell:*');
    console.log(`   Redis cells: ${keys.length}/400`);

    // Sample a few cells
    if (keys.length > 0) {
      console.log(`   Sample cells:\n`);
      for (let i = 0; i < Math.min(5, keys.length); i++) {
        const cellKey = keys[i];
        const memberCount = await redisClient.sCard(cellKey);
        const ttl = await redisClient.ttl(cellKey);
        console.log(`      ${cellKey}: ${memberCount} packets, TTL ${ttl}s`);
      }
    }

    // Check cache hit rate (sample query)
    const randomCell = Math.floor(Math.random() * 400);
    const randomCellKey = `som:cell:${randomCell}`;
    const members = await redisClient.sMembers(randomCellKey);
    console.log(`\n   Cache hit test: ${randomCellKey} → ${members.length} packets\n`);

    return { success: true, cellsInRedis: keys.length };
  } catch (err) {
    console.error('   ❌ Verification failed:', err.message);
    return { success: false, cellsInRedis: 0 };
  }
}

// Main
async function main() {
  try {
    const populateResult = await populateSomCellCaches();
    const verifyResult = await verify();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Phase 1d Complete ✅                                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (populateResult.success && verifyResult.success) {
      console.log(`   ✅ SOM cell cache initialized`);
      console.log(`   Cells: ${populateResult.cellsPopulated}/400`);
      console.log(`   Mappings: ${populateResult.totalMappings}\n`);
      process.exit(0);
    } else {
      console.log(`   ⚠️  Cache population incomplete\n`);
      if (!flags.apply) {
        console.log('   📋 To apply, run:\n');
        console.log('   node scripts/atlas/phase-1d-redis-som-cell-cache.mjs --apply\n');
      }
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await redisClient.quit();
    await pgPool.end();
  }
}

main();
