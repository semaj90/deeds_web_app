#!/usr/bin/env node
/**
 * Audit: Where is the canonical SOM identity?
 *
 * Goal: Determine which store holds the authoritative SOM topology data
 * BEFORE attempting any retraining or backfilling.
 *
 * Checks (in priority order):
 * 1. atlas_feature_map.som_cluster — Postgres identity table
 * 2. atlas_topology_index — Postgres indexed topology
 * 3. Neo4j node properties — Graph topology
 * 4. Qdrant payload — Mirror verification
 *
 * Output: Single definitive answer + derivation instructions
 */

import pg from 'pg';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  SOM Canonical Location Audit                                 ║');
console.log('║  Find authoritative SOM topology before any training          ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function auditPostgres() {
  console.log('🔍 POSTGRES AUDIT\n');

  try {
    // 1. Check atlas_feature_map schema
    console.log('1️⃣  atlas_feature_map (PRIMARY IDENTITY TABLE)');
    const schemaRes = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'atlas_feature_map'
      ORDER BY ordinal_position
    `);

    const somColumns = schemaRes.rows.filter(col =>
      col.column_name.toLowerCase().includes('som') ||
      col.column_name === 'bmu_row' ||
      col.column_name === 'bmu_col'
    );

    console.log(`   Columns in atlas_feature_map:`);
    for (const col of somColumns) {
      console.log(`     - ${col.column_name} (${col.data_type})`);
    }

    if (somColumns.length === 0) {
      console.log('   ⊘ No SOM-related columns found\n');
    } else {
      // Check coverage
      for (const col of somColumns) {
        const coverageRes = await pool.query(
          `SELECT COUNT(*) as total, COUNT(${col.column_name}) as populated FROM atlas_feature_map`
        );
        const { total, populated } = coverageRes.rows[0];
        const pct = total > 0 ? ((parseInt(populated) / parseInt(total)) * 100).toFixed(1) : 0;
        console.log(`     Coverage: ${populated}/${total} (${pct}%)`);
      }
      console.log();
    }

    // 2. Check atlas_topology_index
    console.log('2️⃣  atlas_topology_index (INDEXED TOPOLOGY)');
    const topoTableRes = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'atlas_topology_index'
      ) as exists
    `);

    if (topoTableRes.rows[0].exists) {
      const topoSchemaRes = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'atlas_topology_index'
        ORDER BY ordinal_position
      `);
      console.log(`   Columns: ${topoSchemaRes.rows.map(r => r.column_name).join(', ')}`);

      const topoCountRes = await pool.query('SELECT COUNT(*) as cnt FROM atlas_topology_index');
      console.log(`   Row count: ${topoCountRes.rows[0].cnt}`);

      // Check for som_row/col
      const topoSomRes = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(som_bmu_row) as row_populated,
          COUNT(som_bmu_col) as col_populated,
          MIN(som_bmu_row) as min_row,
          MAX(som_bmu_row) as max_row,
          MIN(som_bmu_col) as min_col,
          MAX(som_bmu_col) as max_col
        FROM atlas_topology_index
      `);
      const topoStats = topoSomRes.rows[0];
      console.log(`   SOM coverage: row=${topoStats.row_populated}/${topoStats.total}, col=${topoStats.col_populated}/${topoStats.total}`);
      if (topoStats.row_populated > 0) {
        console.log(`   SOM bounds: row [${topoStats.min_row}, ${topoStats.max_row}], col [${topoStats.min_col}, ${topoStats.max_col}]`);
      }
      console.log();
    } else {
      console.log('   ⊘ atlas_topology_index table does not exist\n');
    }

    // 3. Sample actual data from atlas_feature_map
    console.log('3️⃣  atlas_feature_map DATA SAMPLE');
    const sampleRes = await pool.query(`
      SELECT
        id,
        packet_key,
        som_cluster,
        som_bmu_row,
        som_bmu_col,
        qdrant_point_id
      FROM atlas_feature_map
      WHERE som_cluster IS NOT NULL
      LIMIT 5
    `);

    if (sampleRes.rows.length > 0) {
      console.log('   Sample rows (WHERE som_cluster IS NOT NULL):');
      for (const row of sampleRes.rows) {
        console.log(`     - packet_key: ${row.packet_key}`);
        console.log(`       som_cluster: ${row.som_cluster}`);
        console.log(`       som_bmu_row: ${row.som_bmu_row}, som_bmu_col: ${row.som_bmu_col}`);
        console.log(`       qdrant_point_id: ${row.qdrant_point_id}\n`);
      }
    } else {
      console.log('   ⊘ No rows found with som_cluster populated\n');
    }

    // 4. Coverage stats
    console.log('4️⃣  COVERAGE STATISTICS');
    const coverageRes = await pool.query(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(som_cluster) as som_cluster_populated,
        COUNT(som_bmu_row) as som_bmu_row_populated,
        COUNT(som_bmu_col) as som_bmu_col_populated,
        COUNT(CASE WHEN som_bmu_row IS NOT NULL AND som_bmu_col IS NOT NULL THEN 1 END) as both_coords
      FROM atlas_feature_map
    `);

    const coverage = coverageRes.rows[0];
    console.log(`   Total rows: ${coverage.total_rows}`);
    console.log(`   som_cluster populated: ${coverage.som_cluster_populated} (${((coverage.som_cluster_populated / coverage.total_rows) * 100).toFixed(1)}%)`);
    console.log(`   som_bmu_row populated: ${coverage.som_bmu_row_populated} (${((coverage.som_bmu_row_populated / coverage.total_rows) * 100).toFixed(1)}%)`);
    console.log(`   som_bmu_col populated: ${coverage.som_bmu_col_populated} (${((coverage.som_bmu_col_populated / coverage.total_rows) * 100).toFixed(1)}%)`);
    console.log(`   Both coords (row+col): ${coverage.both_coords} (${((coverage.both_coords / coverage.total_rows) * 100).toFixed(1)}%)`);
    console.log();

    return coverage;
  } catch (err) {
    console.error(`❌ Postgres audit failed: ${err.message}\n`);
    return null;
  }
}

async function auditNeo4j() {
  console.log('🔍 NEO4J AUDIT\n');

  console.log('Note: Full Neo4j audit requires Cypher driver.');
  console.log('Run these queries manually in Neo4j Browser (http://localhost:7474):\n');

  const queries = [
    {
      name: 'Node properties inventory',
      query: 'MATCH (n) RETURN DISTINCT keys(n) as props, count(*) as cnt ORDER BY cnt DESC LIMIT 10',
    },
    {
      name: 'SOM-related properties',
      query: `MATCH (n)
WHERE any(key IN keys(n) WHERE key CONTAINS 'som' OR key CONTAINS 'bmu' OR key CONTAINS 'cluster')
RETURN DISTINCT
  [k IN keys(n) WHERE k CONTAINS 'som' OR k CONTAINS 'bmu' OR k CONTAINS 'cluster'] as som_props,
  count(*) as cnt`,
    },
    {
      name: 'Cell ID property check',
      query: 'MATCH (n) WHERE n.cell_id IS NOT NULL RETURN count(n) as nodes_with_cell_id',
    },
    {
      name: 'SIMILAR_TOPOLOGY edges with properties',
      query: `MATCH ()-[r:SIMILAR_TOPOLOGY]->()
RETURN DISTINCT keys(r) as edge_props, count(*) as cnt
LIMIT 5`,
    },
  ];

  for (const q of queries) {
    console.log(`📋 ${q.name}:`);
    console.log(`   ${q.query}\n`);
  }

  console.log('(Neo4j audit DEFERRED — requires manual Cypher execution)\n');
}

async function auditQdrant() {
  console.log('🔍 QDRANT AUDIT\n');

  try {
    // List collections
    const collectionsRes = await fetch(`${QDRANT_URL}/collections`);
    const collectionsData = await collectionsRes.json();

    const relevantCollections = [
      'codebase_chunks_768',
      'codebase_chunks_384',
      'codebase_index',
    ];

    for (const collName of relevantCollections) {
      const coll = collectionsData.result.collections.find(c => c.name === collName);
      if (!coll) {
        console.log(`⊘ ${collName}: not found\n`);
        continue;
      }

      console.log(`✓ ${collName}`);

      // Get collection info
      const collInfoRes = await fetch(`${QDRANT_URL}/collections/${collName}`);
      const collInfo = await collInfoRes.json();
      const pointCount = collInfo.result.points_count || 0;

      console.log(`  Points: ${pointCount}`);
      console.log(`  Payload schema keys: ${Object.keys(collInfo.result.payload_schema?.fields || {}).join(', ')}\n`);

      // Sample points to check for SOM fields
      if (pointCount > 0) {
        const pointsRes = await fetch(`${QDRANT_URL}/collections/${collName}/points/scroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            limit: 10,
            with_payload: true,
            with_vector: false,
          }),
        });

        const pointsData = await pointsRes.json();
        const points = pointsData.result.points || [];

        // Aggregate payload keys
        const payloadKeys = new Set();
        for (const point of points) {
          if (point.payload) {
            for (const key of Object.keys(point.payload)) {
              payloadKeys.add(key);
            }
          }
        }

        const somKeys = Array.from(payloadKeys).filter(k =>
          k.toLowerCase().includes('som') ||
          k.toLowerCase().includes('cluster') ||
          k.toLowerCase().includes('bmu') ||
          k.toLowerCase().includes('cell')
        );

        if (somKeys.length > 0) {
          console.log(`  SOM-related payload fields: ${somKeys.join(', ')}`);
        } else {
          console.log(`  SOM-related payload fields: none detected`);
        }

        // Sample one point fully
        if (points.length > 0) {
          console.log(`\n  Sample point payload keys: ${Object.keys(points[0].payload || {}).join(', ')}`);
        }
        console.log();
      }
    }
  } catch (err) {
    console.error(`❌ Qdrant audit failed: ${err.message}\n`);
  }
}

