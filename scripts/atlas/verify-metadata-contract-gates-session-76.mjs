#!/usr/bin/env node
/**
 * verify-metadata-contract-gates-session-76.mjs
 *
 * Three-Gate Verification System (Session 76 Final Checkpoint)
 *
 * Purpose:
 *   Validates that all three gates PASS before Phase B execution:
 *   Gate 1: Postgres SOM coverage (directory_path, som_row, som_col)
 *   Gate 2: Neo4j topology identity (cell_id, som_cluster properties on nodes)
 *   Gate 3: Qdrant metadata contract (normalized payloads, retrieval_strategy)
 *
 * Output:
 *   - Final gate status (PASS/FAIL/PARTIAL)
 *   - Recommendation on Phase B readiness
 *   - Detailed report: verify_metadata_gates_report.json
 *
 * Usage:
 *   node scripts/atlas/verify-metadata-contract-gates-session-76.mjs [--verbose]
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import { QdrantClient } from '@qdrant/js-client-rest';

// ── CLI flags ─────────────────────────────────────────────────────────────
const VERBOSE = process.argv.includes('--verbose');

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

// ── Config ─────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL || 'redis://:redis@127.0.0.1:6379';
const NEO4J_URL = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || 'neo4j123';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

// ── Postgres pool ──────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ── Neo4j driver ───────────────────────────────────────────────────────────
const neo4jDriver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));

// ── Qdrant client ──────────────────────────────────────────────────────────
const qdrantClient = new QdrantClient({ url: QDRANT_URL });

/**
 * Gate 1: Postgres SOM Coverage
 */
async function gate1PostgresSomCoverage() {
  log(`\n╔════════════════════════════════════════════════════════════╗`);
  log(`║ GATE 1: Postgres SOM Coverage                              ║`);
  log(`╚════════════════════════════════════════════════════════════╝`);

  try {
    const result = await query(`
      SELECT
        COUNT(*) AS total_packets,
        COUNT(CASE WHEN som_row IS NOT NULL AND som_col IS NOT NULL THEN 1 END) AS with_som,
        COUNT(CASE WHEN directory_path IS NOT NULL THEN 1 END) AS with_directory
      FROM atlas_packets
    `);

    const { total_packets, with_som, with_directory } = result[0];
    const somCoverage = total_packets > 0 ? (with_som / total_packets * 100).toFixed(2) : 0;
    const directoryCoverage = total_packets > 0 ? (with_directory / total_packets * 100).toFixed(2) : 0;

    log(`\n  Total packets: ${total_packets}`);
    log(`  With som_row/som_col: ${with_som} (${somCoverage}%)`);
    log(`  With directory_path: ${with_directory} (${directoryCoverage}%)`);

    const pass = with_som === total_packets && with_directory === total_packets;
    if (pass) {
      log(`\n  ✅ GATE 1: PASS`);
    } else {
      log(`\n  ❌ GATE 1: FAIL`);
    }

    return {
      status: pass ? 'PASS' : 'FAIL',
      total_packets,
      with_som,
      som_coverage_pct: parseFloat(somCoverage),
      with_directory,
      directory_coverage_pct: parseFloat(directoryCoverage),
    };
  } catch (e) {
    log(`\n  ❌ GATE 1: ERROR — ${e.message}`);
    return { status: 'ERROR', message: e.message };
  }
}

/**
 * Gate 2: Neo4j Topology Identity
 */
async function gate2Neo4jTopologyIdentity() {
  log(`\n╔════════════════════════════════════════════════════════════╗`);
  log(`║ GATE 2: Neo4j Topology Identity                            ║`);
  log(`╚════════════════════════════════════════════════════════════╝`);

  const session = neo4jDriver.session();

  try {
    // Check for cell_id and som_cluster properties
    const result = await session.run(`
      MATCH (n:CodebaseFile)
      RETURN
        count(n) AS total_nodes,
        count(CASE WHEN n.cell_id IS NOT NULL THEN 1 END) AS with_cell_id,
        count(CASE WHEN n.som_cluster IS NOT NULL THEN 1 END) AS with_som_cluster
    `);

    const record = result.records[0];
    const totalNodes = record.get('total_nodes') || 0;
    const withCellId = record.get('with_cell_id') || 0;
    const withSomCluster = record.get('with_som_cluster') || 0;

    const cellIdCoverage = totalNodes > 0 ? (withCellId / totalNodes * 100).toFixed(2) : 0;
    const somClusterCoverage = totalNodes > 0 ? (withSomCluster / totalNodes * 100).toFixed(2) : 0;

    log(`\n  Total CodebaseFile nodes: ${totalNodes}`);
    log(`  With cell_id: ${withCellId} (${cellIdCoverage}%)`);
    log(`  With som_cluster: ${withSomCluster} (${somClusterCoverage}%)`);

    const pass = withCellId === totalNodes && withSomCluster === totalNodes;
    if (pass) {
      log(`\n  ✅ GATE 2: PASS`);
    } else {
      log(`\n  ❌ GATE 2: FAIL`);
    }

    return {
      status: pass ? 'PASS' : 'FAIL',
      total_nodes: totalNodes,
      with_cell_id: withCellId,
      cell_id_coverage_pct: parseFloat(cellIdCoverage),
      with_som_cluster: withSomCluster,
      som_cluster_coverage_pct: parseFloat(somClusterCoverage),
    };
  } catch (e) {
    log(`\n  ❌ GATE 2: ERROR — ${e.message}`);
    return { status: 'ERROR', message: e.message };
  } finally {
    await session.close();
  }
}

