#!/usr/bin/env node
/**
 * Phase 45 Indexer
 * ----------------
 * Scans Redis for embedding vectors and invokes the Phase 44
 * `/rank_from_redis` endpoint to generate relationship edges.
 *
 * Environment variables:
 *   REDIS_URL             redis:// connection string (default: redis://localhost:6379)
 *   PHASE44_URL           http base for Phase 44 (default: http://localhost:8001)
 *   INDEXER_BATCH_SIZE    number of keys per request (default: 100)
 *   INDEXER_TOP_K         recommendations to request from Phase 44 (default: 10)
 *   EMBEDDING_KEY_PREFIX  Redis key prefix to scan (default: embedding:)
 *   INDEXER_QUERY_KEY     Optional fixed query key; falls back to first batch key
 *   INDEXER_SCAN_COUNT    Redis SCAN count hint (default: 1000)
 */

import Redis from 'ioredis';
import fetch from 'node-fetch';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PHASE44_URL = process.env.PHASE44_URL || 'http://localhost:8001';
const BATCH_SIZE = Number.parseInt(process.env.INDEXER_BATCH_SIZE || '100', 10);
const TOP_K = Number.parseInt(process.env.INDEXER_TOP_K || '10', 10);
const EMBEDDING_KEY_PREFIX =
  process.env.EMBEDDING_KEY_PREFIX || 'embedding:';
const INDEXER_QUERY_KEY = process.env.INDEXER_QUERY_KEY || null;
const REDIS_SCAN_COUNT = Number.parseInt(
  process.env.INDEXER_SCAN_COUNT || '1000',
  10,
);

async function runIndexer() {
  console.log(`[Phase45] Indexer started @ ${new Date().toISOString()}`);
  console.log(`[Phase45] Redis URL:      ${REDIS_URL}`);
  console.log(`[Phase45] Phase44 URL:    ${PHASE44_URL}`);
  console.log(`[Phase45] Key prefix:     ${EMBEDDING_KEY_PREFIX}`);
  console.log(`[Phase45] Batch size:     ${BATCH_SIZE}`);
  console.log(`[Phase45] Top-K:          ${TOP_K}`);
  console.log(`[Phase45] SCAN count:     ${REDIS_SCAN_COUNT}`);
  if (INDEXER_QUERY_KEY) {
    console.log(`[Phase45] Query override: ${INDEXER_QUERY_KEY}`);
  }

  const redis = new Redis(REDIS_URL);
  redis.on('error', (err) => console.error('[Phase45] Redis error:', err));

  try {
    await redis.ping();
    console.log('[Phase45] Connected to Redis');
  } catch (connectionError) {
    console.error('[Phase45] Unable to contact Redis:', connectionError);
    redis.disconnect();
    process.exit(1);
  }

  let cursor = '0';
  let batchesProcessed = 0;
  let keysProcessed = 0;

  try {
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${EMBEDDING_KEY_PREFIX}*`,
        'COUNT',
        REDIS_SCAN_COUNT,
      );
      cursor = nextCursor;

      if (!keys.length) {
        continue;
      }

      console.log(
        `[Phase45] Redis scan returned ${keys.length} keys (cursor=${cursor}).`,
      );

      for (let index = 0; index < keys.length; index += BATCH_SIZE) {
        const batchKeys = keys.slice(index, index + BATCH_SIZE);
        const queryKey = INDEXER_QUERY_KEY || batchKeys[0];
        batchesProcessed += 1;

        if (!queryKey) {
          console.warn(
            `[Phase45] Batch ${batchesProcessed} skipped (no query key available).`,
          );
          continue;
        }

        if (!batchKeys.includes(queryKey)) {
          batchKeys.push(queryKey);
        }

        console.log(
          `[Phase45] Batch ${batchesProcessed}: sending ${batchKeys.length} keys (query=${queryKey}).`,
        );

        try {
          const response = await fetch(`${PHASE44_URL}/rank_from_redis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              keys: batchKeys,
              query_key: queryKey,
              top_k: TOP_K,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              `[Phase45] Batch ${batchesProcessed} failed: ${response.status} ${errorText}`,
            );
            continue;
          }

          const result = await response.json();
          console.log(
            `[Phase45] Batch ${batchesProcessed} complete: ${result.id} received ${result.recommendations.length} recommendations.`,
          );
          keysProcessed += batchKeys.length;
        } catch (fetchError) {
          console.error(
            `[Phase45] Failed to call Phase 44 for batch ${batchesProcessed}:`,
            fetchError,
          );
        }
      }
    } while (cursor !== '0');

    console.log(
      `[Phase45] Indexer completed. Batches=${batchesProcessed}, Keys processed=${keysProcessed}`,
    );
  } catch (err) {
    console.error('[Phase45] Indexer encountered an unrecoverable error:', err);
  } finally {
    await redis.quit();
    console.log('[Phase45] Redis connection closed.');
  }
}

runIndexer();
