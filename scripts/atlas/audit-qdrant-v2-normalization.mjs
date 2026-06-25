#!/usr/bin/env node

import { QdrantClient } from '@qdrant/js-client-rest';
import pg from 'pg';

const VERBOSE = process.argv.includes('--verbose');
const log = (msg) => console.log(`[P3 Audit] ${msg}`);
const verbose = (msg) => VERBOSE && console.log(`  ${msg}`);

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';

const client = new QdrantClient({ url: QDRANT_URL });

async function getDb() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
  });
  return pool;
}

async function main() {
  const db = await getDb();

  try {
    log('Auditing Qdrant v2 Normalization Status...\n');

    // Get Qdrant collection info
    const collectionInfo = await client.getCollection(COLLECTION);
    const pointCount = collectionInfo.points_count;
    log(`Collection: ${COLLECTION}`);
    log(`  Total points: ${pointCount}`);
    log(`  Indexed vectors: ${collectionInfo.indexed_vectors_count}`);
    
    // Sample points to check payload schema
    log('\n=== Payload Field Coverage ===');
    
    const fieldsToCheck = [
      'packet_key',
      'source_ref',
      'sourceRef',
      'feature_id',
      'feature_ids',
      'som_cluster',
      'som_x',
      'som_y',
      'community_id',
      'qdrant_point_id',
      'file_path',
      'tags',
    ];

    const fieldStats = {};
    for (const field of fieldsToCheck) {
      fieldStats[field] = 0;
    }

    // Sample 1000 points to estimate coverage
    const sampleSize = Math.min(1000, pointCount);
    const result = await client.scroll(COLLECTION, {
      limit: sampleSize,
      with_payload: true,
      with_vectors: false,
    });

    for (const point of result.points) {
      for (const field of fieldsToCheck) {
        if (point.payload[field] != null) {
          fieldStats[field]++;
        }
      }
    }

    // Postgres comparison (safe column check)
    const pgResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as packet_key_count,
        COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as source_ref_count,
        COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as feature_id_count,
        COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) as qdrant_point_id_count
      FROM atlas_packets
    `);

    const pgStats = pgResult.rows[0];

    log('Field Coverage (estimated from sample of ' + sampleSize + ' points):');
    for (const field of fieldsToCheck) {
      const pct = ((fieldStats[field] / sampleSize) * 100).toFixed(1);
      const emoji = fieldStats[field] > sampleSize * 0.9 ? '✅' : fieldStats[field] > 0 ? '⚠️' : '❌';
      verbose(`  ${emoji} ${field}: ${fieldStats[field]}/${sampleSize} (${pct}%)`);
    }

    log('\nPostgres vs Qdrant Alignment:');
    log(`  packet_key: Postgres ${pgStats.packet_key_count}/${pgStats.total} vs Qdrant ${fieldStats['packet_key']}/${sampleSize}`);
    log(`  source_ref: Postgres ${pgStats.source_ref_count}/${pgStats.total} vs Qdrant ${fieldStats['source_ref'] + fieldStats['sourceRef']}/${sampleSize}`);
    log(`  feature_id: Postgres ${pgStats.feature_id_count}/${pgStats.total} vs Qdrant ${fieldStats['feature_id'] + fieldStats['feature_ids']}/${sampleSize}`);
    log(`  qdrant_point_id: Postgres ${pgStats.qdrant_point_id_count}/${pgStats.total}`);
    log(`  som_cluster: Qdrant ${fieldStats['som_cluster']}/${sampleSize}`);

    // Check for naming conflicts
    log('\n=== Naming Conflicts ===');
    const hasSourceRef = fieldStats['sourceRef'] > 0;
    const hasSource_ref = fieldStats['source_ref'] > 0;
    const hasFeatureIds = fieldStats['feature_ids'] > 0;
    const hasFeatureId = fieldStats['feature_id'] > 0;

    let conflictCount = 0;
    if (hasSourceRef && hasSource_ref) {
      log('⚠️ Both sourceRef and source_ref present');
      conflictCount++;
    }
    if (hasFeatureIds && hasFeatureId) {
      log('⚠️ Both feature_ids and feature_id present');
      conflictCount++;
    }
    if (!hasSourceRef && !hasSource_ref) {
      log('❌ Missing: Neither sourceRef nor source_ref found');
      conflictCount++;
    }
    if (conflictCount === 0) {
      log('✅ No naming conflicts detected');
    }

    // P3 Normalization Gates
    log('\n=== P3 v2 Normalization Gates ===');
    const gate1 = hasSource_ref && hasFeatureId && fieldStats['packet_key'] > sampleSize * 0.9;
    const gate2 = fieldStats['som_cluster'] > sampleSize * 0.9;
    const gate3 = fieldStats['community_id'] > 0 || fieldStats['tags'] > 0;

    log(`Gate 1 (Canonical names): ${gate1 ? '✅ PASS' : '❌ FAIL'}`);
    log(`  - source_ref: ${hasSource_ref ? '✅' : '❌'}`);
    log(`  - feature_id: ${hasFeatureId ? '✅' : '❌'}`);
    log(`  - packet_key: ${fieldStats['packet_key'] > sampleSize * 0.9 ? '✅' : '❌'}`);

    log(`Gate 2 (Routing fields): ${gate2 ? '✅ PASS' : '❌ FAIL'}`);
    log(`  - som_cluster coverage: ${((fieldStats['som_cluster'] / sampleSize) * 100).toFixed(1)}%`);

    log(`Gate 3 (Graph fields): ${gate3 ? '✅ OK' : '⚠️ SPARSE'}`);
    log(`  - community_id: ${fieldStats['community_id']} points`);
    log(`  - tags: ${fieldStats['tags']} points`);

    // Overall status
    const allPass = gate1 && gate2;
    log(`\n=== Overall P3 Status: ${allPass ? '✅ PASS' : '⚠️ NEEDS WORK'} ===`);

    log('\n=== Recommended Actions ===');
    if (!hasSource_ref && hasSourceRef) {
      log('1. Normalize sourceRef → source_ref (run normalization script)');
    }
    if (!gate2) {
      log('2. Backfill som_cluster from Qdrant schema or SOM training');
    }
    if (!gate3) {
      log('3. Enrich graph fields (community_id, tags) from Neo4j or enrichment pipeline');
    }
    if (allPass) {
      log('✅ No actions needed - P3 normalization complete');
    }

  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
