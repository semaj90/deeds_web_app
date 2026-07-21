#!/usr/bin/env node

/**
 * Phase 107 PageRank Probe
 *
 * Verifies Neo4j GDS and Postgres connectivity before executing full PageRank computation.
 * Checks: Neo4j service health, Postgres connection, atlas_topology_index state, and
 * displays the execution pipeline outline.
 *
 * Usage:
 *   node scripts/atlas/phase107-pagerank-probe.mjs [--verbose]
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env') });

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j';

const PG_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const PG_PORT = process.env.DATABASE_PORT || '5434';
const PG_USER = process.env.DATABASE_USER || 'legal_admin';
const PG_PASSWORD = process.env.DATABASE_PASSWORD || '123456';
const PG_DB = process.env.DATABASE_NAME || 'legal_ai_db';

const { Pool } = pg;

async function probeNeo4j() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║    PHASE 1: Neo4j GDS Service Health Check     ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  try {
    const httpUri = NEO4J_URI.replace('bolt://', 'http://').replace(':7687', ':7474');
    const auth = Buffer.from(`${NEO4J_USER}:${NEO4J_PASSWORD}`).toString('base64');
    const response = await fetch(`${httpUri}/db/neo4j/`, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}` },
      timeout: 5000,
    });

    if (response.ok || response.status === 401) {
      console.log('✅ Neo4j service is reachable');
      console.log(`   URI: ${NEO4J_URI}`);
      console.log(`   User: ${NEO4J_USER}`);
      return true;
    }
  } catch (err) {
    console.log(`⚠️  Neo4j service unreachable: ${err.message}`);
    console.log(`   URI: ${NEO4J_URI}`);
    console.log(`   This is expected if Neo4j is not running. PageRank will be deferred.\n`);
    return false;
  }
}

async function probePostgres() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║     PHASE 2: Postgres Connection Probe         ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const pool = new Pool({
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database: PG_DB,
  });

  try {
    const res = await pool.query('SELECT version()');
    const version = res.rows[0].version;
    console.log('✅ Postgres connection successful');
    console.log(`   Host: ${PG_HOST}:${PG_PORT}`);
    console.log(`   Database: ${PG_DB}`);
    console.log(`   Version: ${version.split(',')[0]}\n`);
    return pool;
  } catch (err) {
    console.log(`❌ Postgres connection failed: ${err.message}`);
    await pool.end();
    process.exit(1);
  }
}

async function probeTopologyIndex(pool) {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║    PHASE 3: atlas_topology_index State         ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  try {
    const res = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN pagerank IS NOT NULL THEN 1 END) as with_pagerank,
        COUNT(CASE WHEN pagerank > 0 THEN 1 END) as nonzero_pagerank,
        MIN(pagerank) as min_pagerank,
        MAX(pagerank) as max_pagerank,
        AVG(pagerank) as avg_pagerank
      FROM atlas_topology_index
    `);

    const stats = res.rows[0];
    console.log(`Total topology rows: ${stats.total}`);
    console.log(`Rows with PageRank: ${stats.with_pagerank} (${((stats.with_pagerank / stats.total) * 100).toFixed(1)}%)`);
    console.log(`Non-zero PageRank: ${stats.nonzero_pagerank}`);

    if (stats.with_pagerank > 0) {
      console.log(`PageRank range: ${stats.min_pagerank?.toFixed(6)} → ${stats.max_pagerank?.toFixed(6)}`);
      console.log(`PageRank mean: ${stats.avg_pagerank?.toFixed(6)}`);
    } else {
      console.log('PageRank range: N/A (no values computed yet)');
    }

    return stats;
  } catch (err) {
    console.log(`❌ Error querying atlas_topology_index: ${err.message}`);
    await pool.end();
    process.exit(1);
  }
}

async function displayPipeline() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║    PHASE 107 PageRank Execution Pipeline       ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  console.log('STAGE 1: Extract Packet Graph from Neo4j');
  console.log('  └─ Cypher query: MATCH (p:CodebaseFile)-[r:USES]->(q:CodebaseFile)');
  console.log('  └─ Project graph: nodes={CodebaseFile}, edges={USES, IMPORTS, DEPENDS_ON}');
  console.log('  └─ Output: 61,659 nodes, ~100K edges (estimate)\n');

  console.log('STAGE 2: Compute PageRank via NetworkX (or Neo4j GDS)');
  console.log('  └─ Algorithm: PageRank with 0.15 teleport probability');
  console.log('  └─ Iterations: 100 (convergence threshold < 1e-6)');
  console.log('  └─ Output: scores in range [0.0, ~1.0] per node\n');

  console.log('STAGE 3: Materialize PageRank to atlas_topology_index');
  console.log('  └─ UPDATE atlas_topology_index SET pagerank = $1');
  console.log('  └─ WHERE packet_key IN (select packet_key from atlas_packets)');
  console.log('  └─ Expected writes: 67,189 rows (all topology index rows)\n');

  console.log('STAGE 4: Registry Alignment Materialization');
  console.log('  └─ Run: materialize-feature-registry-alignment.mjs --apply');
  console.log('  └─ Projects topology evidence to 4,209 registry rows');
  console.log('  └─ Expected topology lane improvement: 1.85% → ~50%\n');

  console.log('STAGE 5: Validator Verification');
  console.log('  └─ Run: npm run daily:graphify');
  console.log('  └─ Verify 6-lane validator topology score rises\n');
}

async function main() {
  console.log('\n🚀 Phase 107 PageRank Probe\n');

  // Probe Neo4j (optional)
  await probeNeo4j();

  // Probe Postgres (required)
  const pool = await probePostgres();

  // Check topology index state
  const stats = await probeTopologyIndex(pool);

  // Display pipeline
  await displayPipeline();

  // Summary
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║              Probe Summary                     ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  if (stats.with_pagerank === '0') {
    console.log('⚠️  READY FOR COMPUTATION');
    console.log('   PageRank is not yet computed.');
    console.log('   Next: Run PageRank computation via Mastra orchestrator\n');
    console.log('   Command: npm run atlas:orchestrator:compute-pagerank --apply\n');
  } else {
    console.log('✅ PageRank ALREADY MATERIALIZED');
    console.log(`   ${stats.with_pagerank} / ${stats.total} rows have values`);
    console.log('   Next: Run registry materialization\n');
    console.log('   Command: node scripts/atlas/materialize-feature-registry-alignment.mjs --apply\n');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('❌ Probe failed:', err.message);
  if (verbose) console.error(err.stack);
  process.exit(1);
});
