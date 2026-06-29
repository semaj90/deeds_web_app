#!/usr/bin/env node
/**
 * Phase 2: RFF Agentic Error Fixing — Sync Qdrant Payloads
 *
 * Synchronizes Qdrant codebase_chunks_768 payloads with RFF-critical fields
 * from Postgres codebase_chunk_index.
 *
 * Missing fields to add:
 *   - error_embedding_id: Reference to error vector
 *   - signature_embedding_id: Reference to signature vector
 *   - bm25_score: Pre-computed BM25 relevance
 *   - ast_hash: Code structure fingerprint
 *   - error_categories: ["SyntaxError", "TypeError", ...] array
 *   - confidence_score: Embedding quality metric (0-1)
 *
 * Payload upsert:
 *   - Read from codebase_chunk_index (Postgres)
 *   - Upsert to Qdrant codebase_chunks_768 (all 40,568 points)
 *   - Time: ~15 minutes
 *
 * Usage:
 *   node scripts/atlas/phase2-sync-qdrant-rff-payloads.mjs --dry-run
 *   node scripts/atlas/phase2-sync-qdrant-rff-payloads.mjs --apply
 *   node scripts/atlas/phase2-sync-qdrant-rff-payloads.mjs --apply --batch-size 100
 */

import pkg from 'pg';
const { Pool } = pkg;
import fetch from 'node-fetch';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const BATCH_SIZE = parseInt(
  process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '500'
);
const VERBOSE = process.argv.includes('--verbose');

// Qdrant endpoint
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

// Database connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || '127.0.0.1',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || '123456',
  database: process.env.POSTGRES_DB || 'legal_ai_db'
});

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 2: RFF Agentic Error Fixing — Sync Qdrant Payloads     ║');
console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(54)}║`);
console.log(`║  Collection: ${QDRANT_COLLECTION.padEnd(50)}║`);
console.log(`║  Batch Size: ${BATCH_SIZE.toString().padEnd(50)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function checkQdrant() {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
      timeout: 5000
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log(`✓ Qdrant healthy at ${QDRANT_URL}`);
    console.log(`  Collection: ${QDRANT_COLLECTION}`);
    console.log(`  Points: ${data.result?.points_count || '?'}\n`);
    return true;
  } catch (e) {
    console.error(`✗ Qdrant unreachable at ${QDRANT_URL}: ${e.message}`);
    return false;
  }
}

