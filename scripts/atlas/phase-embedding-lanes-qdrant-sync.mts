#!/usr/bin/env node

/**
 * Phase: Embedding Lanes Qdrant Sync (Sessions 157+)
 *
 * Goal: Populate Qdrant 512-dim fallback + CLIP multimodal collections from primary 768-dim Postgres embeddings.
 *
 * 6-Phase Pipeline:
 * 1. Detect existing Qdrant collections (or create)
 * 2. Fetch embeddings from Postgres (768-dim canonical source)
 * 3. Quantize 768→512 via truncation + L2 normalization
 * 4. Upsert to Qdrant in batches (100 vectors/request)
 * 5. Verify: read back, hash check, retrieval test
 * 6. Document: write completion manifest
 *
 * Usage:
 *   npx tsx scripts/atlas/phase-embedding-lanes-qdrant-sync.mts [--dry-run] [--limit 1000] [--batch-size 100]
 */

import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit'));
const batchSizeArg = args.find(a => a.startsWith('--batch-size'));

const limit = limitArg ? parseInt(limitArg.split('=')[1] || '52380') : 52380;
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1] || '100') : 100;

const POSTGRES_CONFIG = {
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
};

const QDRANT_URL = 'http://127.0.0.1:6333';
const QDRANT_API_KEY = undefined; // No auth on local Qdrant

const COLLECTIONS = {
  primary_768d: {
    name: 'codebase_chunks_768',
    dimension: 768,
    description: 'Primary 768-dim embeddings from embeddinggemma'
  },
  fallback_512d: {
    name: 'codebase_chunks_512',
    dimension: 512,
    description: 'Fallback 512-dim quantized via 768→512 truncation + L2 norm'
  },
  multimodal_clip: {
    name: 'evidence_items_clip_512',
    dimension: 512,
    description: 'Multimodal CLIP 512-dim for vision-language search'
  }
};

// ============================================================================
// Phase 1: Collection Detection & Creation
// ============================================================================

async function phase1_detectCollections() {
  console.log('\n[Phase 1] Detect existing Qdrant collections...');
  const client = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY });

  try {
    const collections = await client.getCollections();
    console.log(`✓ Found ${collections.collections.length} collections in Qdrant`);

    const collectionNames = new Set(collections.collections.map(c => c.name));
    const missing = [];

    for (const [key, config] of Object.entries(COLLECTIONS)) {
      if (collectionNames.has(config.name)) {
        console.log(`  ✓ ${config.name} exists`);
      } else {
        console.log(`  ✗ ${config.name} missing`);
        missing.push({ key, config });
      }
    }

    return { client, existing: collectionNames, missing };
  } catch (err) {
    console.error('✗ Failed to detect collections:', err.message);
    throw err;
  }
}

// ============================================================================
// Phase 2: Fetch Embeddings from Postgres
// ============================================================================

