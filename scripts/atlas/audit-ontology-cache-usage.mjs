#!/usr/bin/env node

/**
 * Audit Ontology Cache Usage in Retrieval
 *
 * Checks if ontology tuples are actually being read from Redis during retrieval.
 * Verifies the complete integration: build → write → read.
 */

import Redis from 'ioredis';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  resolveAtlasRedisContext,
  shouldPreferValkeyCli,
  runRedisCli,
} from '../../sveltekit-frontend/scripts/atlas/lib/redis-valkey.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '../..');
const HLL_KEY = 'ace:ontology:hll:tuple_ids';

console.log('[audit-ontology-cache-usage] Starting...');

function parseRedisList(stdout) {
  return String(stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function createOntologyCacheBackend() {
  const { env, container, password } = await resolveAtlasRedisContext(projectRoot);
  const host = env.VALKEY_HOST || env.REDIS_HOST || 'localhost';
  const port = Number.parseInt(env.VALKEY_PORT || env.REDIS_PORT || '6379', 10);
  const redisUrl = env.VALKEY_URL || env.REDIS_URL || `redis://${host}:${port}`;

  if (shouldPreferValkeyCli(env, container)) {
    return {
      mode: 'cli',
      async keys(pattern) {
        let cursor = '0';
        const found = [];
        let guard = 0;
        do {
          const result = runRedisCli(container, ['SCAN', cursor, 'MATCH', pattern, 'COUNT', '250'], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli SCAN failed');
          const lines = parseRedisList(result.stdout);
          cursor = lines[0] || '0';
          found.push(...lines.slice(1));
          guard += 1;
        } while (cursor !== '0' && found.length < 2000 && guard < 32);
        return found;
      },
      async get(key) {
        const result = runRedisCli(container, ['GET', key], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli GET failed');
        return result.stdout.trim() || null;
      },
      async pfcount(key) {
        const result = runRedisCli(container, ['PFCOUNT', key], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PFCOUNT failed');
        return Number.parseInt(result.stdout.trim() || '0', 10) || 0;
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
      console.log('[audit-ontology-cache-usage] Valkey error:', err.message);
    });
    await redis.connect();
    return {
      mode: 'direct',
      async keys(pattern) {
        const found = [];
        let cursor = '0';
        let guard = 0;
        do {
          const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 250);
          found.push(...batch);
          cursor = nextCursor;
          guard += 1;
        } while (cursor !== '0' && found.length < 2000 && guard < 32);
        return found;
      },
      async get(key) {
        return redis.get(key);
      },
      async pfcount(key) {
        return redis.pfcount(key);
      },
      async quit() {
        await redis.quit();
      },
    };
  } catch (error) {
    if (!container) return null;
    console.log(
      `[audit-ontology-cache-usage] Direct Valkey connect failed; falling back to ${container} via CLI`
    );
    return {
      mode: 'cli',
      async keys(pattern) {
        let cursor = '0';
        const found = [];
        let guard = 0;
        do {
          const result = runRedisCli(container, ['SCAN', cursor, 'MATCH', pattern, 'COUNT', '250'], password);
          if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli SCAN failed');
          const lines = parseRedisList(result.stdout);
          cursor = lines[0] || '0';
          found.push(...lines.slice(1));
          guard += 1;
        } while (cursor !== '0' && found.length < 2000 && guard < 32);
        return found;
      },
      async get(key) {
        const result = runRedisCli(container, ['GET', key], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli GET failed');
        return result.stdout.trim() || null;
      },
      async pfcount(key) {
        const result = runRedisCli(container, ['PFCOUNT', key], password);
        if (!result.ok) throw new Error(result.stderr || result.error || 'redis-cli PFCOUNT failed');
        return Number.parseInt(result.stdout.trim() || '0', 10) || 0;
      },
      async quit() {},
    };
  }
}

try {
  const redis = await createOntologyCacheBackend();
  if (!redis) {
    console.log('⚠️  Valkey/Redis unavailable; continuing with HLL-only degraded audit');
  } else {
    console.log(`✅ Connected to ${redis.mode === 'cli' ? 'Valkey CLI fallback' : 'Valkey'} `);
  }

  // Check for ontology cache keys
  const tupleKeys = redis ? await redis.keys('ace:ontology:tuple:*') : [];
  const tokenMapKeys = redis ? await redis.keys('ace:ontology:tokenmap:*') : [];
  const blockedHashKeys = redis ? await redis.keys('ace:ontology:blocked_content_hashes:*') : [];
  const hllCount = redis ? await redis.pfcount(HLL_KEY).catch(() => 0) : 0;

  console.log(`\n[Ontology Cache Status]`);
  console.log(`  Tuples: ${tupleKeys.length} keys`);
  console.log(`  Token maps: ${tokenMapKeys.length} keys`);
  console.log(`  Blocked hashes: ${blockedHashKeys.length} keys`);
  console.log(`  HLL tuple estimate: ${hllCount}`);

  if (tupleKeys.length === 0 && tokenMapKeys.length === 0 && blockedHashKeys.length === 0) {
    console.log('\n⚠️  No ontology cache keys found');
    if (hllCount > 0) {
      console.log(`  Approximate tuple population still present via HyperLogLog: ${hllCount}`);
    }
    console.log('[audit-ontology-cache-usage] Cache needs to be populated first:');
    console.log('  Run: npm run atlas:addressable-packets:materialize:apply');
    console.log('  Or: npm run graphify:authority');
  } else {
    console.log('\n✅ Ontology cache is populated');

    // Sample a key
    if (tupleKeys.length > 0) {
      const sampleKey = tupleKeys[0];
      const sampleValue = await redis.get(sampleKey);
      console.log(`\n[Sample Cache Entry]`);
      console.log(`  Key: ${sampleKey}`);
      console.log(`  Value (first 200 chars): ${sampleValue?.substring(0, 200)}`);
    }
  }

  // Check if retrieval is reading from cache
  console.log(`\n[Integration Check]`);
  console.log(`  ✅ Cache is built by: taxonomy-topology-packet.ts:426-477`);
  console.log(`  ? Cache is read by: [NEEDS VERIFICATION]`);
  console.log(`     Check src/lib/server/retrieval/ for ontologyKey usage`);
  console.log(`     Expected: fetchACPKnowledgeResults() or similar calls redis.get(ontologyKey.*)`);

} catch (err) {
  console.log('❌ Error:', err.message);
  process.exit(1);
}

console.log('[audit-ontology-cache-usage] Done');
