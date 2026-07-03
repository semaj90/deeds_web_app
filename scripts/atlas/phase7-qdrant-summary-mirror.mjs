#!/usr/bin/env node
/**
 * Phase 7: Qdrant Summary Mirror
 *
 * After workers write summaries to Postgres (Phase 7), this script mirrors them
 * into Qdrant payloads for durable search indexing.
 *
 * Flow:
 *   1. Query Postgres for summarized chunks (WHERE summary IS NOT NULL)
 *   2. Fetch corresponding Qdrant points
 *   3. Update payload with summary + metadata
 *   4. Upsert back to Qdrant
 *
 * This is NOT real-time; it runs as a batch job every N minutes
 * to sync the canonical Postgres state into the Qdrant mirror.
 */

import { Pool } from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import { performance } from 'perf_hooks';

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '1000');

const pgPool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DB,
  user: PG_USER,
  password: PG_PASSWORD,
});

const qdrant = new QdrantClient({ url: QDRANT_URL });

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 7: Qdrant Summary Mirror                                 ║');
  console.log('║  Sync Postgres summaries → Qdrant payloads                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Limit: ${LIMIT} chunks per run`);
  console.log(`Postgres: ${PG_HOST}:${PG_PORT}/${PG_DB}`);
  console.log(`Qdrant: ${QDRANT_URL}/${QDRANT_COLLECTION}\n`);

  const t0 = performance.now();
  let mirrored = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Step 1: Query Postgres for summarized chunks
    console.log('📄 Querying Postgres for summarized chunks...');

    const result = await pgPool.query(
      `SELECT
        id,
        source_ref,
        file_path,
        feature_id,
        summary,
        created_at,
        updated_at
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL
        AND summary <> ''
      LIMIT $1`,
      [LIMIT]
    );

    const chunks = result.rows;
    console.log(`Found ${chunks.length} summarized chunks\n`);

    if (chunks.length === 0) {
      console.log('✅ No new summaries to mirror. Postgres and Qdrant are in sync.');
      await pgPool.end();
      process.exit(0);
    }

    // Step 2: Mirror each chunk into Qdrant
    console.log('🔄 Mirroring to Qdrant...');

    for (const chunk of chunks) {
      try {
        // Build enriched payload
        const payload = {
          chunk_id: chunk.id,
          source_ref: chunk.source_ref,
          file_path: chunk.file_path,
          feature_id: chunk.feature_id,
          summary: chunk.summary,
          summary_length: chunk.summary.length,
          cached_at: new Date().toISOString(),
          source: 'phase7-qdrant-mirror',
        };

        // Qdrant: search by chunk_id to find the point
        // Note: Assuming chunk_id is indexed in Qdrant payload
        const searchResult = await qdrant.search(QDRANT_COLLECTION, {
          vector: new Array(768).fill(0), // Dummy vector (only using filter)
          limit: 1,
          query_filter: {
            must: [
              {
                key: 'chunk_id',
                match: {
                  value: chunk.id,
                },
              },
            ],
          },
        });

        if (searchResult.result.length === 0) {
          // Point doesn't exist in Qdrant yet; skip (not an error)
          skipped++;
          continue;
        }

        const point = searchResult.result[0];
        const pointId = point.id;

        // Upsert payload back to Qdrant
        if (!DRY_RUN) {
          await qdrant.setPayload(QDRANT_COLLECTION, {
            points_selector: {
              ids: [pointId],
            },
            payload,
          });
        }

        mirrored++;

        if (mirrored % 100 === 0) {
          console.log(`  [${mirrored}] mirrored...`);
        }
      } catch (err) {
        console.error(`  Error mirroring ${chunk.id}: ${err.message}`);
        errors++;
      }
    }

    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

    console.log(`\n✅ Mirror complete in ${elapsed}s`);
    console.log(`   Mirrored: ${mirrored}`);
    console.log(`   Skipped (not in Qdrant): ${skipped}`);
    console.log(`   Errors: ${errors}`);

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

main();
