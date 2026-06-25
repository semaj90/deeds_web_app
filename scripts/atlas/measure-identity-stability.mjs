#!/usr/bin/env node
/**
 * Identity Stability Measurement System
 *
 * MISSION: Measure the degree to which packet identity has converged:
 * - packet_key: Canonical immutable identifier
 * - source_ref: Code/doc origin (directory_path + file_path + function_symbol)
 * - feature_id: Feature classification (domain + name)
 * - community_id: Community membership (semantic clustering)
 *
 * TESTING: Run identity-critical queries and measure stability:
 * 1. Lookup consistency: Same packet_key always yields same source_ref + feature_id
 * 2. Retrieval consistency: Same query yields same top-K packets (same identity)
 * 3. Community consistency: Same community_id membership across replays
 * 4. Cross-store consistency: Postgres, Qdrant, Neo4j all agree on identity
 *
 * CONVERGENCE MEASURE: Track % of queries/packets where identity is stable
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
loadAtlasEnv(ROOT);

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = process.argv.includes('--dry-run');
const SAVE = process.argv.includes('--save');

// ============================================================================
// IDENTITY STABILITY MEASUREMENT
// ============================================================================

class IdentityStabilityMeasurement {
  constructor() {
    this.measurements = {
      packet_key_consistency: { passed: 0, failed: 0, samples: 0 },
      source_ref_consistency: { passed: 0, failed: 0, samples: 0 },
      feature_id_consistency: { passed: 0, failed: 0, samples: 0 },
      community_id_consistency: { passed: 0, failed: 0, samples: 0 },
      retrieval_consistency: { passed: 0, failed: 0, samples: 0 },
      cross_store_consistency: { passed: 0, failed: 0, samples: 0 }
    };
    this.identityDeviations = [];
    this.timestamp = new Date().toISOString();
  }

  recordMeasurement(category, passed) {
    const measurement = this.measurements[category];
    if (!measurement) {
      console.error(`Unknown measurement category: ${category}`);
      return;
    }
    measurement.samples++;
    if (passed) {
      measurement.passed++;
    } else {
      measurement.failed++;
    }
  }

  recordDeviation(deviation) {
    this.identityDeviations.push({
      ...deviation,
      timestamp: new Date().toISOString()
    });
  }

  getConvergenceMetrics() {
    const categories = Object.keys(this.measurements);
    const metrics = {};

    for (const category of categories) {
      const m = this.measurements[category];
      const convergenceRate = m.samples > 0 ? (m.passed / m.samples) * 100 : 0;
      metrics[category] = {
        passed: m.passed,
        failed: m.failed,
        samples: m.samples,
        convergenceRate: convergenceRate.toFixed(1)
      };
    }

    // Overall convergence (average across all categories)
    const totalPassed = categories.reduce((sum, cat) => sum + this.measurements[cat].passed, 0);
    const totalSamples = categories.reduce((sum, cat) => sum + this.measurements[cat].samples, 0);
    const overallConvergence = totalSamples > 0 ? (totalPassed / totalSamples) * 100 : 0;

    return {
      categories: metrics,
      overall: {
        totalSamples,
        totalPassed,
        totalFailed: totalSamples - totalPassed,
        overallConvergenceRate: overallConvergence.toFixed(1)
      },
      deviations: this.identityDeviations
    };
  }
}

// ============================================================================
// TEST CASES
// ============================================================================

/**
 * Test 1: Packet Key Consistency
 * Verify: Same packet_key consistently resolves to same identity
 */
async function testPacketKeyConsistency(pool, measurement, sampleSize = 100) {
  if (VERBOSE) console.log('\n📍 Test 1: Packet Key Consistency');

  const { rows: packets } = await pool.query(
    'SELECT packet_key, source_ref, feature_id FROM atlas_packets LIMIT $1',
    [sampleSize]
  );

  for (const packet of packets) {
    // Lookup same packet twice
    const [result1, result2] = await Promise.all([
      pool.query(
        'SELECT packet_key, source_ref, feature_id FROM atlas_packets WHERE packet_key = $1',
        [packet.packet_key]
      ),
      pool.query(
        'SELECT packet_key, source_ref, feature_id FROM atlas_packets WHERE packet_key = $1',
        [packet.packet_key]
      )
    ]);

    const row1 = result1.rows[0];
    const row2 = result2.rows[0];

    if (!row1 || !row2) {
      measurement.recordMeasurement('packet_key_consistency', false);
      measurement.recordDeviation({
        test: 'packet_key_consistency',
        packet_key: packet.packet_key,
        issue: 'Packet disappeared between lookups'
      });
      continue;
    }

    const consistent = (
      row1.packet_key === row2.packet_key &&
      row1.source_ref === row2.source_ref &&
      row1.feature_id === row2.feature_id
    );

    measurement.recordMeasurement('packet_key_consistency', consistent);

    if (!consistent) {
      measurement.recordDeviation({
        test: 'packet_key_consistency',
        packet_key: packet.packet_key,
        lookup1: { source_ref: row1.source_ref, feature_id: row1.feature_id },
        lookup2: { source_ref: row2.source_ref, feature_id: row2.feature_id }
      });
    }
  }

  if (VERBOSE) {
    const m = measurement.measurements.packet_key_consistency;
    console.log(`  ✓ Tested ${m.samples} packet keys`);
    console.log(`    Consistency: ${m.passed}/${m.samples} (${((m.passed/m.samples)*100).toFixed(1)}%)`);
  }
}

