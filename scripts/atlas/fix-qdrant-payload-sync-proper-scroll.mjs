#!/usr/bin/env node

/**
 * Fix Qdrant payload sync using proper scroll pagination (next_page_offset, not offset += LIMIT)
 *
 * Issue: Previous sync used `offset += LIMIT` which caused repeat/invalid pagination
 * Fix: Use Qdrant's returned next_page_offset for deterministic pagination
 *
 * Usage:
 *   node scripts/atlas/fix-qdrant-payload-sync-proper-scroll.mjs --dry-run
 *   node scripts/atlas/fix-qdrant-payload-sync-proper-scroll.mjs --apply
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { Client } from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildCanonicalFeatureEnvelope } from './lib/envelope-builder.mjs';

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const SCROLL_LIMIT = 500;

const isDryRun = process.argv.includes('--dry-run');
const isApply = process.argv.includes('--apply');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Qdrant Payload Sync — Fixed Scroll Pagination                 ║');
console.log('║  Using next_page_offset instead of offset += LIMIT             ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log();
console.log(`Mode: ${isDryRun ? 'DRY_RUN' : isApply ? 'APPLY' : 'AUDIT'}`);
console.log(`Collection: ${COLLECTION}`);
console.log(`Scroll limit: ${SCROLL_LIMIT}`);
console.log();

async function syncQdrantPayloads() {
  const qdrant = new QdrantClient({ url: QDRANT_URL });
  const pgClient = new Client({ connectionString: POSTGRES_URL });

  try {
    await pgClient.connect();
    console.log('✅ Connected to Postgres');

    // Verify Qdrant collection exists
    const collections = await qdrant.getCollections();
    const collectionExists = collections.collections.some((c) => c.name === COLLECTION);
    if (!collectionExists) {
      console.error(`❌ Collection ${COLLECTION} not found`);
      return;
    }
    console.log(`✅ Collection ${COLLECTION} exists`);
    console.log();

    // Scroll through Qdrant points using proper next_page_offset pagination
    console.log('Scrolling Qdrant collection with next_page_offset...');
    let offset = undefined;
    let processed = 0;
    let updated = 0;
    let errors = 0;
    const batches = [];

    while (true) {
      try {
        const res = await qdrant.scroll(COLLECTION, {
          limit: SCROLL_LIMIT,
          offset,
          with_payload: true,
          with_vectors: false,
        });

        if (!res.points || !res.points.length) break;

        batches.push({
          batch_num: Math.floor(processed / SCROLL_LIMIT) + 1,
          points_in_batch: res.points.length,
          offset: offset || 'null (start)',
          next_offset: res.next_page_offset || 'null (end)',
        });

        // Process each point: validate envelope and update Postgres
        for (const point of res.points) {
          processed++;

          if (isDryRun && processed <= 3) {
            console.log(`  Sample point ID ${point.id}:`);
            console.log(`    payload: ${JSON.stringify(point.payload).substring(0, 100)}...`);
          }

          if (isApply) {
            // Validate payload against canonical envelope contract
            const packet = {
              ...point.payload,
              qdrant_point_id: point.id,
            };
            const { envelope, validation } = buildCanonicalFeatureEnvelope(packet);

            if (!validation.isValid) {
              console.warn(`  ⚠️  Point ${point.id} failed validation:`, validation.hardFailures);
              errors++;
              continue;
            }

            // Update Postgres with qdrant_point_id using packet_key as lookup
            // packet_key is the canonical identity; qdrant_point_id is the cross-store mirror
            const result = await pgClient.query(
              `UPDATE atlas_packets
               SET qdrant_point_id = $1,
                   updated_at = NOW()
               WHERE packet_key = $2
               AND qdrant_point_id IS NULL`,
              [
                String(point.id),
                envelope.packet_key,
              ]
            );

            if (result.rowCount > 0) updated++;
          }
        }

        // Pagination: use next_page_offset from Qdrant response
        offset = res.next_page_offset;
        if (offset == null) break;

        if ((processed % (SCROLL_LIMIT * 5)) === 0) {
          console.log(`  ✅ Processed ${processed} points...`);
        }
      } catch (err) {
        console.error(`❌ Scroll error at offset ${offset}:`, err.message);
        errors++;
        break;
      }
    }

    console.log();
    console.log('Scroll pagination audit:');
    console.log(`  Total batches: ${batches.length}`);
    console.log(`  Total points scrolled: ${processed}`);
    if (isApply) {
      console.log(`  Points updated in Postgres: ${updated}`);
    }
    console.log(`  Errors: ${errors}`);
    console.log();

    if (isDryRun) {
      console.log('Sample batches:');
      batches.slice(0, 3).forEach((b) => {
        console.log(
          `  Batch ${b.batch_num}: ${b.points_in_batch} points | offset=${b.offset} → next=${b.next_offset}`
        );
      });
      if (batches.length > 3) {
        console.log(`  ... ${batches.length - 3} more batches`);
      }
    }

    // Verify Postgres coverage
    const coverageResult = await pgClient.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE domain_class IS NOT NULL) AS classified,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE domain_class IS NOT NULL) / COUNT(*),
          2
        ) AS coverage_pct
      FROM atlas_packets
    `);

    const { total, classified, coverage_pct } = coverageResult.rows[0];
    console.log(`Postgres coverage: ${classified}/${total} (${coverage_pct}%)`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pgClient.end();
  }
}

syncQdrantPayloads();