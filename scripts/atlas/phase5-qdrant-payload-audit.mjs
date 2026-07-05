#!/usr/bin/env node

/**
 * Phase 5: Qdrant Payload Field Audit (DATA-LEVEL, not collection-level)
 *
 * Verifies that Qdrant payloads contain required fields:
 * - packet_key, source_ref, feature_id, domain_class (required)
 * - title_id, som_row, som_col, community_id (optional but checked)
 *
 * Also verifies named vectors exist:
 * - content (required)
 * - signature, error (optional but checked)
 *
 * Success criteria:
 * - ≥95% of points have all 4 required payload fields
 * - Named vector 'content' is indexed
 * - No NULL values in required fields
 *
 * Usage:
 *   node scripts/atlas/phase5-qdrant-payload-audit.mjs --apply
 */

import { QdrantClient } from '@qdrant/js-client-rest';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const SAMPLE_SIZE = 100;

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

async function auditQdrantPayload() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 5: Qdrant Payload Field Audit (DATA-LEVEL)              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log(`Sample size: ${SAMPLE_SIZE} points\n`);

  try {
    // 1. Verify collection exists
    console.log('📦 Collection Verification:');
    let collection;
    try {
      collection = await qdrant.getCollection('codebase_chunks_768');
      console.log(`  ✅ Collection exists`);
      console.log(`  Points: ${collection.points_count}`);
      console.log(`  Indexed points: ${collection.indexed_vectors_count}\n`);
    } catch (err) {
      console.error(`  ❌ Collection not found: ${err.message}`);
      process.exit(1);
    }

    // 2. Verify named vectors
    console.log('🔢 Named Vectors Verification:');
    const vectors = collection.config.params.vectors;
    const requiredVectors = ['content'];
    const optionalVectors = ['signature', 'error'];

    for (const vec of requiredVectors) {
      if (vectors[vec]) {
        console.log(`  ✅ ${vec} (required): ${vectors[vec].size}-dim, indexed`);
      } else {
        console.log(`  ❌ ${vec} (required): MISSING`);
      }
    }

    for (const vec of optionalVectors) {
      if (vectors[vec]) {
        console.log(`  ⚠️  ${vec} (optional): present`);
      } else {
        console.log(`  ℹ️  ${vec} (optional): not present`);
      }
    }
    console.log('');

    // 3. Sample payload fields
    console.log(`📋 Payload Field Audit (${SAMPLE_SIZE}-point sample):`);
    const requiredFields = ['packet_key', 'source_ref', 'feature_id', 'domain_class'];
    const optionalFields = ['title_id', 'som_row', 'som_col', 'community_id'];

    const scrollResult = await qdrant.scroll('codebase_chunks_768', {
      limit: SAMPLE_SIZE,
      with_payload: true,
      with_vectors: false,
    });

    const points = scrollResult.points;
    const missing = {
      packet_key: 0,
      source_ref: 0,
      feature_id: 0,
      domain_class: 0,
      title_id: 0,
      som_row: 0,
      som_col: 0,
      community_id: 0,
    };

    for (const point of points) {
      for (const field of requiredFields) {
        if (!point.payload[field]) {
          missing[field]++;
        }
      }
      for (const field of optionalFields) {
        if (!point.payload[field]) {
          missing[field]++;
        }
      }
    }

    console.log('  Required fields:');
    for (const field of requiredFields) {
      const count = missing[field];
      const pct = ((count / points.length) * 100).toFixed(1);
      const icon = count === 0 ? '✅' : '❌';
      console.log(`    ${icon} ${field}: ${count} missing (${pct}%)`);
    }

    console.log('  Optional fields:');
    for (const field of optionalFields) {
      const count = missing[field];
      const pct = ((count / points.length) * 100).toFixed(1);
      const icon = count <= points.length * 0.2 ? '✅' : '⚠️ ';
      console.log(`    ${icon} ${field}: ${count} missing (${pct}%)`);
    }
    console.log('');

    // 4. Gate evaluation
    console.log('🚪 Gate Evaluation:');
    const requiredFieldsMissing = Object.entries(missing)
      .filter(([field]) => requiredFields.includes(field))
      .map(([field, count]) => count)
      .reduce((a, b) => a + b, 0);

    const totalRequired = requiredFields.length * points.length;
    const pct = ((totalRequired - requiredFieldsMissing) / totalRequired * 100).toFixed(1);

    console.log(`  Required fields coverage: ${pct}%`);
    console.log(`  Required vectors present: ${requiredVectors.every(v => vectors[v]) ? 'YES' : 'NO'}\n`);

    const gatePassed =
      pct >= 95 &&
      requiredVectors.every(v => vectors[v]) &&
      Object.entries(missing)
        .filter(([field]) => requiredFields.includes(field))
        .every(([_, count]) => count === 0);

    console.log(`${gatePassed ? '🟢 PASS' : '🔴 FAIL'}: Qdrant payload gate ${gatePassed ? 'passed' : 'FAILED'}\n`);

    if (!gatePassed) {
      console.log('📋 Recommendations:');
      if (pct < 95) {
        console.log(`  - Required field coverage is ${pct}% (need 95%). Backfill missing fields.`);
      }
      if (!requiredVectors.every(v => vectors[v])) {
        console.log(`  - Required named vectors missing. Re-create collection with all vectors.`);
      }
    }

    process.exit(gatePassed ? 0 : 1);
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    process.exit(1);
  }
}

auditQdrantPayload();
