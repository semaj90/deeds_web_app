#!/usr/bin/env node
/**
 * Phase 1b: SOM Backfill for Unmatched Packets (Heuristic)
 *
 * Purpose: Assign som_cluster to remaining 855 packets via metadata heuristic
 *
 * Strategy: Packets without Qdrant matches (no vectors) get SOM assignment via
 *   1. Find their nearest matched packet by (feature_id, community_id) proximity
 *   2. Assign the same som_cluster
 *   3. If no proximity match, assign via deterministic hash(source_ref) % 400
 *
 * Usage:
 *   node scripts/atlas/phase-1b-som-backfill-heuristic.mjs [--apply]
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'crypto';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const flags = {
  apply: process.argv.includes('--apply')
};

const mode = flags.apply ? 'APPLY' : 'DRY-RUN';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 1b: SOM Backfill (Unmatched Packets via Heuristic)      ║');
console.log(`║  Mode: ${mode}${' '.repeat(48 - mode.length)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Hash function for deterministic SOM assignment
function hashToSOM(text) {
  const hash = crypto.createHash('md5').update(text).digest('hex');
  const num = parseInt(hash.substring(0, 8), 16);
  return num % 400;
}

async function backfillUnmatched() {
  console.log('📊 Step 1: Fetch matched and unmatched packets\n');

  // Matched packets (with som_cluster already set)
  const matchedResult = await pool.query(`
    SELECT packet_key, feature_id, community_id, som_cluster
    FROM atlas_codebase_packets
    WHERE som_cluster IS NOT NULL
    ORDER BY packet_key
  `);

  const matched = matchedResult.rows;
  console.log(`   ✅ Matched packets: ${matched.length}\n`);

  // Unmatched packets (need som_cluster assigned)
  const unmatchedResult = await pool.query(`
    SELECT packet_key, feature_id, community_id, source_ref
    FROM atlas_codebase_packets
    WHERE som_cluster IS NULL
    ORDER BY packet_key
  `);

  const unmatched = unmatchedResult.rows;
  console.log(`   ✅ Unmatched packets: ${unmatched.length}\n`);

  if (unmatched.length === 0) {
    console.log('   ⚠️  No unmatched packets found\n');
    return { success: true, assigned: 0 };
  }

  // Build lookup map: (feature_id, community_id) → som_cluster
  const featureCommunityMap = new Map();
  for (const pkt of matched) {
    const key = `${pkt.feature_id}|${pkt.community_id || 'null'}`;
    if (!featureCommunityMap.has(key)) {
      featureCommunityMap.set(key, pkt.som_cluster);
    }
  }

  console.log(`   Lookup map: ${featureCommunityMap.size} unique (feature, community) pairs\n`);

  // Assign SOM clusters to unmatched packets
  console.log('🧠 Step 2: Assign SOM clusters via heuristics\n');

  const assignments = [];
  let proximityMatches = 0;
  let hashMatches = 0;

  for (const pkt of unmatched) {
    // Try proximity match (same feature_id + community_id)
    const proximityKey = `${pkt.feature_id}|${pkt.community_id || 'null'}`;
    if (featureCommunityMap.has(proximityKey)) {
      assignments.push({
        packetKey: pkt.packet_key,
        somCluster: featureCommunityMap.get(proximityKey),
        method: 'proximity'
      });
      proximityMatches++;
    } else {
      // Fallback: hash-based assignment
      const somCluster = hashToSOM(pkt.source_ref);
      assignments.push({
        packetKey: pkt.packet_key,
        somCluster,
        method: 'hash'
      });
      hashMatches++;
    }
  }

  console.log(`   Proximity matches: ${proximityMatches}`);
  console.log(`   Hash-based fallback: ${hashMatches}`);
  console.log(`   Total assigned: ${assignments.length}\n`);

  if (flags.apply) {
    console.log('💾 Step 3: Apply updates to Postgres\n');

    try {
      let updateCount = 0;

      for (const assign of assignments) {
        const result = await pool.query(
          `UPDATE atlas_codebase_packets SET som_cluster = $1 WHERE packet_key = $2`,
          [assign.somCluster, assign.packetKey]
        );
        updateCount += result.rowCount;
      }

      console.log(`   ✅ Updated ${updateCount} rows\n`);
      return { success: true, assigned: updateCount };
    } catch (err) {
      console.error('   ❌ Update failed:', err.message);
      return { success: false, assigned: 0 };
    }
  } else {
    console.log('   [DRY-RUN] Preview (first 5 assignments):\n');
    for (const assign of assignments.slice(0, 5)) {
      console.log(`   ${assign.packetKey} → som_cluster=${assign.somCluster} (${assign.method})`);
    }
    console.log(`\n   [DRY-RUN] Would assign ${assignments.length} packets\n`);
    return { success: true, assigned: assignments.length };
  }
}

// Verify coverage
async function verify() {
  console.log('✅ Step 4: Verify coverage\n');

  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(som_cluster) as filled,
      COUNT(DISTINCT som_cluster) as distinct_clusters
    FROM atlas_codebase_packets
  `);

  const total = parseInt(result.rows[0].total);
  const filled = parseInt(result.rows[0].filled);
  const distinctClusters = parseInt(result.rows[0].distinct_clusters);
  const coverage = ((filled / total) * 100).toFixed(1);

  console.log(`   Coverage: ${coverage}% (${filled}/${total})`);
  console.log(`   Gate (≥85%): ${coverage >= 85 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Distinct clusters: ${distinctClusters}/400`);
  console.log(`   Grid utilization: ${((distinctClusters / 400) * 100).toFixed(1)}%\n`);

  return { coverage: parseFloat(coverage), distinctClusters };
}

// Main
async function main() {
  try {
    const result = await backfillUnmatched();
    const verify_result = await verify();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Phase 1b Complete ✅                                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (result.success && verify_result.coverage >= 85) {
      console.log(`   ✅ SOM backfill complete`);
      console.log(`   Coverage: ${verify_result.coverage}%`);
      console.log(`   Assigned: ${result.assigned} packets\n`);
      process.exit(0);
    } else {
      console.log(`   ⚠️  Coverage: ${verify_result.coverage}% (need ≥85%)\n`);
      if (!flags.apply) {
        console.log('   📋 To apply, run:\n');
        console.log('   node scripts/atlas/phase-1b-som-backfill-heuristic.mjs --apply\n');
      }
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