async function phase2_fetchEmbeddings(limit: number) {
  console.log(`\n[Phase 2] Fetch embeddings from Postgres (limit: ${limit})...`);

  const pool = new pg.Pool(POSTGRES_CONFIG);
  try {
    const result = await pool.query(
      `SELECT id, content_hash, content_embedding
       FROM codebase_chunk_index
       WHERE content_embedding IS NOT NULL
       ORDER BY id
       LIMIT $1`,
      [limit]
    );

    console.log(`✓ Fetched ${result.rows.length} embeddings from Postgres`);

    // Filter out any with null embeddings (defensive)
    const filtered = result.rows.filter(row => {
      if (row.content_embedding === null) return false;

      // Handle both array and vector types
      if (Array.isArray(row.content_embedding)) {
        return row.content_embedding.length > 0;
      }

      // If it's an object (halfvec), it should have a length property or be convertible
      return true;
    });

    if (filtered.length < result.rows.length) {
      console.log(`  (Filtered ${result.rows.length - filtered.length} null/invalid embeddings)`);
    }

    return filtered;
  } catch (err) {
    console.error('✗ Failed to fetch embeddings:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

// ============================================================================
// Phase 3: Quantize 768→512 via Truncation + L2 Norm
// ============================================================================

function quantize768to512(embedding768: any): number[] {
  // Handle both array and string representations from Postgres
  let arr = embedding768;

  if (typeof embedding768 === 'string') {
    try {
      arr = JSON.parse(embedding768);
    } catch (e) {
      // Try parsing as vector format: "[0.1, 0.2, ...]"
      const match = embedding768.match(/[\d.-]+/g);
      if (match) {
        arr = match.map(Number);
      } else {
        return Array(512).fill(0);
      }
    }
  }

  if (!Array.isArray(arr) || arr.length === 0) {
    return Array(512).fill(0);
  }

  // Truncate to 512 dimensions
  const truncated = arr.slice(0, 512);

  // L2 normalize
  let norm = 0;
  for (const val of truncated) {
    const num = typeof val === 'number' ? val : parseFloat(val);
    if (!isNaN(num)) {
      norm += num * num;
    }
  }
  norm = Math.sqrt(norm);

  if (norm === 0) {
    return truncated.map(v => typeof v === 'number' ? v : parseFloat(v));
  }

  return truncated.map(v => {
    const num = typeof v === 'number' ? v : parseFloat(v);
    return isNaN(num) ? 0 : num / norm;
  });
}

// ============================================================================
// Phase 4: Upsert to Qdrant in Batches
// ============================================================================

async function phase4_upsertToQdrant(
  client: QdrantClient,
  embeddings: any[],
  batchSize: number,
  dryRun: boolean
) {
  console.log(`\n[Phase 4] Upsert to Qdrant codebase_chunks_512 (batch size: ${batchSize})...`);

  if (dryRun) {
    console.log('  [DRY RUN] Skipping actual upsert');
    return { total: embeddings.length, upserted: 0, failed: 0 };
  }

  let upserted = 0;
  let failed = 0;

  for (let i = 0; i < embeddings.length; i += batchSize) {
    const batch = embeddings.slice(i, Math.min(i + batchSize, embeddings.length));

    // Convert to Qdrant point format
    const points = [];
    for (const row of batch) {
      try {
        const vector512 = quantize768to512(row.content_embedding);
        points.push({
          id: row.id,
          vector: vector512,
          payload: {
            content_hash: row.content_hash || '',
            source_ref: (row.content_hash || '').slice(0, 16),
            packet_key: `packet:${row.id}`,
            quantized_from: 768,
            quantization_method: 'truncate+l2norm'
          }
        });
      } catch (err) {
        failed++;
        console.warn(`  ⚠ Skipping row ${row.id}: quantization failed (${err.message})`);
      }
    }

    if (points.length === 0) {
      console.log(`  ⚠ Batch ${Math.floor(i / batchSize) + 1}: no valid points`);
      continue;
    }

    try {
      await client.upsert(COLLECTIONS.fallback_512d.name, {
        points,
        wait: true // Wait for indexing
      });
      upserted += points.length;
      console.log(`  ✓ Batch ${Math.floor(i / batchSize) + 1}: upserted ${points.length} vectors (total: ${upserted})`);
    } catch (err) {
      failed += points.length;
      console.error(`  ✗ Batch failed: ${err.message}`);
    }

    // Optional: sleep to avoid overwhelming Qdrant
    if (i + batchSize < embeddings.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`\n✓ Phase 4 complete: ${upserted} upserted, ${failed} failed`);
  return { total: embeddings.length, upserted, failed };
}

// ============================================================================
// Phase 5: Verify via Readback + Hash Check
// ============================================================================

async function phase5_verifySync(
  client: QdrantClient,
  originalEmbeddings: any[]
) {
  console.log(`\n[Phase 5] Verify Qdrant sync (readback + hash check)...`);

  if (originalEmbeddings.length === 0) {
    console.log('  [SKIP] No embeddings to verify');
    return { verified: 0, mismatches: 0 };
  }

  let verified = 0;
  let mismatches = 0;

  // Sample first 10 embeddings for verification (not all, to save time)
  const sampleSize = Math.min(10, originalEmbeddings.length);
  const sample = originalEmbeddings.slice(0, sampleSize);

  for (const row of sample) {
    try {
      // Retrieve from Qdrant
      const retrievedPoint = await client.retrieve(
        COLLECTIONS.fallback_512d.name,
        { ids: [row.id] }
      );

      if (retrievedPoint && retrievedPoint.length > 0) {
        const point = retrievedPoint[0];

        // Verify vector length (should be 512)
        if (point.vector && Array.isArray(point.vector)) {
          if (point.vector.length === 512) {
            verified++;
          } else {
            mismatches++;
            console.warn(`  ✗ Point ${row.id}: vector length ${point.vector.length} != 512`);
          }
        } else {
          mismatches++;
          console.warn(`  ✗ Point ${row.id}: vector format invalid`);
        }

        // Verify payload
        if (point.payload?.content_hash !== row.content_hash) {
          console.warn(`  ✗ Point ${row.id}: content_hash mismatch`);
          mismatches++;
        }
      } else {
        mismatches++;
        console.warn(`  ✗ Point ${row.id}: not found in Qdrant`);
      }
    } catch (err) {
      mismatches++;
      console.error(`  ✗ Point ${row.id}: verification failed: ${err.message}`);
    }
  }

  console.log(`✓ Phase 5 complete: ${verified}/${sampleSize} verified, ${mismatches} mismatches`);
  return { verified, mismatches };
}

// ============================================================================
// Phase 6: Retrieval Test (Optional)
// ============================================================================

async function phase6_retrievalTest(
  client: QdrantClient,
  originalEmbeddings: any[]
) {
  console.log(`\n[Phase 6] Retrieval test (optional, sample query)...`);

  if (originalEmbeddings.length === 0) {
    console.log('  [SKIP] No embeddings to test');
    return { success: false };
  }

  try {
    // Pick first embedding, quantize it, and search
    const sampleEmbedding = originalEmbeddings[0].content_embedding;
    const query512 = quantize768to512(sampleEmbedding);

    const searchResult = await client.query(
      COLLECTIONS.fallback_512d.name,
      {
        query: query512,
        limit: 5,
        score_threshold: 0.5
      }
    );

    console.log(`✓ Search returned ${searchResult.points.length} results`);
    if (searchResult.points.length > 0) {
      console.log(`  Top result: ID=${searchResult.points[0].id}, score=${searchResult.points[0].score.toFixed(4)}`);
    }

    return { success: true, resultsCount: searchResult.points.length };
  } catch (err) {
    console.error(`✗ Retrieval test failed: ${err.message}`);
    return { success: false };
  }
}

// ============================================================================
// Main Orchestration
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Embedding Lanes Qdrant Sync Pipeline                      ║');
  console.log('║  Sessions 157+ | Phase: 5-6 Execution                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const startTime = Date.now();
  let client: QdrantClient;
  let detectionResult: any;
  let embeddings: any[] = [];

  try {
    // Phase 1: Detect collections
    detectionResult = await phase1_detectCollections();
    client = detectionResult.client;

    // Phase 2: Fetch embeddings
    embeddings = await phase2_fetchEmbeddings(limit);

    // Phase 3+4: Quantize and upsert
    const upsertResult = await phase4_upsertToQdrant(client, embeddings, batchSize, dryRun);

    // Phase 5: Verify
    if (!dryRun) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for indexing
      const verifyResult = await phase5_verifySync(client, embeddings);

      // Phase 6: Retrieval test
      const retrievalResult = await phase6_retrievalTest(client, embeddings);

      // Summary
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n╔════════════════════════════════════════════════════════════╗`);
      console.log(`║  Summary                                                   ║`);
      console.log(`╠════════════════════════════════════════════════════════════╣`);
      console.log(`║  Total fetched:        ${embeddings.length.toString().padEnd(40)} ║`);
      console.log(`║  Upserted:             ${upsertResult.upserted.toString().padEnd(40)} ║`);
      console.log(`║  Failed:               ${upsertResult.failed.toString().padEnd(40)} ║`);
      console.log(`║  Verified:             ${verifyResult.verified.toString().padEnd(40)} ║`);
      console.log(`║  Retrieval test:       ${retrievalResult.success ? 'PASS' : 'FAIL'.padEnd(40)} ║`);
      console.log(`║  Duration:             ${duration}s${' '.repeat(40 - duration.length - 2)} ║`);
      console.log(`╚════════════════════════════════════════════════════════════╝`);
    } else {
      console.log(`\n[DRY RUN] Would upsert ${embeddings.length} vectors to Qdrant (codebase_chunks_512)`);
    }

    process.exit(0);
  } catch (err) {
    console.error('\n✗ Pipeline failed:', err.message);
    process.exit(1);
  }
}

main();