async function main() {
  const postgresStats = await auditPostgres();
  await auditNeo4j();
  await auditQdrant();

  // Summary and verdict
  console.log('═'.repeat(70));
  console.log('📊 VERDICT: WHERE IS THE CANONICAL SOM IDENTITY?');
  console.log('═'.repeat(70) + '\n');

  if (postgresStats) {
    const hasCluster = postgresStats.som_cluster_populated > 0;
    const hasCoords = postgresStats.both_coords > 0;

    if (hasCoords) {
      console.log('✅ CANONICAL LOCATION: atlas_feature_map.som_bmu_row / som_bmu_col');
      console.log(`   Evidence: ${postgresStats.both_coords}/${postgresStats.total_rows} rows populated`);
      console.log(`   Status: SOM topology EXISTS — this is NOT a training problem\n`);
      console.log('📋 NEXT STEP: Derive cell_id from existing coordinates\n');
      console.log('   Formula: cell_id = som_bmu_row * 20 + som_bmu_col  (for 20×20 grid)\n');
      console.log('   Execute: npm run atlas:som:derive:cell-id\n');
    } else if (hasCluster) {
      console.log('⚠️  PARTIAL LOCATION: atlas_feature_map.som_cluster');
      console.log(`   Evidence: ${postgresStats.som_cluster_populated} rows with som_cluster`);
      console.log(`   Missing: ${postgresStats.som_bmu_row_populated} rows with som_bmu_row\n`);
      console.log('📋 NEXT STEP: Decode som_cluster to get row/col\n');
      console.log('   OR: Run SOM training to generate missing coordinates\n');
    } else {
      console.log('❌ MISSING: No SOM topology found in Postgres');
      console.log('   Status: SOM topology is MISSING — training IS required\n');
      console.log('📋 NEXT STEP: Train SOM on Qdrant embeddings\n');
      console.log('   Execute: npm run atlas:som:train:apply\n');
    }
  }

  console.log('═'.repeat(70));
  console.log('\n📌 Key Questions Answered:');
  console.log('   1. Is som_cluster canonical? ......... ?');
  console.log('   2. Is som_bmu_row/col canonical? .... ?');
  console.log('   3. Is Neo4j cell_id authoritative? .. (deferred)');
  console.log('   4. Is Qdrant payload mirroring it? .. ?');
  console.log('\n   (See output above for definitive answers)\n');

  await pool.end();
}

main().catch(err => {
  console.error('❌ Audit failed:', err);
  process.exit(1);
});