/**
 * Gate 3: Qdrant Metadata Contract
 */
async function gate3QdrantMetadataContract() {
  log(`\n╔════════════════════════════════════════════════════════════╗`);
  log(`║ GATE 3: Qdrant Metadata Contract                           ║`);
  log(`╚════════════════════════════════════════════════════════════╝`);

  try {
    const collectionInfo = await qdrantClient.getCollection('codebase_chunks_768');
    const totalPoints = collectionInfo.points_count;

    // Scroll and check for critical fields
    let criticalFieldCount = 0;
    let normalizedSourceRefCount = 0;
    let retrievalStrategyCount = 0;
    const sampleSize = Math.min(100, totalPoints);
    let scannedCount = 0;

    const scrollResp = await qdrantClient.scroll('codebase_chunks_768', {
      limit: sampleSize,
      with_payload: true,
      with_vectors: false,
    });

    for (const point of scrollResp.points) {
      scannedCount++;
      const payload = point.payload || {};

      // Check for key fields
      const hasPacketKey = !!payload.packet_key;
      const hasSourceRef = !!payload.source_ref;
      const hasFeatureId = !!payload.feature_id;

      if (hasPacketKey && hasSourceRef && hasFeatureId) {
        criticalFieldCount++;
      }

      if (payload.source_ref && !payload.sourceRef) {
        normalizedSourceRefCount++;
      }

      if (payload.retrieval_strategy) {
        retrievalStrategyCount++;
      }
    }

    const criticalCoverage = (criticalFieldCount / scannedCount * 100).toFixed(2);
    const sourceRefNormalization = (normalizedSourceRefCount / scannedCount * 100).toFixed(2);
    const retrievalStrategyCoverage = (retrievalStrategyCount / scannedCount * 100).toFixed(2);

    log(`\n  Total points: ${totalPoints}`);
    log(`  Sampled: ${scannedCount}`);
    log(`  With packet_key + source_ref + feature_id: ${criticalFieldCount} (${criticalCoverage}%)`);
    log(`  With normalized source_ref (not sourceRef): ${normalizedSourceRefCount} (${sourceRefNormalization}%)`);
    log(`  With retrieval_strategy: ${retrievalStrategyCount} (${retrievalStrategyCoverage}%)`);

    const pass = retrievalStrategyCount === scannedCount && normalizedSourceRefCount === scannedCount && criticalFieldCount === scannedCount;
    const partial = retrievalStrategyCount > scannedCount * 0.5;

    if (pass) {
      log(`\n  ✅ GATE 3: PASS`);
    } else if (partial) {
      log(`\n  ⚠️  GATE 3: PARTIAL`);
    } else {
      log(`\n  ❌ GATE 3: FAIL`);
    }

    return {
      status: pass ? 'PASS' : partial ? 'PARTIAL' : 'FAIL',
      total_points: totalPoints,
      sampled: scannedCount,
      critical_field_coverage_pct: parseFloat(criticalCoverage),
      normalized_source_ref_pct: parseFloat(sourceRefNormalization),
      retrieval_strategy_coverage_pct: parseFloat(retrievalStrategyCoverage),
    };
  } catch (e) {
    log(`\n  ❌ GATE 3: ERROR — ${e.message}`);
    return { status: 'ERROR', message: e.message };
  }
}

/**
 * Main execution.
 */
async function main() {
  log(`\n${'═'.repeat(60)}`);
  log(`  METADATA CONTRACT THREE-GATE VERIFICATION (Session 76)`);
  log(`${'═'.repeat(60)}`);

  const gate1 = await gate1PostgresSomCoverage();
  const gate2 = await gate2Neo4jTopologyIdentity();
  const gate3 = await gate3QdrantMetadataContract();

  // Final verdict
  log(`\n╔════════════════════════════════════════════════════════════╗`);
  log(`║ FINAL VERDICT                                              ║`);
  log(`╚════════════════════════════════════════════════════════════╝\n`);

  const gates = [
    { name: 'Gate 1: Postgres SOM', status: gate1.status },
    { name: 'Gate 2: Neo4j Identity', status: gate2.status },
    { name: 'Gate 3: Qdrant Contract', status: gate3.status },
  ];

  for (const { name, status } of gates) {
    const symbol = status === 'PASS' ? '✅' : status === 'PARTIAL' ? '⚠️ ' : '❌';
    log(`  ${symbol} ${name}: ${status}`);
  }

  const allPass = gates.every(g => g.status === 'PASS');
  const anyFail = gates.some(g => g.status === 'FAIL');

  log(`\n${'─'.repeat(60)}`);
  if (allPass) {
    log(`  🟢 PHASE B READY — All gates PASS, proceed with --apply`);
  } else if (anyFail) {
    log(`  🔴 PHASE B BLOCKED — One or more gates FAIL`);
    log(`     Run repair scripts and verify again before --apply`);
  } else {
    log(`  🟡 PHASE B CONDITIONAL — Some gates are PARTIAL`);
    log(`     Review and normalize before proceeding`);
  }
  log(`${'─'.repeat(60)}\n`);

  // Write report
  const report = {
    generated: new Date().toISOString(),
    gates: { gate1, gate2, gate3 },
    verdict: allPass ? 'READY' : anyFail ? 'BLOCKED' : 'CONDITIONAL',
    phase_b_go: allPass,
  };

  console.log(JSON.stringify(report, null, 2));

  await pool.end();
  await neo4jDriver.close();

  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
