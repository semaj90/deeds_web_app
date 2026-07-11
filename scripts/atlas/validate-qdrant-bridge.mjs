#!/usr/bin/env node
/**
 * P0 SCRIPT: Qdrant Bridge Validation (Query-Time Lookup Proof)
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
    console.log('P0: Qdrant Bridge Validation (Query-Time Lookup)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 1: Sample packets WITHOUT qdrant_point_id
    console.log('Step 1: Sample 10 packets with source_ref but no qdrant_point_id...');
    const sampleResult = await client.query(`
      SELECT packet_key, source_ref, feature_id
      FROM atlas_packets
      WHERE source_ref IS NOT NULL AND source_ref != ''
        AND (qdrant_point_id IS NULL OR qdrant_point_id = '')
      ORDER BY RANDOM()
      LIMIT 10
    `);

    const samples = sampleResult.rows;
    console.log(`  Found: ${samples.length} packets\n`);

    if (samples.length === 0) {
      console.log('  ❌ No test packets available');
      return;
    }

    // Step 2: Test Qdrant payload filter
    console.log('Step 2: Test Qdrant source_ref filter...\n');
    let foundCount = 0;

    for (const sample of samples) {
      const sourceRef = sample.source_ref;
      
      try {
        const response = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {
              must: [{
                key: 'source_ref',
                match: { value: sourceRef }
              }]
            },
            limit: 5,
            with_payload: true
          })
        });

        if (!response.ok) {
          console.log(`  [QUERY_FAIL] ${sourceRef}`);
          continue;
        }

        const data = await response.json();
        const points = data.result?.points || [];

        if (points.length === 1) {
          foundCount++;
          console.log(`  [✓ 1] ${sourceRef}`);
        } else if (points.length > 1) {
          console.log(`  [⚠️  ${points.length}] ${sourceRef} (AMBIGUOUS)`);
        } else {
          console.log(`  [✗ 0] ${sourceRef}`);
        }
      } catch (err) {
        console.log(`  [ERROR] ${sourceRef}: ${err.message.split('\n')[0]}`);
      }
    }

    console.log(`\n  Results: ${foundCount}/${samples.length} single matches`);

    // Step 3: Bridge viability
    console.log(`\nStep 3: Viability Assessment`);
    const matchRate = (foundCount / samples.length) * 100;
    if (matchRate >= 80) {
      console.log(`  ✅ HIGH: ${matchRate.toFixed(0)}% match rate`);
      console.log(`  → Query-time lookup viable (Option C)`);
    } else if (matchRate >= 50) {
      console.log(`  ⚠️  MEDIUM: ${matchRate.toFixed(0)}% match rate`);
      console.log(`  → Needs supplemental strategy`);
    } else {
      console.log(`  ❌ LOW: ${matchRate.toFixed(0)}% match rate`);
      console.log(`  → Alternative approach needed`);
    }

    console.log(`\nStep 4: Scale Estimate`);
    const totalGap = 53640;
    const estimated = Math.round(totalGap * (foundCount / samples.length));
    console.log(`  If ${matchRate.toFixed(0)}% pattern holds:`);
    console.log(`  - Recoverable: ~${estimated} / ${totalGap} packets`);
    console.log(`  - Coverage target: ≥95% (${Math.round(totalGap * 0.95)} packets)`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
