#!/usr/bin/env node
/**
 * Phase D: Ingest missing packets into Postgres atlas_packets
 *
 * These 3 files exist in Qdrant but are missing from Postgres:
 *   - src/lib/server/ai/contextual-tools.ts
 *   - src/lib/server/research/reddit-harvester.ts
 *   - src/lib/server/couchdb/mango-indexes.ts
 */

import pg from 'pg';
import crypto from 'crypto';
import { createHash } from 'crypto';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const missingFiles = [
  'src/lib/server/ai/contextual-tools.ts',
  'src/lib/server/research/reddit-harvester.ts',
  'src/lib/server/couchdb/mango-indexes.ts',
  'src/lib/server/data/legal-seed-data.ts',
  'src/lib/components/citations/citationsaveform.svelte',
  'src/lib/server/retrieval/cluster-aware-reranker.ts',
  'src/lib/server/admin/retrieval-analytics-service.ts'
];

async function main() {
  console.log('═══ Phase D: Ingest Missing Packets ═══\n');

  try {
    for (const file of missingFiles) {
      // Check if already exists
      const check = await pool.query(
        'SELECT packet_id FROM atlas_packets WHERE source_ref = $1',
        [file]
      );

      if (check.rows.length > 0) {
        console.log('✅ Already exists:', file);
        continue;
      }

      // Extract feature_id from path (e.g., lib/server/ai → ai)
      const parts = file.split('/');
      const featureId = parts[2] || 'lib';
      const featureLabel = featureId.charAt(0).toUpperCase() + featureId.slice(1);

      // Generate packet_id and artifact_id as SHA256(source_ref + timestamp)
      const hash = createHash('sha256');
      hash.update(file + Date.now().toString());
      const packetId = hash.digest('hex');
      const artifactId = packetId;

      // Insert as new packet
      const res = await pool.query(`
        INSERT INTO atlas_packets (
          packet_id, artifact_id, source_ref, feature_id, feature_label, packet_key, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING packet_id
      `, [
        packetId,
        artifactId,
        file,
        featureId,
        featureLabel,
        file + ':' + packetId.slice(-8),
        JSON.stringify({ source: 'phase_d_recovery', ingested_at: new Date().toISOString() })
      ]);

      if (res.rows.length > 0) {
        console.log('✅ Inserted:', file, '→ feature_id=' + featureId);
      }
    }

    console.log('\n--- Verification ---');
    const verify = await pool.query(
      "SELECT COUNT(*) as count FROM atlas_packets WHERE metadata->>'source' = $1",
      ['phase_d_recovery']
    );
    console.log('Total ingested:', verify.rows[0].count);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
