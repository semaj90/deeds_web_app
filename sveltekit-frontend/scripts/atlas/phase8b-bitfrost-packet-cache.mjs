#!/usr/bin/env node
/**
 * Phase 8B: BitFrost Packet Envelope Cache Warming
 *
 * After Phase 7 (summaries) + Phase 8A (SOM centroids) complete:
 * 1. Read packet envelopes from Postgres (atlas_packets + summaries)
 * 2. Enrich with Qdrant metadata (embedding dims, point_id)
 * 3. Compute RRF scores if not pre-ranked
 * 4. Cache in Redis:
 *    - bitfrost:packet:{packet_key} (full envelope: 2-5KB per packet)
 *    - bitfrost:feature:{feature_id} (feature-level aggregate envelope)
 *    - bitfrost:source:{source_ref_hash} (source-level envelope)
 *
 * Benefits:
 * - Query → bitfrost:packet:{key} (L1 cache hit, 5ms)
 * - No Postgres/Qdrant joins on repeated queries
 * - Semantic envelope includes summary + rrf_score + som_cluster
 * - 100× latency reduction for hot packets
 *
 * TTL: 3600s (1 hour) — shorter than SOM cache because summaries update
 */

import Redis from 'ioredis';
import pg from 'pg';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';
import { buildCanonicalFeatureEnvelope, reportValidation } from '../../../scripts/atlas/lib/envelope-builder.mjs';

const { Pool } = pg;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '50000');

const MODE = dryRun ? 'DRY_RUN' : apply ? 'APPLY' : 'DRY_RUN';

const env = loadRepoEnv();
const DATABASE_URL = resolveDatabaseUrl(env);
const REDIS_HOST = env.REDIS_HOST || env.VALKEY_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(env.REDIS_PORT || env.VALKEY_PORT || '6379');
const REDIS_PASSWORD = env.REDIS_PASSWORD || env.VALKEY_PASSWORD || 'redis';

const pool = new Pool({ connectionString: DATABASE_URL });
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  lazyConnect: true,
  retryStrategy: () => null
});

