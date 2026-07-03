#!/usr/bin/env node
/**
 * Phase 102 Step 3: Sync feature_statistics to Qdrant payloads
 *
 * Canonical order (Tier 2 → Tier 3):
 * 1. Read feature_statistics from Postgres (pagerank, community)
 * 2. For each feature, find matching Qdrant points
 * 3. Update Qdrant payloads with graph enrichment
 *
 * Proof gate:
 * - At least one Qdrant point must have pagerank_score in payload
 *
 * Usage:
 *   node phase102-step3-qdrant-sync.mjs --dry-run
 *   node phase102-step3-qdrant-sync.mjs --apply
 */

import pg from 'pg';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const { Pool } = pg;

// Config
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5434');
const DB_USER = process.env.DATABASE_USER || 'legal_admin';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || '123456';
const DB_NAME = process.env.DATABASE_NAME || 'legal_ai_db';

// Args
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');
const MODE = dryRun ? 'DRY_RUN' : apply ? 'APPLY' : 'DRY_RUN';

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME
});

async function getFeatureStatistics() {
  /**
   * Fetch all features with graph statistics
   */
  const result = await pool.query(`
    SELECT
      feature_id,
      pagerank,
      hits_authority,
      community,
      som_cluster
    FROM feature_statistics
    WHERE pagerank IS NOT NULL AND pagerank > 0
  `);

  return result.rows;
}

async function findQdrantPointsByFeature(featureId) {
  /**
   * Find Qdrant points that belong to this feature
   * Uses payload filter: feature_id matches
   */
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: 'feature_id',
              match: { value: featureId }
            }
          ]
        },
        limit: 100,
        with_payload: true,
        with_vectors: false
      }),
      timeout: 10000
    });

    if (!response.ok) {
      console.warn(`  ⚠️  Qdrant search failed for ${featureId}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.result?.map(p => p.id) || [];
  } catch (e) {
    console.warn(`  ⚠️  Error searching Qdrant: ${e.message}`);
    return [];
  }
}

async function updateQdrantPointPayload(pointId, payload) {
  /**
   * Update a single Qdrant point's payload with graph enrichment
   */
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/${pointId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: payload
      }),
      timeout: 10000
    });

    if (!response.ok) {
      console.warn(`  ⚠️  Failed to update point ${pointId}: ${response.status}`);
      return false;
    }

    return true;
  } catch (e) {
    console.warn(`  ⚠️  Error updating Qdrant: ${e.message}`);
    return false;
  }
}

async function syncFeatureToQdrant(feature) {
  /**
   * For one feature:
   * 1. Find all Qdrant points with this feature_id
   * 2. Update each point's payload with graph scores
   */
  const points = await findQdrantPointsByFeature(feature.feature_id);

  if (points.length === 0) {
    return 0;
  }

  let updated = 0;

  for (const pointId of points) {
    const payload = {
      pagerank_score: feature.pagerank,
      hits_authority_score: feature.hits_authority,
      community_id: feature.community,
      som_cluster: feature.som_cluster,
      graph_enriched_at: new Date().toISOString()
    };

    if (MODE === 'DRY_RUN') {
      updated++;
    } else {
      const success = await updateQdrantPointPayload(pointId, payload);
      if (success) {
        updated++;
      }
    }
  }

  return updated;
}

async function verifyQdrantEnrichment() {
  /**
   * Proof gate: Check one Qdrant point has pagerank_score in payload
   */
  console.log('\n✅ Verification Gate:');

  try {
    const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: 'pagerank_score',
              exists: {}
            }
          ]
        },
        limit: 1,
        with_payload: true,
        with_vectors: false
      }),
      timeout: 10000
    });

    if (response.ok) {
      const data = await response.json();
      if (data.result?.length > 0) {
        const point = data.result[0];
        console.log(`  ✓ Found Qdrant point with pagerank_score: ${point.id}`);
        console.log(`    Payload: ${JSON.stringify(point.payload, null, 2).split('\n').slice(0, 5).join('\n')}`);
        return true;
      }
    }

    console.log('  ⚠️  No Qdrant points found with pagerank_score');
    return false;
  } catch (e) {
    console.warn(`  ⚠️  Verification failed: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('\n🔄 Phase 102 Step 3: Qdrant Payload Sync\n');
  console.log(`Mode: ${MODE}`);

  try {
    // Step 1: Fetch features from Postgres
    console.log('\n📥 Fetching feature_statistics...');
    const features = await getFeatureStatistics();
    console.log(`  ✓ Loaded ${features.length} features with graph scores`);

    if (features.length === 0) {
      console.log('  ⚠️  No features found with pagerank scores');
      return;
    }

    // Step 2: Sync each feature to Qdrant
    console.log(`\n📊 Syncing ${features.length} features to Qdrant...`);
    let totalUpdated = 0;

    for (const feature of features) {
      const updated = await syncFeatureToQdrant(feature);
      totalUpdated += updated;

      if (updated > 0) {
        console.log(`  ✓ Feature ${feature.feature_id}: ${updated} Qdrant points updated`);
      }
    }

    console.log(`\n  ✓ Total Qdrant points updated: ${totalUpdated}`);

    // Step 3: Verify enrichment
    const verified = await verifyQdrantEnrichment();

    console.log(`\n${verified ? '✅' : '⚠️'} Step 3 ${verified ? 'PROVEN' : 'PARTIAL'}`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
