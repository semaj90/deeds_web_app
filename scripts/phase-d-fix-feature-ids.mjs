#!/usr/bin/env node
/**
 * Phase D: Fix feature_id/feature_label mismatches
 *
 * Update Postgres atlas_packets to match Qdrant feature_id values
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';

async function getQdrantData(sourceRef) {
  try {
    const response = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 1,
          with_payload: true,
          with_vector: false,
          filter: {
            must: [{ key: 'source_ref', match: { value: sourceRef } }]
          }
        })
      }
    );

    if (!response.ok) return null;
    const data = await response.json();
    return data.result?.points?.[0]?.payload ?? null;
  } catch (err) {
    console.error('Error fetching from Qdrant:', err.message);
    return null;
  }
}

async function main() {
  console.log('═══ Phase D: Fix Feature ID/Label Mismatches ═══\n');

  const filesToFix = [
    'src/lib/server/ai/contextual-tools.ts',
    'src/lib/server/research/reddit-harvester.ts',
    'src/lib/server/couchdb/mango-indexes.ts',
    'src/lib/server/data/legal-seed-data.ts',
    'src/lib/components/citations/citationsaveform.svelte',
    'src/lib/server/retrieval/cluster-aware-reranker.ts',
    'src/lib/server/admin/retrieval-analytics-service.ts'
  ];

  try {
    for (const file of filesToFix) {
      console.log(`Fixing ${file}...`);

      // Get correct feature_id from Qdrant
      const qdrantData = await getQdrantData(file);
      if (!qdrantData) {
        console.log(`  ⚠️  Not found in Qdrant`);
        continue;
      }

      const correctFeatureId = qdrantData.feature_id;
      const correctFeatureLabel = qdrantData.feature_label;
      const correctPacketKey = qdrantData.packet_key;

      console.log(`  From Qdrant: feature_id=${correctFeatureId}, feature_label=${correctFeatureLabel}`);

      // Update Postgres
      const res = await pool.query(`
        UPDATE atlas_packets
        SET feature_id = $1, feature_label = $2, packet_key = COALESCE($3, packet_key)
        WHERE source_ref = $4
        RETURNING packet_id
      `, [
        correctFeatureId,
        correctFeatureLabel,
        correctPacketKey,
        file
      ]);

      if (res.rows.length > 0) {
        console.log(`  ✅ Updated`);
      } else {
        console.log(`  ❌ Not found in Postgres`);
      }
    }

    console.log('\n--- Summary ---');
    const count = await pool.query(
      "SELECT COUNT(*) FROM atlas_packets WHERE metadata->>'source' = $1",
      ['phase_d_recovery']
    );
    console.log(`Records with phase_d_recovery source: ${count.rows[0].count}`);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
