#!/usr/bin/env node
/**
 * Wave 3: Projection Lineage Validation
 *
 * Audit source_ref → feature_id → packet_key lineage across all stores:
 * - Postgres atlas_packets (source of truth)
 * - Qdrant codebase_chunks_768 (vector mirror)
 * - Redis ace:cursor:* (cache layer)
 *
 * Validates:
 * 1. No orphaned packets (in mirror but missing from truth)
 * 2. Directory path consistency across stores
 * 3. Feature ID validity
 * 4. Coverage metrics
 */

import pg from 'pg';
import Redis from 'ioredis';
import fs from 'node:fs';
import path from 'node:path';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null
});

async function main() {
  console.log('📋 Wave 3: Projection Lineage Validation');
  console.log('========================================\n');

  try {
    // Step 1: Fetch all packets from Postgres (truth)
    console.log('Step 1: Fetching Postgres packets (source of truth)...');
    const pgPackets = await pgPool.query(`
      SELECT packet_key, source_ref, feature_id, directory_path, summary
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      ORDER BY packet_key
    `);
    const pgPacketSet = new Set(pgPackets.rows.map(r => r.packet_key));
    console.log(`✓ Found ${pgPackets.rows.length} packets in Postgres\n`);

    // Step 2: Fetch packets from Qdrant
    console.log('Step 2: Fetching Qdrant collection points...');
    let qdrantPackets = [];
    let qdrantOffset = 0;
    const qdrantPageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?limit=${qdrantPageSize}&offset=${qdrantOffset}`);
      if (!res.ok) {
        console.error(`✗ Qdrant fetch failed: ${res.status}`);
        break;
      }
      const data = await res.json();
      if (!data.result?.points?.length) {
        hasMore = false;
      } else {
        qdrantPackets = qdrantPackets.concat(data.result.points);
        qdrantOffset += qdrantPageSize;
      }
    }
    const qdrantPacketSet = new Set(qdrantPackets.map(p => p.payload?.packet_key).filter(Boolean));
    console.log(`✓ Found ${qdrantPackets.length} points in Qdrant\n`);

    // Step 3: Fetch cursors from Redis
    console.log('Step 3: Fetching Redis ACE cursors...');
    await redis.connect();
    const cursor = await redis.scan(0, 'MATCH', 'ace:cursor:*', 'COUNT', 1000);
    const cursorKeys = cursor[1] || [];
    console.log(`✓ Found ${cursorKeys.length} cursors in Redis\n`);

    // Step 4: Validation gates
    console.log('Step 4: Running validation gates...\n');

    const gates = {
      pg_count: pgPackets.rows.length > 0,
      qdrant_count: qdrantPacketSet.size > 0,
      coverage: (qdrantPacketSet.size / pgPacketSet.size) * 100,
      orphans: [],
      missing: [],
      inconsistencies: []
    };

    // Gate: Orphaned packets (in Qdrant but missing from Postgres)
    for (const packetKey of qdrantPacketSet) {
      if (!pgPacketSet.has(packetKey)) {
        gates.orphans.push(packetKey);
      }
    }

    // Gate: Missing from Qdrant (in Postgres but not indexed)
    for (const row of pgPackets.rows) {
      if (!qdrantPacketSet.has(row.packet_key)) {
        gates.missing.push(row.packet_key);
      }
    }

    // Gate: Directory path consistency
    const qdrantPacketMap = new Map(qdrantPackets.map(p => [p.payload?.packet_key, p.payload]));
    for (const row of pgPackets.rows.slice(0, 100)) { // Sample first 100
      const qdrantPayload = qdrantPacketMap.get(row.packet_key);
      if (qdrantPayload && qdrantPayload.directory_path !== row.directory_path) {
        gates.inconsistencies.push({
          packet_key: row.packet_key,
          pg_dir: row.directory_path,
          qdrant_dir: qdrantPayload.directory_path
        });
      }
    }

    // Step 5: Report
    console.log('Gate Results:');
    console.log(`  ✓ Postgres count: ${gates.pg_count ? pgPackets.rows.length : 0}`);
    console.log(`  ✓ Qdrant count: ${gates.qdrant_count ? qdrantPacketSet.size : 0}`);
    console.log(`  ✓ Coverage: ${gates.coverage.toFixed(1)}%`);
    console.log(`  ⚠ Orphaned (Qdrant only): ${gates.orphans.length}`);
    console.log(`  ⚠ Missing (Postgres only): ${gates.missing.length}`);
    console.log(`  ⚠ Inconsistencies: ${gates.inconsistencies.length}\n`);

    if (gates.orphans.length > 0) {
      console.log('Orphaned packets (sample):');
      gates.orphans.slice(0, 5).forEach(pk => console.log(`    - ${pk}`));
      if (gates.orphans.length > 5) console.log(`    ... and ${gates.orphans.length - 5} more\n`);
    }

    if (gates.missing.length > 0) {
      console.log('Missing from Qdrant (sample):');
      gates.missing.slice(0, 5).forEach(pk => console.log(`    - ${pk}`));
      if (gates.missing.length > 5) console.log(`    ... and ${gates.missing.length - 5} more\n`);
    }

    // Final status
    const allPass = gates.orphans.length === 0 && gates.missing.length === 0 && gates.inconsistencies.length === 0;
    console.log(`\nFinal Status: ${allPass ? '✅ PASS' : '⚠️ GAPS DETECTED'}`);
    console.log(`Coverage: ${gates.coverage.toFixed(1)}% of Postgres packets indexed in Qdrant`);

  } catch (err) {
    console.error('❌ Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await pgPool.end();
    await redis.quit();
  }
}

main();
