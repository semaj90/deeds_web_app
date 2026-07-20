#!/usr/bin/env node

/**
 * Backfill Qdrant payloads with missing fields from Postgres
 *
 * Syncs fields from atlas_packets and codebase_chunk_index to codebase_chunks_768 payloads:
 * - packet_key, source_ref, feature_id, domain_class
 * - title_id, som_row, som_col, community_id
 *
 * Uses qdrant_id from codebase_chunk_index to identify points in Qdrant.
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-payloads-from-postgres.mjs --dry-run
 *   node scripts/atlas/backfill-qdrant-payloads-from-postgres.mjs --apply
 *   node scripts/atlas/backfill-qdrant-payloads-from-postgres.mjs --apply --limit=5000
 */

import pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : null;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';

const pgPool = new pg.Pool({ connectionString: DATABASE_URL });
const qdrant = new QdrantClient({ url: QDRANT_URL, checkCompatibility: false });

async function backfillQdrantPayloads() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Backfill Qdrant Payloads from Postgres                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY_RUN' : 'APPLY'}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} points`);
  console.log();

  try {
    // 1. Fetch chunks from Postgres with their Qdrant IDs and joined atlas_packets metadata
    console.log('📥 Fetching chunks with Qdrant IDs from Postgres...');
    const query = `
      SELECT
        cci.qdrant_id,
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.domain_class,
        ap.title_id,
        ap.som_row,
        ap.som_col,
        ap.community_id
      FROM codebase_chunk_index cci
      LEFT JOIN atlas_packets ap ON cci.relative_path = ap.source_ref
      WHERE cci.qdrant_id IS NOT NULL
      ORDER BY cci.id
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}
    `;

    const result = await pgPool.query(query);
    const chunks = result.rows;
    console.log(`  ✅ Fetched ${chunks.length} chunks\n`);

    if (chunks.length === 0) {
      console.log('  ⚠️  No chunks to backfill');
      return;
    }

    // 2. Build updates for Qdrant
    console.log('🔄 Building payload updates...');
    let updated = 0;
    let skipped = 0;
    const batchSize = 100;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));

      if (DRY_RUN) {
        console.log(`  [DRY] Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} points`);
        if (i === 0) {
          console.log(`    Sample qdrant_id: ${batch[0].qdrant_id}`);
          console.log(`    Sample payload: packet_key=${batch[0].packet_key}, domain_class=${batch[0].domain_class}`);
        }
      } else {
        // Apply updates to Qdrant
        try {
          for (const chunk of batch) {
            if (!chunk.qdrant_id) {
              skipped++;
              continue;
            }

            // Convert qdrant_id to proper format (can be UUID string or integer)
            const pointId = isNaN(chunk.qdrant_id) ? chunk.qdrant_id : parseInt(chunk.qdrant_id, 10);

            const payload = {
              packet_key: chunk.packet_key,
              source_ref: chunk.source_ref,
              feature_id: chunk.feature_id,
              domain_class: chunk.domain_class,
            };

            // Only add optional fields if they have values
            if (chunk.title_id) payload.title_id = chunk.title_id;
            if (chunk.som_row !== null) payload.som_row = chunk.som_row;
            if (chunk.som_col !== null) payload.som_col = chunk.som_col;
            if (chunk.community_id !== null) payload.community_id = chunk.community_id;

            await qdrant.setPayload(COLLECTION, {
              points_selector: { ids: [pointId] },
              payload: payload,
            });
            updated++;
          }
        } catch (err) {
          console.error(`  ❌ Batch update failed: ${err.message}`);
          skipped += batch.length;
        }

        if ((i + batch.length) % 1000 === 0) {
          console.log(`  ✅ Updated ${updated} points`);
        }
      }
    }

    if (!DRY_RUN) {
      console.log(`\n✅ Backfill complete:`);
      console.log(`  Updated: ${updated}`);
      console.log(`  Skipped: ${skipped}`);
    } else {
      console.log(`\n📊 DRY_RUN would update ${chunks.length} points`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

backfillQdrantPayloads();