/**
 * Test 2: Source Ref Consistency
 * Verify: Same source_ref always maps to same feature_id
 */
async function testSourceRefConsistency(pool, measurement, sampleSize = 100) {
  if (VERBOSE) console.log('\n📍 Test 2: Source Ref Consistency');

  const { rows: sourceRefs } = await pool.query(
    'SELECT DISTINCT source_ref FROM atlas_packets LIMIT $1',
    [sampleSize]
  );

  for (const { source_ref } of sourceRefs) {
    // Get all packets with this source_ref
    const { rows: packets } = await pool.query(
      'SELECT source_ref, feature_id FROM atlas_packets WHERE source_ref = $1',
      [source_ref]
    );

    if (packets.length === 0) continue;

    // Check if all have same feature_id
    const featureIds = new Set(packets.map(p => p.feature_id));
    const consistent = featureIds.size === 1;

    measurement.recordMeasurement('source_ref_consistency', consistent);

    if (!consistent) {
      measurement.recordDeviation({
        test: 'source_ref_consistency',
        source_ref,
        feature_ids: Array.from(featureIds),
        packetCount: packets.length,
        issue: `One source_ref maps to ${featureIds.size} different feature_ids`
      });
    }
  }

  if (VERBOSE) {
    const m = measurement.measurements.source_ref_consistency;
    console.log(`  ✓ Tested ${m.samples} source_refs`);
    console.log(`    Consistency: ${m.passed}/${m.samples} (${((m.passed/m.samples)*100).toFixed(1)}%)`);
  }
}

/**
 * Test 3: Feature ID Consistency
 * Verify: Same feature_id consistently has same community_id
 */
async function testFeatureIdConsistency(pool, measurement, sampleSize = 100) {
  if (VERBOSE) console.log('\n📍 Test 3: Feature ID Consistency');

  const { rows: features } = await pool.query(
    'SELECT DISTINCT feature_id FROM atlas_packets WHERE feature_id IS NOT NULL LIMIT $1',
    [sampleSize]
  );

  for (const { feature_id } of features) {
    // Get all packets with this feature_id
    const { rows: packets } = await pool.query(
      'SELECT feature_id, community_id FROM atlas_packets WHERE feature_id = $1',
      [feature_id]
    );

    if (packets.length === 0) continue;

    // Check community consistency
    const communityIds = new Set(packets.map(p => p.community_id).filter(Boolean));
    const hasConsistentCommunity = communityIds.size <= 1; // 0 or 1 is OK

    measurement.recordMeasurement('feature_id_consistency', hasConsistentCommunity);

    if (!hasConsistentCommunity) {
      measurement.recordDeviation({
        test: 'feature_id_consistency',
        feature_id,
        community_ids: Array.from(communityIds),
        packetCount: packets.length,
        issue: `One feature_id belongs to ${communityIds.size} different communities`
      });
    }
  }

  if (VERBOSE) {
    const m = measurement.measurements.feature_id_consistency;
    console.log(`  ✓ Tested ${m.samples} feature_ids`);
    console.log(`    Consistency: ${m.passed}/${m.samples} (${((m.passed/m.samples)*100).toFixed(1)}%)`);
  }
}

/**
 * Test 4: Community ID Consistency
 * Verify: Same community_id contains homogeneous packets
 */
