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

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = 'codebase_chunks_768';

const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5434');
const DB_USER = process.env.DATABASE_USER || 'legal_admin';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || '123456';
const DB_NAME = process.env.DATABASE_NAME || 'legal_ai_db';

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

async function queryQdrantByFilter(filter, limit = 100) {
  const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter,
      limit,
      with_payload: true,
      with_vector: false
    }),
    timeout: 10000
  });
  if (!response.ok) throw new Error(`Qdrant query failed: ${response.status}`);
  const data = await response.json();
  return data.result?.points ?? [];
}

async function findQdrantPointsByFeature(featureId) {
  try {
    const points = await queryQdrantByFilter({
      must: [{ key: 'feature_id', match: { value: featureId } }]
    });
    return points.map((p) => p.id);
  } catch (e) {
    console.warn(`  ⚠️  Error querying Qdrant: ${e.message}`);
    return [];
  }
}

async function updateQdrantPointPayload(pointId, payload) {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/${pointId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
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
  const points = await findQdrantPointsByFeature(feature.feature_id);
  if (points.length === 0) return 0;

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
    } else if (await updateQdrantPointPayload(pointId, payload)) {
      updated++;
    }
  }

  return updated;
}

async function verifyQdrantEnrichment() {
  console.log('\n✅ Verification Gate:');
  try {
    const points = await queryQdrantByFilter({
      must: [{ key: 'pagerank_score', is_empty: false }]
    }, 1);

    if (points.length > 0) {
      const point = points[0];
      console.log(`  ✓ Found Qdrant point with pagerank_score: ${point.id}`);
      console.log(`    Payload: ${JSON.stringify(point.payload, null, 2).split('\n').slice(0, 5).join('\n')}`);
      return true;
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
    console.log('\n📥 Fetching feature_statistics...');
    const features = await getFeatureStatistics();
    console.log(`  ✓ Loaded ${features.length} features with graph scores`);

    if (features.length === 0) {
      console.log('  ⚠️  No features found with pagerank scores');
      return;
    }

    console.log(`\n📊 Syncing ${features.length} features to Qdrant...`);
    let totalUpdated = 0;

    for (const feature of features) {
      const updated = await syncFeatureToQdrant(feature);
      totalUpdated += updated;
      if (updated > 0) console.log(`  ✓ Feature ${feature.feature_id}: ${updated} Qdrant points updated`);
    }

    console.log(`\n  ✓ Total Qdrant points updated: ${totalUpdated}`);
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
