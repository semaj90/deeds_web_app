#!/usr/bin/env node

/**
 * Valkey Semantic Index Creation
 *
 * Creates or updates Valkey search index for semantic vector storage.
 * Gracefully degrades if Valkey is offline (non-blocking).
 *
 * Usage:
 *   npm run valkey:index:create [--dry-run] [--verbose]
 */

import Redis from 'ioredis';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const VERBOSE = argv.includes('--verbose');

const VALKEY_HOST = process.env.VALKEY_HOST || 'localhost';
const VALKEY_PORT = parseInt(process.env.VALKEY_PORT || '6379', 10);
const VALKEY_PASSWORD = process.env.VALKEY_PASSWORD || 'redis';

/**
 * Health check Valkey
 */
async function checkValkeyHealth() {
  try {
    const redis = new Redis({
      host: VALKEY_HOST,
      port: VALKEY_PORT,
      password: VALKEY_PASSWORD,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
      connectTimeout: 2000,
    });

    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Main: Create semantic index
 */
async function createSemanticIndex() {
  console.log('[valkey:index:create] Starting...');

  const healthy = await checkValkeyHealth();
  if (!healthy) {
    console.warn(`[valkey:index:create] ⚠️  Valkey offline at ${VALKEY_HOST}:${VALKEY_PORT}`);
    console.warn('[valkey:index:create] Degraded mode: semantic index creation skipped');
    console.log('[valkey:index:create] This is non-blocking; vector searches will use fallback');
    return 0;  // Non-blocking, proceed with startup
  }

  if (DRY_RUN) {
    console.log('[valkey:index:create] DRY RUN: would create semantic index');
    console.log('  - Index name: semantic_vectors');
    console.log('  - Type: HASH');
    console.log('  - Fields:');
    console.log('    * vector (HNSW 768-dim FLOAT32 COSINE)');
    console.log('    * packet_key (TEXT)');
    console.log('    * feature_id (TEXT)');
    console.log('    * domain_class (TEXT)');
    return 0;
  }

  if (VERBOSE) {
    console.log('[valkey:index:create] ✓ Valkey healthy; creating semantic index...');
  }

  try {
    const redis = new Redis({
      host: VALKEY_HOST,
      port: VALKEY_PORT,
      password: VALKEY_PASSWORD,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });

    await redis.connect();

    // Drop old index if it exists (schema may have changed)
    try {
      await redis.call('FT.DROP', 'semantic_vectors');
      if (VERBOSE) {
        console.log('[valkey:index:create] ✓ Dropped old semantic index');
      }
    } catch (err) {
      if (!err.message?.includes('no such key')) {
        if (VERBOSE) {
          console.log('[valkey:index:create] Note: old index not found or already dropped');
        }
      }
    }

    // Create search index for semantic vectors (fresh)
    try {
      await redis.call('FT.CREATE', 'semantic_vectors', 'ON', 'HASH', 'SCHEMA',
        'vector', 'VECTOR', 'HNSW', '6', 'TYPE', 'FLOAT32', 'DIM', '768', 'DISTANCE_METRIC', 'COSINE',
        'packet_key', 'TEXT',
        'feature_id', 'TEXT',
        'domain_class', 'TEXT'
      );
      if (VERBOSE) {
        console.log('[valkey:index:create] ✓ Created new semantic index');
      }
    } catch (err) {
      throw err;
    }

    await redis.quit();
    console.log('[valkey:index:create] ✓ Semantic index ready');
    return 0;
  } catch (err) {
    console.error('[valkey:index:create] Error creating index:', err.message);
    return 1;
  }
}

// Execute
const exitCode = await createSemanticIndex();
process.exit(exitCode);
