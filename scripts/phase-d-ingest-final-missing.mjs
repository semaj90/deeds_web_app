#!/usr/bin/env node
/**
 * Phase D: Ingest final 2 missing packets
 */

import pg from 'pg';
import { randomUUID } from 'crypto';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';

async function getQdrantPayload(sourceRef) {
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
  console.log('═══ Phase D: Ingest Final Missing Packets ═══\n');

  const filesToIngest = [
    'src/lib/components/graph/glyphatlasviewer.svelte',
    'src/lib/server/kb/rerank-weight-loader.ts'
  ];

  try {
    for (const file of filesToIngest) {
      console.log(`Processing ${file}...`);

      // Check if already exists
      const check = await pool.query(
        'SELECT packet_id FROM atlas_packets WHERE source_ref = $1',
        [file]
      );

      if (check.rows.length > 0) {
        console.log('  ✅ Already exists');
        continue;
      }

      // Get data from Qdrant
      const qdrantPayload = await getQdrantPayload(file);
      if (!qdrantPayload) {
        console.log('  ❌ Not found in Qdrant');
        continue;
      }

      const packetId = randomUUID();
      const res = await pool.query(`
        INSERT INTO atlas_packets (
          packet_id, artifact_id, source_ref, feature_id, feature_label, packet_key, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING packet_id
      `, [
        packetId,
        packetId,
        file,
        qdrantPayload.feature_id,
        qdrantPayload.feature_label,
        qdrantPayload.packet_key || (file + ':' + packetId.slice(-8)),
        JSON.stringify({ source: 'phase_d_recovery', ingested_at: new Date().toISOString() })
      ]);

      if (res.rows.length > 0) {
        console.log(`  ✅ Inserted: feature_id=${qdrantPayload.feature_id}`);
      }
    }

    console.log('\n--- Verification ---');
    const count = await pool.query(
      "SELECT COUNT(*) as count FROM atlas_packets WHERE metadata->>'source' = $1",
      ['phase_d_recovery']
    );
    console.log(`Total phase_d_recovery records: ${count.rows[0].count}`);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
