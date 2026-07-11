#!/usr/bin/env node
/**
 * P0 V3: Prove we can join via source_ref payload matching
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

async function main() {
  const client = await pool.connect();
  try {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('P0 V3: Query-Time Bridge via Qdrant Payloads');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Sample a few Qdrant points to see what source_ref values look like
    console.log('Step 1: Sample Qdrant payload source_ref values...\n');

    const response = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 5,
        with_payload: true
      })
    });

    const data = await response.json();
    const qdrantPoints = data.result?.points || [];

    console.log('Sample Qdrant source_ref values:');
    for (const pt of qdrantPoints) {
      const sourceRef = pt.payload?.source_ref || 'NULL';
      console.log(`  Qdrant ID: ${pt.id} → source_ref: "${sourceRef}"`);
    }

    // Now sample Postgres packets and try to find them in Qdrant
    console.log('\nStep 2: Sample Postgres packets and search Qdrant...\n');

    const pgResult = await client.query(`
      SELECT packet_key, source_ref
      FROM atlas_packets
      WHERE source_ref IS NOT NULL AND source_ref != ''
        AND (qdrant_point_id IS NULL OR qdrant_point_id = '')
      ORDER BY RANDOM()
      LIMIT 5
    `);

    let foundCount = 0;

    for (const pgPacket of pgResult.rows) {
      const sourceRef = pgPacket.source_ref;
      console.log(`Searching for: "${sourceRef}"`);

      // Query Qdrant for this exact source_ref
      const searchResponse = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: {
            must: [{
              key: 'source_ref',
              match: { value: sourceRef }
            }]
          },
          limit: 3,
          with_payload: false
        })
      });

      const searchData = await searchResponse.json();
      const matches = searchData.result?.points || [];

      if (matches.length === 1) {
        foundCount++;
        console.log(`  ✅ Found 1 point: ${matches[0].id}\n`);
      } else if (matches.length > 1) {
        console.log(`  ⚠️  Found ${matches.length} points (ambiguous)\n`);
      } else {
        console.log(`  ❌ No match\n`);
      }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Result: ${foundCount}/5 packets found in Qdrant via source_ref`);
    console.log('═══════════════════════════════════════════════════════════\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
