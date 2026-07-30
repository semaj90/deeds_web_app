#!/usr/bin/env node

/**
 * Minimal Ontology Cache Populator
 *
 * Takes the materialized addressable packets and populates Redis ontology cache
 * with sample tuples for testing/demonstration.
 *
 * This is a proof-of-concept that doesn't wait for Neo4j PageRank.
 * Production: Run graphify:authority instead (which handles full enrichment).
 */

import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveAtlasRedisContext,
  shouldPreferValkeyCli,
  runRedisCli,
} from './lib/redis-valkey.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const HLL_KEY = 'ace:ontology:hll:tuple_ids';

function parseRedisList(stdout) {
  return String(stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function createOntologyCacheBackend() {
  const { env, container, password } = await resolveAtlasRedisContext(REPO_ROOT);
  const host = env.VALKEY_HOST || env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(env.VALKEY_PORT || env.REDIS_PORT || '6379', 10);
  const redisUrl = env.VALKEY_URL || env.REDIS_URL || `redis://${host}:${port}`;

  if (shouldPreferValkeyCli(env, container)) {
    return {
      mode: 'cli',
      async setex(key, ttl, value) {
        const result = runRedisCli(container, ['SETEX', key, String(ttl), value], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli SETEX failed');
      },
      async pfadd(key, ...members) {
        const result = runRedisCli(container, ['PFADD', key, ...members], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PFADD failed');
      },
      async quit() {},
    };
  }

  try {
    const redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      password,
    });
    redis.on('error', (err) => {
      console.error('[populate-ontology-cache] Valkey error:', err.message);
    });
    await redis.connect();
    return {
      mode: 'direct',
      async setex(key, ttl, value) {
        await redis.setex(key, ttl, value);
      },
      async pfadd(key, ...members) {
        await redis.pfadd(key, ...members);
      },
      async quit() {
        await redis.quit();
      },
    };
  } catch (error) {
    if (!container) return null;
    console.log(
      `[populate-ontology-cache] Direct Valkey connect failed; falling back to ${container} via CLI`
    );
    return {
      mode: 'cli',
      async setex(key, ttl, value) {
        const result = runRedisCli(container, ['SETEX', key, String(ttl), value], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli SETEX failed');
      },
      async pfadd(key, ...members) {
        const result = runRedisCli(container, ['PFADD', key, ...members], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PFADD failed');
      },
      async quit() {},
    };
  }
}

async function main() {
  try {
    const redis = await createOntologyCacheBackend();
    if (!redis) {
      console.log('⚠️  Valkey/Redis unavailable; skipping live cache writes');
      return;
    }
    console.log(`✅ Connected to ${redis.mode === 'cli' ? 'Valkey CLI fallback' : 'Valkey'}`);

    // Read materialized packets
    const manifestPath = path.join(REPO_ROOT, '.tmp', 'addressable-packets.manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.log('⚠️  Manifest not found. Run: npm run atlas:addressable-packets:materialize:apply');
      await redis.quit();
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    console.log(`📦 Loaded manifest: ${manifest.addressableRows} packets`);

    // Create sample ontology tuples (proof-of-concept)
    const sampleTuples = [
      {
        tupleId: 'ontology:001',
        sourceRef: 'src/lib/server/auth.ts',
        featureId: 'auth.sessions',
        relation: 'HAS_ONTOLOGY_TAG',
        label: 'Session Management',
        labelKind: 'ontology',
        ontologyIds: ['auth-001', 'session-001'],
        conceptIds: ['concept-auth', 'concept-session'],
        evidenceState: 'ACTIVE_VERIFIED',
        trustTier: 'canonical',
      },
      {
        tupleId: 'ontology:002',
        sourceRef: 'src/lib/server/db/client.ts',
        featureId: 'db.connection',
        relation: 'HAS_ONTOLOGY_TAG',
        label: 'Database Connectivity',
        labelKind: 'ontology',
        ontologyIds: ['db-001', 'connection-001'],
        conceptIds: ['concept-db', 'concept-connection'],
        evidenceState: 'ACTIVE_VERIFIED',
        trustTier: 'canonical',
      },
      {
        tupleId: 'ontology:003',
        sourceRef: 'src/lib/server/cache-keys.ts',
        featureId: 'cache.redis',
        relation: 'HAS_ONTOLOGY_TAG',
        label: 'Redis Cache Layer',
        labelKind: 'ontology',
        ontologyIds: ['cache-001', 'redis-001'],
        conceptIds: ['concept-cache', 'concept-redis'],
        evidenceState: 'ACTIVE_VERIFIED',
        trustTier: 'canonical',
      },
    ];

    // Write tuples to Redis
    let written = 0;
    const ttlSeconds = 6 * 60 * 60; // 6 hours

    for (const tuple of sampleTuples) {
      const key = `ace:ontology:tuple:${tuple.tupleId}`;
      await redis.setex(key, ttlSeconds, JSON.stringify(tuple));
      await redis.pfadd(HLL_KEY, tuple.tupleId);
      written++;
      console.log(`  ✓ Wrote ${key}`);
    }

    // Write token map index (maps feature_id → tuple keys)
    const tokenMapKey = `ace:ontology:tokenmap:feature:auth.sessions`;
    const tokenMap = {
      schemaVersion: 'ontology-token-map.v1',
      featureId: 'auth.sessions',
      tupleCount: 1,
      tupleKeys: ['ace:ontology:tuple:ontology:001'],
      canonicalLabels: ['Session Management'],
      blockedContentHashes: [],
      createdAt: new Date().toISOString(),
    };
    await redis.setex(tokenMapKey, ttlSeconds, JSON.stringify(tokenMap));
    console.log(`  ✓ Wrote token map for auth.sessions`);

    // Write blocked hashes (empty set for now)
    const blockedHashesKey = `ace:ontology:blocked_content_hashes:workspace-v1`;
    const blockedHashes = {
      schemaVersion: 'ontology-blocked-hashes.v1',
      workspaceRevision: 'workspace-v1',
      blockedContentHashes: [],
      updatedAt: new Date().toISOString(),
    };
    await redis.setex(blockedHashesKey, ttlSeconds, JSON.stringify(blockedHashes));
    console.log(`  ✓ Wrote blocked hashes index`);
    console.log(`  ✓ Updated HyperLogLog summary: ${HLL_KEY}`);

    console.log(`\n✅ Ontology cache population complete`);
    console.log(`  Tuples written: ${written}`);
    console.log(`  TTL: ${ttlSeconds}s (6 hours)`);
    console.log(`\n🔍 Verify with: npm run audit:ontology-cache:usage`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

main();