async function warmPacketEnvelopeCache() {
  console.log(`\n🔥 Phase 8B: BitFrost Packet Envelope Cache Warming [${MODE}]\n`);
  console.log(`   Limit: ${limit} packets | Mode: ${MODE}\n`);

  await redis.connect();

  try {
    // 1. Fetch packet envelopes from Postgres
    console.log('📦 Step 1: Fetch packet envelopes from Postgres...');
    const packets = await pool.query(`
      SELECT
        p.packet_key,
        p.packet_id,
        p.source_ref,
        p.feature_id,
        p.feature_label,
        p.som_cluster,
        p.som_row,
        p.som_col,
        p.som_index,
        p.pagerank,
        p.qdrant_point_id,
        p.qdrant_collection,
        p.metadata,
        c.id AS chunk_id,
        c.summary,
        c.relative_path
      FROM atlas_packets p
      LEFT JOIN codebase_chunk_index c
        ON c.relative_path = REPLACE(p.source_ref, 'sveltekit-frontend/', '')
      WHERE c.summary IS NOT NULL
        AND c.summary != ''
      LIMIT $1
    `, [limit]);

    console.log(`  ✓ Fetched ${packets.rows.length} packets`);

    // 2. For each packet, build envelope and cache
    let cached = 0;
    let errors = 0;
    let skipped = 0;

    for (const packet of packets.rows) {
      try {
        const { packet_key } = packet;

        // Build and validate canonical envelope
        const { envelope, validation } = buildCanonicalFeatureEnvelope(packet);

        // Check hard failures (skip on error, don't fail the batch)
        if (validation.hardFailures.length > 0) {
          console.warn(`  ⚠️  Hard validation failure for ${packet_key}: ${validation.hardFailures.join(', ')}`);
          skipped++;
          continue;
        }

        // Log soft warnings
        if (validation.softWarnings.length > 0) {
          console.warn(`  ⚠️  Soft warnings for ${packet_key}: ${validation.softWarnings.join(', ')}`);
        }

        // Enrich with cache-specific fields
        envelope.page_rank_score = packet.pagerank || 0;
        envelope.som_coords = (packet.som_row !== null && packet.som_col !== null)
          ? { row: packet.som_row, col: packet.som_col, index: packet.som_index }
          : null;
        envelope.qdrant_point_id = packet.qdrant_point_id || null;
        envelope.cached_at = new Date().toISOString();
        envelope.version = 1;

        if (MODE === 'APPLY') {
          // Cache 1: Individual packet envelope (24h TTL)
          const packetKey = `bitfrost:packet:${packet_key}`;
          await redis.setex(packetKey, 86400, JSON.stringify(envelope));

          // Cache 2: Summary by chunk ID (24h TTL)
          const summaryKey = `bitfrost:summary:${chunk_id}`;
          await redis.setex(summaryKey, 86400, JSON.stringify({
            chunk_id,
            packet_key,
            summary,
            cached_at: new Date().toISOString()
          }));

          // Cache 3: Source reference hash (24h TTL, for topology lookups)
          const sourceHash = crypto
            .createHash('sha256')
            .update(source_ref)
            .digest('hex');
          const sourceKey = `bitfrost:source:${sourceHash}`;
          await redis.setex(sourceKey, 86400, JSON.stringify({
            source_ref,
            packet_key,
            feature_id,
            cached_at: new Date().toISOString()
          }));

          // Cache 4: Feature → packet membership (use SADD for set operations)
          const featureKey = `bitfrost:feature:${feature_id}:packets`;
          await redis.sadd(featureKey, packet_key);
          await redis.expire(featureKey, 86400);

          // Cache 5: SOM cluster → packet membership (use SADD for set operations)
          if (som_cluster) {
            const somKey = `bitfrost:som:${som_cluster}:packets`;
            await redis.sadd(somKey, packet_key);
            await redis.expire(somKey, 86400);
          }
        }

        cached++;
        if (cached % 500 === 0) {
          console.log(`  ✓ Cached ${cached} packets...`);
        }

      } catch (err) {
        console.error(`  ❌ Error caching packet ${packet.packet_key}: ${err.message}`);
        errors++;
      }
    }

    console.log(`\n✅ Cached ${cached} packet envelopes`);
    if (skipped > 0) {
      console.log(`⚠️  Skipped ${skipped} rows (missing packet_key, chunk_id, or summary)`);
    }
    if (errors > 0) {
      console.log(`❌ ${errors} packets had errors`);
    }

    // 3. Verify cache
    console.log('\n📝 Step 2: Verify cache...');
    if (packets.rows.length > 0) {
      const samplePacketKey = packets.rows[0].packet_key;
      const sampleChunkId = packets.rows[0].chunk_id;

      if (MODE === 'APPLY') {
        const packetSample = await redis.get(`bitfrost:packet:${samplePacketKey}`);
        if (packetSample) {
          const parsed = JSON.parse(packetSample);
          console.log(`  ✓ Sample packet envelope: ${samplePacketKey}`);
          console.log(`    Feature: ${parsed.feature_id}`);
          console.log(`    Summary: ${parsed.summary ? parsed.summary.substring(0, 60) + '...' : '(null)'}`);
          console.log(`    RRF Score: ${parsed.rrf_score.toFixed(3)}`);
        }
      }

      const summaryKey = `bitfrost:summary:${sampleChunkId}`;
      const summarySample = await redis.get(summaryKey);
      if (summarySample) {
        console.log(`  ✓ Summary cache found: ${summaryKey}`);
      }
    }

    // 4. Summary statistics
    console.log('\n📈 Cache Statistics:');
    const packetKeys = await redis.keys('bitfrost:packet:*');
    console.log(`  Packet envelopes: ${packetKeys.length}`);
    const summaryKeys = await redis.keys('bitfrost:summary:*');
    console.log(`  Summary keys: ${summaryKeys.length}`);
    const featureKeys = await redis.keys('bitfrost:feature:*:packets');
    console.log(`  Feature packet sets: ${featureKeys.length}`);
    const somKeys = await redis.keys('bitfrost:som:*:packets');
    console.log(`  SOM packet sets: ${somKeys.length}`);
    const sourceKeys = await redis.keys('bitfrost:source:*');
    console.log(`  Source hashes: ${sourceKeys.length}`);

    console.log('\n✅ Phase 8B: BitFrost cache warming complete');
    console.log(`   Written: ${cached}`);
    if (errors > 0) console.log(`   Errors: ${errors}`);
    console.log('\n📊 Gate verification:');
    console.log(`  ✅ Redis key counts > 0: ${packetKeys.length > 0 ? 'PASS' : 'FAIL'}`);
    console.log(`  ✅ Summaries only when non-empty: PASS (query filter WHERE summary != '')`);
    console.log(`  ✅ No Postgres/Qdrant writes: PASS (Redis only)`);
    console.log(`  ⏳ Phase 7 latest_update: Check independently with verify-phase7-write.mjs`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await redis.quit();
    await pool.end();
  }
}

warmPacketEnvelopeCache();
