#!/usr/bin/env node

/**
 * Phase 108D: Redis Cache Validation Snapshot
 *
 * Validates that Redis/Valkey Bifrost cache contains identity fields for packets,
 * and that cached values match Postgres authority.
 *
 * Strategy:
 * 1. Sample Postgres packets with identity fields
 * 2. Query Redis for cache hits using bifrost:packet:{key} pattern
 * 3. Verify cache values match Postgres (spot check)
 * 4. Measure cache coverage and staleness
 *
 * Usage:
 *   npx tsx phase108d-redis-snapshot.mts [--sample-size N] [--verbose]
 */

import Redis from 'ioredis';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const sampleSizeArg = process.argv.find(arg => arg.startsWith('--sample-size=')) || '--sample-size=100';
const SAMPLE_SIZE = parseInt(sampleSizeArg.split('=')[1], 10) || 100;
const VERBOSE = process.argv.includes('--verbose');

const LOG_DIR = resolve(process.cwd(), '../log/artifacts/semantic-contract');
const REPORT_FILE = `${LOG_DIR}/phase108d-redis-snapshot-report.json`;

mkdirSync(LOG_DIR, { recursive: true });

console.log(`\n📋 Phase 108D: Redis Cache Validation Snapshot`);
console.log(`🔍 Sample size: ${SAMPLE_SIZE} packets`);
console.log(`📊 Verbose: ${VERBOSE ? 'yes' : 'no'}`);

interface CacheValidationResult {
  timestamp: string;
  redis_connected: boolean;
  postgres_sample_size: number;
  cache_keys_checked: number;
  cache_hits: number;
  cache_misses: number;
  hit_rate: number;
  validation_passed: number;
  validation_failed: number;
  staleness_samples: { key: string; age_seconds: number }[];
  errors: string[];
  coverage: {
    packet_key: number;
    workspace_id: number;
    ontology_version: number;
  };
}

// Step 1: Connect to Redis
async function connectRedis(): Promise<Redis> {
  try {
    const redis = new Redis({
      host: '127.0.0.1',
      port: 6379,
      password: 'redis',
      lazyConnect: true,
      retryStrategy: () => null,
      maxRetriesPerRequest: 1
    });

    await redis.connect();
    const pong = await redis.ping();
    console.log(`\n✅ Redis connected (${pong})`);
    return redis;
  } catch (err) {
    console.error(`\n❌ Redis connection failed: ${(err as Error).message}`);
    throw err;
  }
}

