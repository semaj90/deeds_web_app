#!/usr/bin/env node
/**
 * Migrate Qdrant metadata from v1 to v2 envelope
 *
 * v1 structure (flat):
 *   { packet_identity_source, qdrant_payload_version, payload_backfilled_at }
 *
 * v2 structure (nested):
 *   { version: 2, created_at, updated_at, identity{}, enrichment{}, retrieval{}, ai_summary{}, quality{} }
 *
 * Migration strategy: Lazy v1→v2
 *   - Old points stay at v1 until accessed
 *   - New points written as v2
 *   - Reader accepts both v1 and v2, coerces v1→v2 on read
 *
 * Usage:
 *   node scripts/atlas/migrate-metadata-v1-to-v2.mjs --dry [--apply]
 */

import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const SAMPLE_SIZE = 100;
const MODE = process.argv[2] === '--apply' ? 'apply' : 'dry';

const client = new QdrantClient({ url: QDRANT_URL });

function migrateMetadataV1toV2(v1: Record<string, any>): Record<string, any> {
  const now = new Date().toISOString();

  return {
    version: 2,
    created_at: now,
    updated_at: now,

    identity: {
      source: v1.packet_identity_source || 'unknown',
      packet_key: v1.packet_key || null,
      source_ref_canonical: v1.source_ref || null,
      directory_path: v1.directory_path || null,
      lineage_version: 'packet-identity-v1',
    },

    enrichment: {
      som_cluster: v1.som_cluster || null,
      som_bmu_col: v1.som_bmu_col || null,
      som_bmu_row: v1.som_bmu_row || null,
      gpu_kmeans_cluster: v1.gpu_kmeans_cluster || null,
      centroid_distance: v1.centroid_distance || null,
      glyph_id: v1.glyph_id || null,
      glyph_type: v1.glyph_type || null,
    },

    retrieval: {
      vector_source: v1.vector_source || 'embeddinggemma:300m',
      vector_dim: 768,
      signature_vector: false,
      error_vector: false,
      encoded_64_vector: false,
      last_vector_update: v1.payload_backfilled_at || now,
    },

    ai_summary: {
      summary: null,
      summary_model: null,
      summary_generated_at: null,
      summary_confidence: null,
      keywords: [],
    },

    quality: {
      canonical: v1.canonical || false,
      payload_version: v1.qdrant_payload_version || 'phase-d-e-v1',
      payload_matched_at: v1.payload_backfilled_at || now,
      ambiguity_score: 0.0,
      needs_review: false,
    },
  };
}

async function main() {
  console.log(`\n📊 Qdrant Metadata v1→v2 Migration (${MODE})`);
  console.log(`Collection: ${COLLECTION}`);
  console.log(`Sample size: ${SAMPLE_SIZE}\n`);

  try {
    // Fetch sample of points
    const scrollResult = await client.scroll(COLLECTION, {
      limit: SAMPLE_SIZE,
      with_payload: true,
      with_vectors: false,
    });

    const points = scrollResult.points || [];
    console.log(`📍 Found ${points.length} points to inspect\n`);

    let v1Count = 0;
    let v2Count = 0;
    const updatesNeeded = [];

    for (const point of points) {
      const meta = point.payload?.metadata;

      if (!meta) {
        console.log(`⚠️  Point ${point.id}: no metadata`);
        continue;
      }

      if (meta.version === 2) {
        v2Count++;
      } else {
        v1Count++;
        const v2Meta = migrateMetadataV1toV2(meta);
        updatesNeeded.push({ id: point.id, metadata: v2Meta });
      }
    }

    console.log(`Version summary:`);
    console.log(`  v1 (needs migration): ${v1Count}`);
    console.log(`  v2 (already migrated): ${v2Count}\n`);

    if (MODE === 'apply' && updatesNeeded.length > 0) {
      console.log(`🔄 Applying migrations to ${updatesNeeded.length} points...\n`);

      for (let i = 0; i < updatesNeeded.length; i += 10) {
        const batch = updatesNeeded.slice(i, i + 10);
        const operations = batch.map((item) => ({
          operation: 'set_payload',
          payload: { metadata: item.metadata },
          points: [item.id],
        }));

        try {
          for (const op of operations) {
            await client.updatePointVectors(COLLECTION, {
              points: op.points,
              payload: op.payload,
            });
          }
          console.log(`✅ Migrated batch ${Math.ceil((i + 10) / 10)} of ${Math.ceil(updatesNeeded.length / 10)}`);
        } catch (err: any) {
          console.error(`❌ Batch error:`, err.message);
        }
      }

      console.log(`\n✅ Migration complete: ${updatesNeeded.length} points updated\n`);
    } else if (MODE === 'dry') {
      console.log(`🏜️  DRY RUN: Would migrate ${updatesNeeded.length} points`);
      console.log(`Run with --apply to execute migrations\n`);
    }

    // Report
    const report = {
      timestamp: new Date().toISOString(),
      collection: COLLECTION,
      sampleSize: points.length,
      v1Count,
      v2Count,
      migrationsNeeded: updatesNeeded.length,
      mode: MODE,
      status: updatesNeeded.length > 0 ? 'PENDING' : 'COMPLETE',
    };

    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

main();