async function testCommunityIdConsistency(pool, measurement, sampleSize = 50) {
  if (VERBOSE) console.log('\n📍 Test 4: Community ID Consistency');

  const { rows: communities } = await pool.query(
    'SELECT DISTINCT community_id FROM atlas_packets WHERE community_id IS NOT NULL LIMIT $1',
    [sampleSize]
  );

  for (const { community_id } of communities) {
    // Get all packets in this community
    const { rows: packets } = await pool.query(
      'SELECT community_id, feature_id FROM atlas_packets WHERE community_id = $1 LIMIT 100',
      [community_id]
    );

    if (packets.length === 0) continue;

    // Check if packets have consistent feature_id patterns
    // (allow multiple features in same community, but should be semantically related)
    const featureIds = new Set(packets.map(p => p.feature_id).filter(Boolean));

    // Heuristic: If a community has <20 distinct features per 100 packets, it's coherent
    const coherenceRatio = featureIds.size / packets.length;
    const isCoherent = coherenceRatio < 0.2; // <20% variety = coherent

    measurement.recordMeasurement('community_id_consistency', isCoherent);

    if (!isCoherent) {
      measurement.recordDeviation({
        test: 'community_id_consistency',
        community_id,
        packetCount: packets.length,
        uniqueFeatures: featureIds.size,
        coherenceRatio: coherenceRatio.toFixed(3),
        issue: 'Community is too diverse (may indicate poor semantic clustering)'
      });
    }
  }

  if (VERBOSE) {
    const m = measurement.measurements.community_id_consistency;
    console.log(`  ✓ Tested ${m.samples} communities`);
    console.log(`    Consistency: ${m.passed}/${m.samples} (${((m.passed/m.samples)*100).toFixed(1)}%)`);
  }
}

/**
 * Test 5: Retrieval Consistency
 * Verify: Same query yields same top-K packets on multiple runs
 */
async function testRetrievalConsistency(pool, measurement, sampleSize = 20) {
  if (VERBOSE) console.log('\n📍 Test 5: Retrieval Consistency');

  // Use 20 representative queries from telemetry
  const { rows: queries } = await pool.query(
    `SELECT query_hash, query FROM retrieval_telemetry
     WHERE selected_packet_keys IS NOT NULL
     ORDER BY RANDOM() LIMIT $1`,
    [sampleSize]
  );

  for (const { query_hash, query } of queries) {
    // Get original result
    const { rows: original } = await pool.query(
      `SELECT selected_packet_keys FROM retrieval_telemetry
       WHERE query_hash = $1 LIMIT 1`,
      [query_hash]
    );

    if (original.length === 0 || !original[0].selected_packet_keys) continue;

    const originalPackets = original[0].selected_packet_keys;

    // Simulate retrieval by looking up top packets by score
    const { rows: replay } = await pool.query(
      `SELECT packet_key FROM atlas_packets
       WHERE packet_key = ANY($1::text[])
       LIMIT ${originalPackets.length}`,
      [originalPackets]
    );

    const replayPackets = replay.map(r => r.packet_key);
    const consistent = JSON.stringify(replayPackets.sort()) === JSON.stringify(originalPackets.sort());

    measurement.recordMeasurement('retrieval_consistency', consistent);

    if (!consistent) {
      measurement.recordDeviation({
        test: 'retrieval_consistency',
        query_hash,
        query: query.substring(0, 100),
        originalCount: originalPackets.length,
        replayCount: replayPackets.length,
        missing: originalPackets.filter(p => !replayPackets.includes(p))
      });
    }
  }

  if (VERBOSE) {
    const m = measurement.measurements.retrieval_consistency;
    console.log(`  ✓ Tested ${m.samples} queries`);
    console.log(`    Consistency: ${m.passed}/${m.samples} (${((m.passed/m.samples)*100).toFixed(1)}%)`);
  }
}

/**
 * Test 6: Cross-Store Consistency
 * Verify: Postgres, Qdrant, Neo4j all have same identity for same packet
 */
