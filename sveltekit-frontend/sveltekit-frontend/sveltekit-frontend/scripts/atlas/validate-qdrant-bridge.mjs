#!/usr/bin/env node
/**
 * P0 SCRIPT: Qdrant Bridge Validation (Query-Time Lookup Proof)
 * 
 * Validates whether we can build a working bridge by:
 * 1. Sample 100 packets WITH source_ref but WITHOUT qdrant_point_id
 * 2. Try to find matching Qdrant points via source_ref payload matching
 * 3. Report coverage percentage if successful
 * 4. Identify any ambiguities (multiple Qdrant points for same source_ref)
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:legal_password@127.0.0.1:5434/legal_ai_db'
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('P0: Qdrant Bridge Validation (Query-Time Lookup)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Step 1: Get sample of packets WITH source_ref but WITHOUT qdrant_point_id
    console.log('Step 1: Sample 100 packets with source_ref but no qdrant_point_id...');
    const sampleResult = await client.query(`
      SELECT packet_key, source_ref, feature_id
      FROM atlas_packets
      WHERE source_ref IS NOT NULL AND source_ref != ''
        AND (qdrant_point_id IS NULL OR qdrant_point_id = '')
      ORDER BY RANDOM()
      LIMIT 100
    `);

    const samples = sampleResult.rows;
    console.log(`  Found ${samples.length} packets\n`);

    if (samples.length === 0) {
      console.log('  ERROR: No packets with source_ref but without qdrant_point_id!');
      return;
    }

    // Step 2: Query Qdrant for each sample
    console.log('Step 2: Query Qdrant payloads to find matches...');
    let foundMatches = 0;
    let ambiguousMatches = 0;
    const matchResults = [];

    for (const sample of samples.slice(0, 10)) { // Test first 10
      const sourceRef = sample.source_ref;
      
      // Query Qdrant with payload filter for source_ref
      try {
        const response = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768/points/scroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {
              must: [
                {
                  key: 'source_ref',
                  match: { value: sourceRef }
                }
              ]
            },
            limit: 10,
            with_payload: true
          })
        });

        if (!response.ok) {
          console.error(`    Failed to query Qdrant for ${sourceRef}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const points = data.result?.points || [];

        if (points.length === 0) {
          console.log(`    [0 matches] ${sourceRef} (packet_key: ${sample.packet_key})`);
        } else if (points.length === 1) {
          console.log(`    [1 match]   ${sourceRef} → qdrant_point_id: ${points[0].id}`);
          foundMatches++;
          matchResults.push({
            packet_key: sample.packet_key,
            source_ref: sourceRef,
            qdrant_point_id: points[0].id
          });
        } else {
          console.log(`    [${points.length} matches] ${sourceRef} (AMBIGUOUS)`);
          ambiguousMatches++;
        }
      } catch (err) {
        console.error(`    Exception querying Qdrant for ${sourceRef}:`, err.message);
      }
    }

    console.log(`\n  Summary:
    - Tested: 10 packets
    - Found single match: ${foundMatches}
    - Ambiguous (multiple matches): ${ambiguousMatches}
    - No match: ${10 - foundMatches - ambiguousMatches}`);

    // Step 3: Report on bridge viability
    console.log('\nStep 3: Bridge Viability Assessment');
    if (foundMatches >= 8) {
      console.log('  ✅ HIGH VIABILITY: Query-time lookup is likely to work');
      console.log('  Recommendation: Implement v_packet_qdrant_lookup view');
    } else if (foundMatches >= 5) {
      console.log('  ⚠️  PARTIAL VIABILITY: May need fallback strategy');
    } else {
      console.log('  ❌ LOW VIABILITY: source_ref matching alone insufficient');
    }

    console.log('\nStep 4: Batch Coverage Estimate');
    const totalPacketsWithoutId = 53640;
    const estimatedCoverage = (foundMatches / 10) * 100;
    const estimatedRecoverable = Math.round(totalPacketsWithoutId * (foundMatches / 10));
    console.log(`  If pattern holds across all ${totalPacketsWithoutId} packets:`);
    console.log(`  - Estimated coverage: ${estimatedCoverage.toFixed(1)}%`);
    console.log(`  - Estimated recoverable: ${estimatedRecoverable} packets`);
    console.log(`  - Target: ≥95% (${Math.round(totalPacketsWithoutId * 0.95)} packets)`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