// Step 2: Export Postgres sample
function exportPostgresSample(limit: number): Map<string, any> {
  console.log(`\n1️⃣  Sampling Postgres packets...`);

  try {
    const sql = `SELECT packet_key, workspace_id, ontology_version, source_ref
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      ORDER BY RANDOM()
      LIMIT ${limit}`;

    const copyCommand = `COPY (${sql}) TO STDOUT WITH CSV HEADER`;
    const escapedCmd = copyCommand.replace(/"/g, '\\"').replace(/\n/g, ' ');

    const output = execSync(
      `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -t -c "${escapedCmd}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    const lines = output.trim().split('\n');
    const packets = new Map<string, any>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length >= 4) {
        const packet_key = parts[0];
        if (packet_key && packet_key !== 'NULL') {
          packets.set(packet_key, {
            packet_key: packet_key,
            workspace_id: parts[1] && parts[1] !== 'NULL' ? parts[1] : null,
            ontology_version: parts[2] && parts[2] !== 'NULL' ? parts[2] : null,
            source_ref: parts[3] && parts[3] !== 'NULL' ? parts[3] : null
          });
        }
      }
    }

    console.log(`   ✅ Loaded ${packets.size} sample packets`);
    return packets;
  } catch (err) {
    console.error(`   ❌ Failed to export from Postgres: ${(err as Error).message}`);
    return new Map();
  }
}

// Step 3: Check Redis cache for packets
async function validateRedisCache(
  redis: Redis,
  postgres: Map<string, any>,
  verbose: boolean
): Promise<{
  hits: number;
  misses: number;
  validated: number;
  failed: number;
  staleness: { key: string; age_seconds: number }[];
}> {
  console.log(`\n2️⃣  Checking Redis cache hits...`);

  let hits = 0;
  let misses = 0;
  let validated = 0;
  let failed = 0;
  const staleness: { key: string; age_seconds: number }[] = [];
  const errors: string[] = [];

  let checked = 0;
  for (const [packetKey, pgData] of postgres.entries()) {
    checked++;
    if (checked % 20 === 0) {
      console.log(`      Checked ${checked}/${postgres.size}...`);
    }

    // Try multiple cache key patterns
    const cacheKey = `bifrost:packet:${packetKey}`;
    const cachedValue = await redis.get(cacheKey);

    if (cachedValue) {
      hits++;

      // Parse cached value (should be JSON)
      try {
        const cached = JSON.parse(cachedValue);

        // Verify key fields match
        const keyMatches =
          cached.packet_key === pgData.packet_key &&
          cached.workspace_id === pgData.workspace_id &&
          cached.ontology_version === pgData.ontology_version;

        if (keyMatches) {
          validated++;
          if (verbose) {
            console.log(`      ✅ ${packetKey}: cache valid`);
          }
        } else {
          failed++;
          errors.push(`${packetKey}: cache mismatch (keys don't match Postgres)`);
          if (verbose) {
            console.log(`      ❌ ${packetKey}: cache mismatch`);
          }
        }

        // Check TTL for staleness
        const ttl = await redis.ttl(cacheKey);
        if (ttl > 0) {
          staleness.push({ key: packetKey, age_seconds: ttl });
        }
      } catch (e) {
        failed++;
        errors.push(`${packetKey}: cache JSON parse error`);
      }
    } else {
      misses++;
      if (verbose) {
        console.log(`      ⚠️  ${packetKey}: cache miss`);
      }
    }
  }

  console.log(`   ✅ Cache hits: ${hits}/${postgres.size}`);
  console.log(`   ✅ Cache misses: ${misses}/${postgres.size}`);
  console.log(`   ✅ Validated: ${validated}`);
  console.log(`   ⚠️  Failed: ${failed}`);

  if (errors.length > 0 && verbose) {
    console.log(`\n   Errors:`);
    errors.slice(0, 5).forEach(e => console.log(`     - ${e}`));
    if (errors.length > 5) console.log(`     ... and ${errors.length - 5} more`);
  }

  return { hits, misses, validated, failed, staleness };
}

// Step 4: Measure Redis schema coverage
async function measureRedisCoverage(redis: Redis): Promise<{
  packet_key: number;
  workspace_id: number;
  ontology_version: number;
}> {
  console.log(`\n3️⃣  Scanning Redis keys for identity field coverage...`);

  try {
    const pattern = 'bifrost:packet:*';
    const keys = await redis.keys(pattern);

    console.log(`   📊 Found ${keys.length} bifrost:packet keys`);

    // Sample first 100 keys to check field presence
    const sample = keys.slice(0, 100);
    let packetKeyCount = 0;
    let workspaceIdCount = 0;
    let ontologyVersionCount = 0;

    for (const key of sample) {
      const cachedValue = await redis.get(key);
      if (cachedValue) {
        try {
          const cached = JSON.parse(cachedValue);
          if (cached.packet_key) packetKeyCount++;
          if (cached.workspace_id) workspaceIdCount++;
          if (cached.ontology_version) ontologyVersionCount++;
        } catch {
          // ignore parse errors
        }
      }
    }

    // Estimate full coverage (extrapolate from sample)
    const estimatedPacketKey = Math.round((packetKeyCount / sample.length) * keys.length);
    const estimatedWorkspaceId = Math.round((workspaceIdCount / sample.length) * keys.length);
    const estimatedOntologyVersion = Math.round((ontologyVersionCount / sample.length) * keys.length);

    console.log(`   ✅ Packet key coverage (estimated): ${estimatedPacketKey}/${keys.length}`);
    console.log(`   ✅ Workspace ID coverage (estimated): ${estimatedWorkspaceId}/${keys.length}`);
    console.log(`   ✅ Ontology version coverage (estimated): ${estimatedOntologyVersion}/${keys.length}`);

    return {
      packet_key: estimatedPacketKey,
      workspace_id: estimatedWorkspaceId,
      ontology_version: estimatedOntologyVersion
    };
  } catch (err) {
    console.error(`   ⚠️  Failed to measure coverage: ${(err as Error).message}`);
    return { packet_key: 0, workspace_id: 0, ontology_version: 0 };
  }
}

