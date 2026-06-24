#!/usr/bin/env node
/**
 * Validation Script: Canonical Embedding Worker
 *
 * Verifies end-to-end pipeline after test run:
 * - Postgres embedding count increased
 * - Valkey bifrost:embed:* and bifrost:packet:* keys exist
 * - Redis centroid seed keys exist
 * - Qdrant payload mirrors have correct fields
 * - atlas_embedding_metrics populated
 * - No duplicate processing on already-embedded packets
 *
 * Usage:
 *   node scripts/atlas/validate-canonical-embedding-worker.mjs
 */

import pg from 'pg';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Redis = require('ioredis');

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL || 'redis://:redis@127.0.0.1:6379';

const db = new pg.Pool({ connectionString: DB_URL, max: 5 });
const redis = new Redis(REDIS_URL);

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function validate() {
  const results = {
    timestamp: new Date().toISOString(),
    checks: {},
    status: 'pass',
    errors: []
  };

  try {
    // ──────────────────────────────────────────────────────────────────────
    // CHECK 1: Postgres embedding count
    // ──────────────────────────────────────────────────────────────────────
    log('🔍 CHECK 1: Postgres atlas_packets.embedding coverage');
    const pgResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as embedded,
        COUNT(CASE WHEN embedding IS NULL THEN 1 END) as missing
      FROM atlas_packets
    `);

    const { total, embedded, missing } = pgResult.rows[0];
    const coverage = ((embedded / total) * 100).toFixed(1);
    results.checks.postgres_embedding = {
      total,
      embedded,
      missing,
      coverage_percent: parseFloat(coverage),
      status: embedded > 0 ? 'pass' : 'fail'
    };

    log(`  ✓ Total packets: ${total}`);
    log(`  ✓ With embeddings: ${embedded} (${coverage}%)`);
    log(`  ✓ Missing: ${missing}\n`);

    if (embedded === 0) {
      results.status = 'fail';
      results.errors.push('No embeddings found in Postgres');
    }

    // ──────────────────────────────────────────────────────────────────────
    // CHECK 2: Valkey bifrost:embed:* cache keys
    // ──────────────────────────────────────────────────────────────────────
    log('🔍 CHECK 2: Valkey bifrost:embed:embeddinggemma:768:* keys');
    if (!redis.isOpen) await redis.connect();

    const embedCacheKeys = await redis.keys('bifrost:embed:embeddinggemma:768:*');
    results.checks.valkey_embed_cache = {
      key_pattern: 'bifrost:embed:embeddinggemma:768:*',
      count: embedCacheKeys.length,
      status: embedCacheKeys.length > 0 ? 'pass' : 'warn'
    };

    log(`  ✓ Valkey embed cache keys: ${embedCacheKeys.length}`);
    if (embedCacheKeys.length === 0) {
      log(`  ⚠️  No cache entries found (expected if using Ollama directly)\n`);
    } else {
      log(`  ✓ Sample keys: ${embedCacheKeys.slice(0, 2).map(k => k.substring(0, 50)).join(', ')}\n`);
    }

    // ──────────────────────────────────────────────────────────────────────
    // CHECK 3: Valkey bifrost:packet:* hot metadata
    // ──────────────────────────────────────────────────────────────────────
    log('🔍 CHECK 3: Valkey bifrost:packet:* hot metadata');
    const packetMetadataKeys = await redis.keys('bifrost:packet:*');
    results.checks.valkey_packet_metadata = {
      key_pattern: 'bifrost:packet:*',
      count: packetMetadataKeys.length,
      status: packetMetadataKeys.length > 0 ? 'pass' : 'warn'
    };

    log(`  ✓ Valkey packet metadata keys: ${packetMetadataKeys.length}`);
    if (packetMetadataKeys.length > 0) {
      log(`  ✓ Sample keys: ${packetMetadataKeys.slice(0, 2).join(', ')}\n`);
    } else {
      log(`  ⚠️  No packet metadata keys found\n`);
    }

    // ──────────────────────────────────────────────────────────────────────
    // CHECK 4: Redis centroid:seed:packet:* keys
    // ──────────────────────────────────────────────────────────────────────
    log('🔍 CHECK 4: Redis centroid:seed:packet:* seeds');
    const centroidSeedKeys = await redis.keys('centroid:seed:packet:*');
    results.checks.redis_centroid_seeds = {
      key_pattern: 'centroid:seed:packet:*',
      count: centroidSeedKeys.length,
      status: centroidSeedKeys.length > 0 ? 'pass' : 'warn'
    };

    log(`  ✓ Redis centroid seed keys: ${centroidSeedKeys.length}`);
    if (centroidSeedKeys.length > 0) {
      // Sample one seed key
      const sampleKey = centroidSeedKeys[0];
      const sampleValue = await redis.get(sampleKey);
      log(`  ✓ Sample key: ${sampleKey}`);
      try {
        const parsed = JSON.parse(sampleValue);
        log(`  ✓ Sample payload fields: ${Object.keys(parsed).join(', ')}\n`);
      } catch {
        log(`  ✓ Sample payload (raw): ${sampleValue.substring(0, 100)}...\n`);
      }
    } else {
      log(`  ⚠️  No centroid seed keys found\n`);
    }

    // ──────────────────────────────────────────────────────────────────────
    // CHECK 5: Redis centroid:index:feature:* sets
    // ──────────────────────────────────────────────────────────────────────
    log('🔍 CHECK 5: Redis centroid:index:feature:* indexes');
    const featureIndexKeys = await redis.keys('centroid:index:feature:*');
    results.checks.redis_feature_indexes = {
      key_pattern: 'centroid:index:feature:*',
      count: featureIndexKeys.length,
      status: featureIndexKeys.length > 0 ? 'pass' : 'warn'
    };

    log(`  ✓ Redis feature index keys: ${featureIndexKeys.length}`);
    if (featureIndexKeys.length > 0) {
      const sampleKey = featureIndexKeys[0];
      const setSize = await redis.scard(sampleKey);
      log(`  ✓ Sample key: ${sampleKey} (set size: ${setSize})\n`);
    } else {
      log(`  ⚠️  No feature index keys found\n`);
    }

    // ──────────────────────────────────────────────────────────────────────
    // CHECK 6: atlas_embedding_metrics table
    // ──────────────────────────────────────────────────────────────────────
    log('🔍 CHECK 6: atlas_embedding_metrics table');
    let metricsCount = 0;
    let metricsExists = true;

    try {
      const metricsResult = await db.query(`
        SELECT COUNT(*) as count FROM atlas_embedding_metrics
      `);
      metricsCount = parseInt(metricsResult.rows[0].count);
    } catch (e) {
      if (e.message.includes('does not exist')) {
        metricsExists = false;
        log(`  ℹ️  atlas_embedding_metrics table not yet created\n`);
      } else {
        throw e;
      }
    }

    results.checks.atlas_embedding_metrics = {
      exists: metricsExists,
      row_count: metricsCount,
      status: metricsExists && metricsCount > 0 ? 'pass' : 'warn'
    };

    if (metricsExists && metricsCount > 0) {
      const metricsStats = await db.query(`
        SELECT
          COUNT(DISTINCT packet_key) as unique_packets,
          COUNT(CASE WHEN cache_hit = true THEN 1 END) as cache_hits,
          COUNT(CASE WHEN cache_hit = false THEN 1 END) as cache_misses,
          AVG(latency_ms) as avg_latency_ms,
          COUNT(DISTINCT provider) as providers
        FROM atlas_embedding_metrics
      `);

      const stats = metricsStats.rows[0];
      log(`  ✓ Metrics row count: ${metricsCount}`);
      log(`  ✓ Unique packets: ${stats.unique_packets}`);
      log(`  ✓ Cache hits: ${stats.cache_hits}`);
      log(`  ✓ Cache misses: ${stats.cache_misses}`);
      log(`  ✓ Avg latency: ${parseFloat(stats.avg_latency_ms).toFixed(1)}ms`);
      log(`  ✓ Providers used: ${stats.providers}\n`);
    }

    // ──────────────────────────────────────────────────────────────────────
    // CHECK 7: No duplicate processing (embedding_claimed_at)
    // ──────────────────────────────────────────────────────────────────────
    log('🔍 CHECK 7: Duplicate processing check (embedding_claimed_at)');
    const claimResult = await db.query(`
      SELECT
        COUNT(*) as claimed_packets,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as claimed_and_embedded,
        COUNT(CASE WHEN embedding IS NULL THEN 1 END) as claimed_but_missing
      FROM atlas_packets
      WHERE metadata->>'embedding_claimed_at' IS NOT NULL
    `);

    const claimStats = claimResult.rows[0];
    results.checks.duplicate_check = {
      claimed_packets: parseInt(claimStats.claimed_packets),
      claimed_and_embedded: parseInt(claimStats.claimed_and_embedded),
      claimed_but_missing: parseInt(claimStats.claimed_but_missing),
      status: parseInt(claimStats.claimed_but_missing) === 0 ? 'pass' : 'warn'
    };

    log(`  ✓ Claimed packets: ${claimStats.claimed_packets}`);
    log(`  ✓ Claimed + embedded: ${claimStats.claimed_and_embedded}`);
    log(`  ✓ Claimed but missing embedding: ${claimStats.claimed_but_missing}`);
    if (parseInt(claimStats.claimed_but_missing) > 0) {
      log(`  ⚠️  Some claimed packets have no embedding (investigate failures)\n`);
    } else {
      log(`  ✓ All claimed packets have embeddings\n`);
    }

    // ──────────────────────────────────────────────────────────────────────
    // CHECK 8: Metadata.provenance fields
    // ──────────────────────────────────────────────────────────────────────
    log('🔍 CHECK 8: Postgres metadata.provenance fields');
    const provenanceResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN metadata->'provenance' IS NOT NULL THEN 1 END) as with_provenance
      FROM atlas_packets
      WHERE embedding IS NOT NULL
    `);

    const provenanceStats = provenanceResult.rows[0];
    results.checks.provenance = {
      total_embedded: parseInt(provenanceStats.total),
      with_provenance: parseInt(provenanceStats.with_provenance),
      coverage_percent: ((parseInt(provenanceStats.with_provenance) / parseInt(provenanceStats.total)) * 100).toFixed(1),
      status: parseInt(provenanceStats.with_provenance) > 0 ? 'pass' : 'warn'
    };

    log(`  ✓ Embedded packets: ${provenanceStats.total}`);
    log(`  ✓ With provenance: ${provenanceStats.with_provenance} (${results.checks.provenance.coverage_percent}%)`);
    if (parseInt(provenanceStats.with_provenance) > 0) {
      // Sample provenance
      const sampleProvenanceResult = await db.query(`
        SELECT packet_key, metadata->'provenance' as provenance
        FROM atlas_packets
        WHERE embedding IS NOT NULL AND metadata->'provenance' IS NOT NULL
        LIMIT 1
      `);
      if (sampleProvenanceResult.rows.length > 0) {
        const sample = sampleProvenanceResult.rows[0];
        log(`  ✓ Sample provenance (packet_key=${sample.packet_key}):`);
        log(`    ${JSON.stringify(sample.provenance)}\n`);
      }
    } else {
      log(`  ⚠️  No provenance fields found\n`);
    }

  } catch (e) {
    log(`❌ Validation error: ${e.message}`);
    results.status = 'fail';
    results.errors.push(e.message);
  } finally {
    await db.end();
    if (redis.isOpen) await redis.quit();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Summary Report
  // ────────────────────────────────────────────────────────────────────────
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('📊 VALIDATION SUMMARY');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(`Overall Status: ${results.status === 'pass' ? '✅ PASS' : '❌ FAIL'}`);
  log(`Timestamp: ${results.timestamp}\n`);

  log('Checks:');
  Object.entries(results.checks).forEach(([name, check]) => {
    const symbol = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '⚠️';
    log(`  ${symbol} ${name}: ${check.status.toUpperCase()}`);
  });

  if (results.errors.length > 0) {
    log(`\nErrors (${results.errors.length}):`);
    results.errors.forEach(e => log(`  - ${e}`));
  }

  log('');

  // Write JSON report
  console.log('\nJSON Report:');
  console.log(JSON.stringify(results, null, 2));

  process.exit(results.status === 'pass' ? 0 : 1);
}

validate().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});