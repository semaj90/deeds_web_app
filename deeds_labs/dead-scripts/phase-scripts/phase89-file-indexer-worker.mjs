#!/usr/bin/env node
/**
 * Phase 89: File Indexer Worker
 * Context7 MCP Pattern - Node.js cluster worker for processing indexing jobs from Redis queue
 */

import fs from 'fs/promises';
import Redis from 'ioredis';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const QUEUE_KEY = process.env.QUEUE_KEY || 'phase89:indexing:queue';
const PROGRESS_KEY = 'phase89:indexing:progress';
const WORKER_ID = process.env.WORKER_ID || process.pid;

const redis = new Redis(REDIS_URL);
const CODE_INDEXER_URL = 'http://localhost:8082';

/**
 * Process a single file indexing job
 */
async function processFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Call Go indexer for parsing
    const response = await fetch(`${CODE_INDEXER_URL}/analyze-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content })
    });

    if (!response.ok) {
      throw new Error(`Indexer returned ${response.status}`);
    }

    const result = await response.json();

    // Store result in Redis (30-day TTL)
    const resultKey = `phase89:indexing:result:${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`;
    await redis.set(resultKey, JSON.stringify(result), 'EX', 2592000);

    return { success: true, file: filePath, result };
  } catch (error) {
    console.error(`❌ Worker ${WORKER_ID} failed to process ${filePath}:`, error.message);
    return { success: false, file: filePath, error: error.message };
  }
}

/**
 * Update progress in Redis
 */
async function updateProgress(processed, total, success, failed) {
  const progress = {
    workerId: WORKER_ID,
    processed,
    total,
    success,
    failed,
    percentage: Math.round((processed / total) * 100),
    timestamp: new Date().toISOString()
  };

  await redis.hset(PROGRESS_KEY, WORKER_ID, JSON.stringify(progress));
}

/**
 * Main worker loop
 */
async function work() {
  console.log(`🚀 Worker ${WORKER_ID} started, waiting for jobs from ${QUEUE_KEY}`);

  let processed = 0;
  let success = 0;
  let failed = 0;

  while (true) {
    try {
      // BLPOP with 5-second timeout
      const result = await redis.blpop(QUEUE_KEY, 5);

      if (!result) {
        // Queue empty, check if we should exit
        const queueLength = await redis.llen(QUEUE_KEY);
        if (queueLength === 0) {
          console.log(`✅ Worker ${WORKER_ID} finished, queue empty`);
          break;
        }
        continue;
      }

      const [_key, filePath] = result;
      console.log(`📄 Worker ${WORKER_ID} processing: ${filePath}`);

      const outcome = await processFile(filePath);
      processed++;

      if (outcome.success) {
        success++;
      } else {
        failed++;
      }

      // Update progress every 10 files
      if (processed % 10 === 0) {
        const total = await redis.get('phase89:indexing:total') || 0;
        await updateProgress(processed, parseInt(total), success, failed);
        console.log(`📊 Worker ${WORKER_ID} progress: ${processed} processed, ${success} success, ${failed} failed`);
      }

    } catch (error) {
      console.error(`❌ Worker ${WORKER_ID} error:`, error);
      failed++;
    }
  }

  // Final progress update
  const total = await redis.get('phase89:indexing:total') || processed;
  await updateProgress(processed, parseInt(total), success, failed);

  console.log(`\n🏁 Worker ${WORKER_ID} final stats:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Success: ${success}`);
  console.log(`   Failed: ${failed}`);

  await redis.quit();
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(`\n⏹️  Worker ${WORKER_ID} shutting down gracefully...`);
  await redis.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(`\n⏹️  Worker ${WORKER_ID} shutting down gracefully...`);
  await redis.quit();
  process.exit(0);
});

// Start worker
work().catch(error => {
  console.error('💥 Worker fatal error:', error);
  process.exit(1);
});
