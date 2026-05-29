#!/usr/bin/env node
/**
 * duplicate-detector.mjs
 *
 * Prevent concurrent execution of pipeline stages using Redis distributed locks.
 * Ensures only one instance of graphify:deep:neo4j, graphify:gds, etc. runs at a time.
 *
 * Usage:
 *   node scripts/lib/duplicate-detector.mjs graphify:deep:neo4j 300
 *   (acquires lock for 300 seconds, then exits — parent script runs)
 *
 * Integration:
 *   "graphify:deep:neo4j": "node scripts/lib/duplicate-detector.mjs graphify:deep:neo4j 300 && node scripts/graphify/deep-imports.mjs"
 */

import Redis from 'ioredis';
import crypto from 'crypto';
import { resolve } from 'node:path';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const STAGE_NAME = process.argv[2] || 'unknown-stage';
const TTL_SECONDS = parseInt(process.argv[3] || '300', 10);

let redis;

class DuplicateDetector {
  constructor(redisUrl) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
  }

  async connect() {
    try {
      await this.redis.connect();
      await this.redis.ping();
    } catch (err) {
      // Redis unavailable; allow script to run without locking
      console.warn(`[WARN] Redis unavailable: ${err.message}. Proceeding without lock.`);
      this.redis = null;
    }
  }

  async acquireLock(stageName, ttlSeconds) {
    if (!this.redis) return { lockKey: null, lockId: null };

    const lockKey = `pipeline:lock:${stageName}`;
    const lockId = crypto.randomUUID();

    try {
      // SET NX EX — atomic set-if-not-exists with expiration
      const acquired = await this.redis.set(lockKey, lockId, 'EX', ttlSeconds, 'NX');

      if (!acquired) {
        const owner = await this.redis.get(lockKey);
        const msg =
          `[ERROR] Pipeline stage "${stageName}" already running (lock: ${owner}).\n` +
          `Wait ${ttlSeconds}s or force release:\n` +
          `  redis-cli DEL ${lockKey}\n` +
          `Exit: 1`;
        console.error(msg);
        process.exit(1);
      }

      console.log(`[OK] Lock acquired: ${stageName} (TTL: ${ttlSeconds}s, ID: ${lockId.slice(0, 8)}...)`);
      return { lockKey, lockId };
    } catch (err) {
      console.warn(`[WARN] Lock acquisition failed: ${err.message}. Proceeding without lock.`);
      return { lockKey: null, lockId: null };
    }
  }

  async releaseLock(lockKey, lockId) {
    if (!this.redis || !lockKey) return;

    try {
      // Only release if we still own the lock (prevent cross-process interference)
      const owner = await this.redis.get(lockKey);
      if (owner === lockId) {
        await this.redis.del(lockKey);
        console.log(`[OK] Lock released: ${lockKey}`);
      } else {
        console.warn(`[WARN] Lock ownership mismatch; not releasing: ${lockKey}`);
      }
    } catch (err) {
      console.warn(`[WARN] Lock release failed: ${err.message}`);
    }
  }

  async disconnect() {
    if (this.redis) {
      await this.redis.disconnect();
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const detector = new DuplicateDetector(REDIS_URL);
  await detector.connect();

  const { lockKey, lockId } = await detector.acquireLock(STAGE_NAME, TTL_SECONDS);

  // Gracefully release lock on process exit (normal or error)
  const cleanup = async () => {
    await detector.releaseLock(lockKey, lockId);
    await detector.disconnect();
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    cleanup().then(() => process.exit(0));
  });

  // Exit successfully — parent script will run
  process.exit(0);
}

main().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});