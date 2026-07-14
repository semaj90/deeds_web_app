#!/usr/bin/env node

/**
 * Lane 2: Embedding Coverage Backfill — True Batch API
 *
 * Goal: Fill content_embedding_384 column via Ollama embeddinggemma with real batching
 * Batch strategy: 32-64 packets per HTTP request (not per packet)
 * Claim-and-process: atomic row claiming with SKIP LOCKED to prevent duplicates
 *
 * Usage:
 *   node backfill-embedding-lane.mjs [--dry-run] [--max-packets=5000] [--batch-size=32] [--concurrency=1] [--worker-id=embedding-01] [--resume]
 */

import pg from 'pg';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const maxPacketsArg = args.find(a => a.startsWith('--max-packets='));
const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
const concurrencyArg = args.find(a => a.startsWith('--concurrency='));
const workerIdArg = args.find(a => a.startsWith('--worker-id='));
const resume = args.includes('--resume');

const maxPackets = maxPacketsArg ? parseInt(maxPacketsArg.split('=')[1]) : 5000;
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 32;
const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1]) : 1;
const workerId = workerIdArg ? workerIdArg.split('=')[1] : `embedding-${Date.now()}`;

const { Pool } = pg;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

const OLLAMA_URL = 'http://127.0.0.1:11434';
const MODEL = 'embeddinggemma';
const EMBEDDING_DIM = 384;
const MODEL_REVISION = '20260711';
const PREPROCESSING_VERSION = '1';

/**
 * Generate idempotency key for an embedding
 */
function embeddingKey({ model, modelRevision, dimensions, contentHash, preprocessingVersion }) {
  const key = `${model}:${modelRevision}:${dimensions}:${contentHash}:${preprocessingVersion}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Hash content to detect duplicates
 */
function hashContent(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Embed batch of texts via Ollama /api/embed with array input
 */
async function embedBatch(texts) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        input: texts,
        dimensions: EMBEDDING_DIM,
        truncate: true,
        keep_alive: '30m',
      }),
      timeout: 120000, // 2 min timeout for large batches
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama embed failed: ${response.status} ${body}`);
    }

    // Parse embedding response (small JSON, native parser is fine)
    const result = await response.json();

    if (!Array.isArray(result.embeddings)) {
      throw new Error('Ollama returned no embeddings array');
    }

    if (result.embeddings.length !== texts.length) {
      throw new Error(
        `Embedding count mismatch: expected ${texts.length}, got ${result.embeddings.length}`,
      );
    }

    // Validate dimensions
    for (const emb of result.embeddings) {
      if (!Array.isArray(emb) || emb.length !== EMBEDDING_DIM) {
        throw new Error(`Invalid embedding dimension: expected ${EMBEDDING_DIM}, got ${emb.length}`);
      }
    }

    return result.embeddings.map(emb => ({ embedding: emb, error: null }));
  } catch (err) {
    throw new Error(`Embedding batch failed: ${err.message}`);
  }
}

/**
 * Claim a batch of packets for embedding (atomic, SKIP LOCKED)
 */
async function claimPackets(batchSize, workerId) {
  const result = await pool.query(
    `WITH candidates AS (
      SELECT packet_id, packet_key, source_ref, sha256, summary, payload->>'title' as title
      FROM atlas_packets
      WHERE content_embedding_384 IS NULL
        AND (
          embedding_status IS NULL
          OR embedding_status = 'pending'
          OR (
            embedding_status = 'processing'
            AND embedding_claimed_at < NOW() - INTERVAL '20 minutes'
          )
        )
      ORDER BY packet_id
      FOR UPDATE SKIP LOCKED
      LIMIT $1
    )
    UPDATE atlas_packets p
    SET
      embedding_status = 'processing',
      embedding_claimed_at = NOW(),
      embedding_claimed_by = $2,
      embedding_timestamp = NOW()
    FROM candidates c
    WHERE p.packet_id = c.packet_id
    RETURNING
      p.packet_id,
      p.packet_key,
      p.source_ref,
      c.sha256,
      c.summary,
      c.title`,
    [batchSize, workerId],
  );

  return result.rows;
}

/**
 * Write embedded vectors to Postgres (idempotent)
 */
async function writeEmbeddingBatch(rows, vectors) {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const vector = vectors[i];

    try {
      if (vector.error) {
        // Mark as failed
        await pool.query(
          `UPDATE atlas_packets
           SET embedding_status = 'failed', embedding_timestamp = NOW()
           WHERE packet_id = $1`,
          [row.packet_id],
        );
        failed++;
        continue;
      }

      // Compute idempotency key
      const idempKey = embeddingKey({
        model: MODEL,
        modelRevision: MODEL_REVISION,
        dimensions: EMBEDDING_DIM,
        contentHash: row.sha256,
        preprocessingVersion: PREPROCESSING_VERSION,
      });

      // Write vector
      await pool.query(
        `UPDATE atlas_packets
         SET
           content_embedding_384 = $1::vector(384),
           embedding_status = 'success',
           embedding_version = $2,
           embedding_timestamp = NOW(),
           updated_at = NOW()
         WHERE packet_id = $3`,
        [
          JSON.stringify(vector.embedding),
          idempKey,
          row.packet_id,
        ],
      );
      success++;
    } catch (err) {
      failed++;
      console.error(`    ❌ Failed to write ${row.packet_key}: ${err.message}`);
    }
  }

  return { success, failed };
}

