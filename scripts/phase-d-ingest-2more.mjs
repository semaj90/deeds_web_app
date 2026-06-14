#!/usr/bin/env node
import pg from 'pg';
import { randomUUID } from 'crypto';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const files = [
  'src/lib/components/graph/glyphatlasviewer.svelte',
  'src/lib/server/kb/rerank-weight-loader.ts'
];

async function main() {
  try {
    for (const file of files) {
      const check = await pool.query('SELECT packet_id FROM atlas_packets WHERE source_ref = $1', [file]);
      if (check.rows.length > 0) {
        console.log('✅ Already exists:', file);
        continue;
      }

      // Query Qdrant for correct feature_id
      const qdrantRes = await fetch('http://localhost:6333/collections/codebase_chunks_768/points/scroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 1,
          with_payload: true,
          filter: { must: [{ key: 'source_ref', match: { value: file } }] }
        })
      });

      const qdrantData = await qdrantRes.json();
      const payload = qdrantData.result?.points?.[0]?.payload;

      if (!payload) {
        console.log('❌ Not in Qdrant:', file);
        continue;
      }

      const packetId = randomUUID();

      const res = await pool.query(`
        INSERT INTO atlas_packets (packet_id, artifact_id, source_ref, feature_id, feature_label, packet_key, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING packet_id
      `, [
        packetId, packetId, file,
        payload.feature_id, payload.feature_label,
        payload.packet_key || (file + ':' + packetId.slice(-8)),
        JSON.stringify({ source: 'phase_d_recovery' })
      ]);

      console.log('✅ Inserted:', file, '→ feature_id=' + payload.feature_id);
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
