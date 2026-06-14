#!/usr/bin/env node
/**
 * Phase D: Fix missing packet_keys in Qdrant for recently ingested Postgres packets
 * 
 * These 10 files exist in Qdrant but don't have packet_key set.
 * We fetched the canonical packet_key values from Postgres and now update Qdrant.
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';

// These 10 files need packet_key updates in Qdrant
const filesToFix = [
  'src/lib/server/ai/contextual-tools.ts',
  'src/lib/server/research/reddit-harvester.ts',
  'src/lib/server/couchdb/mango-indexes.ts',
  'src/lib/server/data/legal-seed-data.ts',
  'src/lib/components/citations/citationsaveform.svelte',
  'src/lib/server/retrieval/cluster-aware-reranker.ts',
  'src/lib/server/admin/retrieval-analytics-service.ts',
  'src/lib/components/graph/glyphatlasviewer.svelte',
  'sveltekit-frontend/src/routes/api/sse/chat/+server.ts',
  'src/lib/server/kb/rerank-weight-loader.ts'
];

async function getQdrantPointIds(sourceRef) {
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
    return data.result?.points?.[0]?.id ?? null;
  } catch (err) {
    console.error(`Error fetching point for ${sourceRef}:`, err.message);
    return null;
  }
}

async function updateQdrantPayload(pointId, payload) {
  try {
    const response = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION}/points`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [
            {
              id: pointId,
              payload
            }
          ]
        })
      }
    );

    return response.ok;
  } catch (err) {
    console.error(`Error updating point ${pointId}:`, err.message);
    return false;
  }
}

async function main() {
  console.log('═══ Phase D: Fix Missing packet_keys in Qdrant ═══\n');

  try {
    for (const file of filesToFix) {
      console.log(`Processing ${file}...`);

      // Get packet_key from Postgres
      const pgRes = await pool.query(
        'SELECT packet_key FROM atlas_packets WHERE source_ref = $1',
        [file]
      );

      if (pgRes.rows.length === 0) {
        console.log(`  ⚠️  Not found in Postgres`);
        continue;
      }

      const packetKey = pgRes.rows[0].packet_key;
      console.log(`  packet_key: ${packetKey}`);

      // Get Qdrant point ID
      const pointId = await getQdrantPointIds(file);
      if (!pointId) {
        console.log(`  ❌ Not found in Qdrant`);
        continue;
      }

      // Update Qdrant payload with packet_key
      const success = await updateQdrantPayload(pointId, { packet_key: packetKey });
      if (success) {
        console.log(`  ✅ Updated Qdrant point ${pointId}`);
      } else {
        console.log(`  ❌ Failed to update Qdrant point`);
      }
    }

    console.log('\n--- Summary ---');
    console.log('✅ packet_key updates complete for 10 mismatched files');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