/**
 * Verify addon availability at startup (informational only)
 */
async function verifyAddonStartup() {
  console.log('🔍 Verifying native addon (simdjson + LibTorch)...');
  try {
    // Use createRequire for ESM context
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const addon = require('../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
    console.log('✓ Addon loaded successfully');
    console.log(`  - SIMD JSON: ${typeof addon.simdJsonParse === 'function' ? 'yes' : 'no'}`);
    console.log(`  - LibTorch: ${typeof addon.libtorchCosineSimilarity === 'function' ? 'yes' : 'no'}`);
    return true;
  } catch (err) {
    console.log(`⚠️  Addon not available (expected in some environments)`);
    console.log('   Native JSON parsing will be used (acceptable for small responses)');
    return false;
  }
}

/**
 * Main backfill loop
 */
async function backfillEmbeddings() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        Lane 2: Embedding Coverage Backfill (Batched API)   ║');
  console.log(`║        Worker: ${workerId}${' '.repeat(34 - workerId.length)}║`);
  console.log(`║        Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}${' '.repeat(36 - (dryRun ? 'DRY-RUN' : 'APPLY').length)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Verify addon at startup (informational only, not blocking)
    await verifyAddonStartup();
    console.log();

    console.log('🔗 Connecting to Postgres...');
    await pool.query('SELECT 1');
    console.log('✓ Connected\n');

    console.log(`🧠 Testing Ollama batch embedding at ${OLLAMA_URL}/api/embed...`);
    try {
      const testResult = await embedBatch(['test']);
      if (testResult[0].embedding.length === EMBEDDING_DIM) {
        console.log(`✓ Ollama working (dimension: ${EMBEDDING_DIM})\n`);
      } else {
        throw new Error(`Wrong dimension: got ${testResult[0].embedding.length}, expected ${EMBEDDING_DIM}`);
      }
    } catch (err) {
      console.error(`❌ Ollama not available: ${err.message}\n`);
      process.exit(1);
    }

    // Check coverage before starting
    const coverageBefore = await pool.query(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE content_embedding_384 IS NOT NULL) AS embedded
       FROM atlas_packets`,
    );
    const { total, embedded } = coverageBefore.rows[0];
    const coveragePct = ((embedded / total) * 100).toFixed(1);
    console.log(`📊 Current coverage: ${embedded}/${total} (${coveragePct}%)\n`);

    let processedTotal = 0;
    let successTotal = 0;
    let failedTotal = 0;
    const startTime = Date.now();

    console.log(`🚀 Starting backfill loop (max ${maxPackets} packets, batch ${batchSize}, worker ${workerId})...\n`);

    while (processedTotal < maxPackets) {
      // Claim batch atomically
      const batch = await claimPackets(batchSize, workerId);

      if (batch.length === 0) {
        console.log('✅ No more packets to process.\n');
        break;
      }

      // Build embedding texts
      const texts = batch.map(p => (p.summary || p.title || 'No text available').substring(0, 2000));

      console.log(
        `  [${processedTotal}/${maxPackets}] Embedding ${batch.length} packets (batch size: ${batchSize})...`,
      );

      // Embed batch via Ollama (ONE HTTP request for all texts)
      const startBatchTime = Date.now();
      let vectors;
      try {
        vectors = await embedBatch(texts);
      } catch (err) {
        console.error(`    ❌ Batch embedding failed: ${err.message}`);
        // Mark all claimed rows as pending (release claim)
        for (const row of batch) {
          await pool.query(
            `UPDATE atlas_packets SET embedding_status = 'pending' WHERE packet_id = $1`,
            [row.packet_id],
          );
        }
        failedTotal += batch.length;
        continue;
      }

      // Write embeddings to Postgres
      if (!dryRun) {
        const { success, failed } = await writeEmbeddingBatch(batch, vectors);
        successTotal += success;
        failedTotal += failed;
      } else {
        successTotal += batch.length;
      }

      processedTotal += batch.length;

      const batchDuration = ((Date.now() - startBatchTime) / 1000).toFixed(1);
      const throughput = (batch.length / (Date.now() - startBatchTime)) * 1000; // packets/sec
      console.log(`      ✓ ${batch.length} packets in ${batchDuration}s (${throughput.toFixed(1)} pkt/s)\n`);
    }

    // Final summary
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgThroughput = (processedTotal / (Date.now() - startTime)) * 1000;

    console.log('='.repeat(60));
    console.log('LANE 2 BACKFILL SUMMARY\n');
    console.log(`  Processed:      ${processedTotal}`);
    console.log(`  Success:        ${successTotal}`);
    console.log(`  Failed:         ${failedTotal}`);
    console.log(`  Duration:       ${totalDuration}s`);
    console.log(`  Throughput:     ${avgThroughput.toFixed(1)} packets/sec`);
    console.log(`  Mode:           ${dryRun ? 'DRY-RUN' : 'APPLIED'}`);
    console.log('='.repeat(60) + '\n');

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ FATAL ERROR:', err.message);
    await pool.end();
    process.exit(1);
  }
}

backfillEmbeddings();