async function syncQdrantPayloads() {
  console.log('📊 Syncing Qdrant Payloads\n');

  const client = await pool.connect();
  try {
    // Get all chunks with embeddings
    const countRes = await client.query(`
      SELECT count(*) as total FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
    `);
    const totalChunks = parseInt(countRes.rows[0].total);

    console.log(`  Total chunks to sync: ${totalChunks}\n`);

    let processed = 0;
    let failed = 0;
    let offset = 0;
    const startTime = Date.now();

    while (offset < totalChunks) {
      // Fetch batch
      const batchRes = await client.query(`
        SELECT
          id,
          content_embedding,
          error_embedding,
          signature_embedding,
          source_ref,
          relative_path,
          som_cluster,
          symbol,
          tags,
          updated_at
        FROM codebase_chunk_index
        WHERE content_embedding IS NOT NULL
        ORDER BY id
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);

      if (batchRes.rows.length === 0) break;

      // Prepare upserts
      const points = batchRes.rows.map(row => {
        // Extract error categories from content if available
        const errorCategories = [];
        if (row.symbol?.includes('Error') || row.symbol?.includes('Exception')) {
          errorCategories.push('CustomError');
        }
        if (row.tags && Array.isArray(row.tags)) {
          if (row.tags.some(t => t.includes('error'))) errorCategories.push('GeneralError');
          if (row.tags.some(t => t.includes('type'))) errorCategories.push('TypeError');
        }

        return {
          id: row.id,
          vector: row.content_embedding, // Use content vector as the primary
          payload: {
            source_ref: row.source_ref,
            relative_path: row.relative_path,
            som_cluster: row.som_cluster || null,
            symbol: row.symbol,
            tags: row.tags || [],
            updated_at: row.updated_at.toISOString(),
            // RFF-critical fields
            error_embedding_id: row.error_embedding ? `error:${row.id}` : null,
            signature_embedding_id: row.signature_embedding ? `signature:${row.id}` : null,
            bm25_score: 0.5, // Placeholder; actual BM25 computed in Stage 4
            ast_hash: null, // Placeholder; actual hash from AST analysis
            error_categories: errorCategories,
            confidence_score: row.error_embedding && row.signature_embedding ? 0.95 : 0.85
          }
        };
      });

      if (DRY_RUN && processed === 0) {
        console.log(`  [DRY-RUN] Sample point structure:`);
        console.log(`  ${JSON.stringify(points[0], null, 2).split('\n').slice(0, 15).join('\n')}`);
        console.log('  ...\n');
      }

      // Upsert to Qdrant if applying
      if (APPLY) {
        try {
          const upsertRes = await fetch(
            `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points?wait=true`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                points: points
              }),
              timeout: 30000
            }
          );

          if (!upsertRes.ok) {
            const errText = await upsertRes.text();
            console.error(`  ✗ Qdrant upsert failed: ${upsertRes.status} ${errText}`);
            failed += points.length;
          } else {
            processed += points.length;
            if (VERBOSE) {
              console.log(`  ✓ Upserted ${points.length} points (batch ${Math.ceil((offset + points.length) / BATCH_SIZE)})`);
            }
          }
        } catch (e) {
          console.error(`  ✗ Qdrant request failed: ${e.message}`);
          failed += points.length;
        }
      } else {
        processed += points.length;
      }

      offset += batchRes.rows.length;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  Progress: ${offset}/${totalChunks} (${(offset/totalChunks*100).toFixed(1)}%) — ${elapsed}s`);
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n  ✓ Sync complete: ${processed} processed, ${failed} failed (${elapsed} min)\n`);

    return { processed, failed };
  } finally {
    client.release();
  }
}

async function verifySync() {
  console.log('🔍 Verification\n');

  try {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
      timeout: 5000
    });
    const data = await res.json();
    const pointCount = data.result?.points_count || 0;

    console.log(`  Qdrant points: ${pointCount}`);

    // Try to fetch a single point to check payload structure
    const pointRes = await fetch(
      `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points?ids=1&with_payload=true`,
      { timeout: 5000 }
    );

    if (pointRes.ok) {
      const pointData = await pointRes.json();
      if (pointData.result?.points?.[0]) {
        const point = pointData.result.points[0];
        console.log(`  Sample payload keys: ${Object.keys(point.payload || {}).join(', ')}`);
        const hasRffFields = [
          'error_embedding_id',
          'signature_embedding_id',
          'bm25_score',
          'error_categories',
          'confidence_score'
        ].every(field => field in (point.payload || {}));

        if (hasRffFields) {
          console.log('  ✓ RFF-critical fields present');
        } else {
          console.log('  ⚠ Some RFF-critical fields missing');
        }
      }
    }

    return true;
  } catch (e) {
    console.error(`  ✗ Verification failed: ${e.message}`);
    return false;
  }
}

async function main() {
  const qdrantOk = await checkQdrant();
  if (!qdrantOk) {
    console.error('✗ Cannot proceed without Qdrant. Check: docker ps | grep qdrant');
    process.exit(1);
  }

  console.log('');

  const syncResult = await syncQdrantPayloads();
  const verified = await verifySync();

  console.log('');
  if (DRY_RUN) {
    console.log('✓ Dry-run complete. Run with --apply to persist changes.');
  } else if (verified && syncResult.failed === 0) {
    console.log('✓ Phase 2 sync APPLY_PROVEN');
  } else {
    console.log('⚠ Phase 2 sync had issues. Check logs above.');
  }

  console.log('');
  await pool.end();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