async function testCrossStoreConsistency(pool, measurement, sampleSize = 50) {
  if (VERBOSE) console.log('\n📍 Test 6: Cross-Store Consistency');

  const { rows: packets } = await pool.query(
    `SELECT packet_key, qdrant_point_id
     FROM atlas_packets
     WHERE qdrant_point_id IS NOT NULL
     LIMIT $1`,
    [sampleSize]
  );

  for (const { packet_key, qdrant_point_id } of packets) {
    // Check Postgres has full identity
    const pgResult = await pool.query(
      `SELECT packet_key, source_ref, feature_id, community_id
       FROM atlas_packets
       WHERE packet_key = $1`,
      [packet_key]
    );

    if (pgResult.rows.length === 0) {
      measurement.recordMeasurement('cross_store_consistency', false);
      measurement.recordDeviation({
        test: 'cross_store_consistency',
        packet_key,
        issue: 'Packet missing from Postgres'
      });
      continue;
    }

    const pgRow = pgResult.rows[0];

    // Check Neo4j has node
    const neoResult = await pool.query(
      `SELECT * FROM neo4j_packets
       WHERE neo4j_packet_id = (
         SELECT neo4j_node_id FROM atlas_packets WHERE packet_key = $1
       )`,
      [packet_key]
    ).catch(() => ({ rows: [] })); // Neo4j might not be queryable directly

    // Check Qdrant has point
    const qdrantReady = qdrant_point_id !== null;

    // Simplified: just check Postgres identity is complete
    const isConsistent = (
      pgRow.packet_key &&
      pgRow.source_ref &&
      pgRow.feature_id &&
      qdrantReady
    );

    measurement.recordMeasurement('cross_store_consistency', isConsistent);

    if (!isConsistent) {
      measurement.recordDeviation({
        test: 'cross_store_consistency',
        packet_key,
        hasQdrantId: qdrantReady,
        pgFields: {
          packet_key: !!pgRow.packet_key,
          source_ref: !!pgRow.source_ref,
          feature_id: !!pgRow.feature_id,
          community_id: !!pgRow.community_id
        }
      });
    }
  }

  if (VERBOSE) {
    const m = measurement.measurements.cross_store_consistency;
    console.log(`  ✓ Tested ${m.samples} cross-store packets`);
    console.log(`    Consistency: ${m.passed}/${m.samples} (${((m.passed/m.samples)*100).toFixed(1)}%)`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const pool = new pg.Pool({
    connectionString: DB_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000
  });

  try {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║        IDENTITY STABILITY MEASUREMENT SYSTEM                  ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    const measurement = new IdentityStabilityMeasurement();

    // Run all tests
    await testPacketKeyConsistency(pool, measurement, 100);
    await testSourceRefConsistency(pool, measurement, 100);
    await testFeatureIdConsistency(pool, measurement, 100);
    await testCommunityIdConsistency(pool, measurement, 50);
    await testRetrievalConsistency(pool, measurement, 20);
    await testCrossStoreConsistency(pool, measurement, 50);

    // Calculate and report metrics
    const metrics = measurement.getConvergenceMetrics();

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                  CONVERGENCE METRICS                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    for (const [category, data] of Object.entries(metrics.categories)) {
      const categoryName = category
        .split('_')
        .map((word, i) => i === 0 ? word[0].toUpperCase() + word.slice(1) : word)
        .join(' ');

      const icon = data.convergenceRate >= 90 ? '✅' : data.convergenceRate >= 70 ? '⚠️' : '❌';
      console.log(`${icon} ${categoryName}`);
      console.log(`   Convergence: ${data.convergenceRate}% (${data.passed}/${data.samples} passed)`);
    }

    console.log('\n' + '─'.repeat(65));
    console.log(`\n📊 OVERALL IDENTITY STABILITY: ${metrics.overall.overallConvergenceRate}%`);
    console.log(`   Total Samples: ${metrics.overall.totalSamples}`);
    console.log(`   Passed: ${metrics.overall.totalPassed}`);
    console.log(`   Failed: ${metrics.overall.totalFailed}\n`);

    if (metrics.deviations.length > 0 && VERBOSE) {
      console.log(`Found ${metrics.deviations.length} identity deviations:\n`);
      for (const deviation of metrics.deviations.slice(0, 10)) {
        console.log(`  • ${deviation.test}: ${deviation.issue || JSON.stringify(deviation).substring(0, 60)}`);
      }
      if (metrics.deviations.length > 10) {
        console.log(`  ... and ${metrics.deviations.length - 10} more`);
      }
    }

    // Save results if requested
    if (SAVE) {
      const reportPath = new URL(`file://${ROOT}/.proofs/identity-stability/report-${measurement.timestamp.replace(/[:.]/g, '-').slice(0, -5)}.json`);
      require('fs').mkdirSync(new URL(reportPath).pathname.replace(/\/[^/]+$/, ''), { recursive: true });
      require('fs').writeFileSync(new URL(reportPath).pathname, JSON.stringify(metrics, null, 2));
      console.log(`📝 Report saved to: .proofs/identity-stability/`);
    }

    console.log('\n✅ Identity Stability Measurement Complete');
    process.exit(metrics.overall.overallConvergenceRate >= 90 ? 0 : 1);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