// Main execution
async function runValidation(): Promise<CacheValidationResult> {
  let redis: Redis | null = null;
  const result: CacheValidationResult = {
    timestamp: new Date().toISOString(),
    redis_connected: false,
    postgres_sample_size: 0,
    cache_keys_checked: 0,
    cache_hits: 0,
    cache_misses: 0,
    hit_rate: 0,
    validation_passed: 0,
    validation_failed: 0,
    staleness_samples: [],
    errors: [],
    coverage: { packet_key: 0, workspace_id: 0, ontology_version: 0 }
  };

  try {
    redis = await connectRedis();
    result.redis_connected = true;

    const postgres = exportPostgresSample(SAMPLE_SIZE);
    result.postgres_sample_size = postgres.size;

    if (postgres.size === 0) {
      console.log(`\n❌ No Postgres data available, aborting`);
      return result;
    }

    const cacheValidation = await validateRedisCache(redis, postgres, VERBOSE);
    result.cache_keys_checked = postgres.size;
    result.cache_hits = cacheValidation.hits;
    result.cache_misses = cacheValidation.misses;
    result.hit_rate = postgres.size > 0 ? (cacheValidation.hits / postgres.size) * 100 : 0;
    result.validation_passed = cacheValidation.validated;
    result.validation_failed = cacheValidation.failed;
    result.staleness_samples = cacheValidation.staleness.slice(0, 10);

    const coverage = await measureRedisCoverage(redis);
    result.coverage = coverage;

    console.log(`\n4️⃣  Validation Complete`);
    console.log(`   Cache hit rate: ${result.hit_rate.toFixed(1)}%`);
    console.log(`   Validation passed: ${result.validation_passed}`);
    console.log(`   Validation failed: ${result.validation_failed}`);
  } catch (err) {
    result.errors.push(`Validation failed: ${(err as Error).message}`);
  } finally {
    if (redis) {
      await redis.quit();
    }
  }

  return result;
}

// Main
(async () => {
  try {
    const result = await runValidation();

    writeFileSync(REPORT_FILE, JSON.stringify(result, null, 2));

    console.log(`\n📊 Redis Cache Validation Summary`);
    console.log(`   Connected: ${result.redis_connected ? 'yes' : 'no'}`);
    console.log(`   Sample size: ${result.postgres_sample_size}`);
    console.log(`   Cache hit rate: ${result.hit_rate.toFixed(1)}%`);
    console.log(`   Validation: ${result.validation_passed} passed, ${result.validation_failed} failed`);
    console.log(`   Coverage (estimated):`);
    console.log(`     - packet_key: ${result.coverage.packet_key} keys`);
    console.log(`     - workspace_id: ${result.coverage.workspace_id} keys`);
    console.log(`     - ontology_version: ${result.coverage.ontology_version} keys`);

    console.log(`\n✅ Report written to ${REPORT_FILE}`);

    const hasErrors = !result.redis_connected || result.validation_failed > 0;
    process.exit(hasErrors ? 1 : 0);
  } catch (err) {
    console.error(`\n❌ Validation failed: ${(err as Error).message}`);
    process.exit(1);
  }
})();
