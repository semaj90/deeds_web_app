#!/usr/bin/env node

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Load environment
function loadEnv(root) {
  const envFile = path.join(root, 'sveltekit-frontend', '.env');
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const [key, val] = line.split('=');
      if (key && val && !key.startsWith('#')) {
        process.env[key.trim()] = val.trim();
      }
    }
  }
}

loadEnv(REPO_ROOT);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30000,
});

const results = [];

// ════════════════════════════════════════════════════════════════════════════
// TEST 1: Table existence and row counts
// ════════════════════════════════════════════════════════════════════════════

async function testTableExistence(client) {
  try {
    const rowCounts = await client.query(`
      SELECT 'atlas_codebase_packets' as table_name, COUNT(*) as cnt FROM atlas_codebase_packets
      UNION ALL SELECT 'atlas_tree_nodes', COUNT(*) FROM atlas_tree_nodes
      UNION ALL SELECT 'atlas_summary_layers', COUNT(*) FROM atlas_summary_layers
      UNION ALL SELECT 'atlas_topology_index', COUNT(*) FROM atlas_topology_index;
    `);

    const counts = rowCounts.rows.reduce((acc, row) => {
      acc[row.table_name] = parseInt(row.cnt);
      return acc;
    }, {});

    results.push({
      name: 'Table Existence & Row Counts',
      status: 'pass',
      detail: `4/4 core tables exist: packets(${counts.atlas_codebase_packets}), tree_nodes(${counts.atlas_tree_nodes}), summary_layers(${counts.atlas_summary_layers}), topology_index(${counts.atlas_topology_index})`,
      metrics: counts,
    });
  } catch (err) {
    results.push({
      name: 'Table Existence & Row Counts',
      status: 'fail',
      detail: `Error: ${String(err)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 2: Identity chain integrity
// ════════════════════════════════════════════════════════════════════════════

async function testIdentityChain(client) {
  try {
    const query = `
      SELECT
        COUNT(*) as total_packets,
        SUM(CASE WHEN source_ref IS NULL THEN 1 ELSE 0 END) as missing_source_ref,
        SUM(CASE WHEN packet_key IS NULL THEN 1 ELSE 0 END) as missing_packet_key,
        SUM(CASE WHEN feature_id IS NULL THEN 1 ELSE 0 END) as missing_feature_id,
        COUNT(DISTINCT source_ref) as unique_source_refs,
        COUNT(DISTINCT packet_key) as unique_packet_keys
      FROM atlas_codebase_packets;
    `;

    const res = await client.query(query);
    const row = res.rows[0];
    const missing = (row.missing_source_ref || 0) + (row.missing_packet_key || 0) + (row.missing_feature_id || 0);

    results.push({
      name: 'Identity Chain Integrity',
      status: missing === 0 && row.unique_packet_keys === row.total_packets ? 'pass' : 'warn',
      detail: `${row.total_packets} packets: ${missing} missing identity fields. ${row.unique_source_refs} unique source_refs (${row.total_packets - row.unique_source_refs} shared), ${row.unique_packet_keys} unique packet_keys`,
      metrics: {
        total_packets: row.total_packets,
        missing_identity_fields: missing,
        unique_source_refs: row.unique_source_refs,
        unique_packet_keys: row.unique_packet_keys,
        packets_per_source: (row.total_packets / row.unique_source_refs).toFixed(2),
      },
    });
  } catch (err) {
    results.push({
      name: 'Identity Chain Integrity',
      status: 'fail',
      detail: `Error: ${String(err)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 3: Tree nodes hierarchy
// ════════════════════════════════════════════════════════════════════════════

async function testTreeHierarchy(client) {
  try {
    const query = `
      SELECT
        COUNT(*) as total_nodes,
        COUNT(DISTINCT source_ref) as unique_sources,
        COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as root_nodes,
        COUNT(CASE WHEN parent_id IS NOT NULL THEN 1 END) as child_nodes,
        MAX(tree_depth) as max_depth
      FROM atlas_tree_nodes;
    `;

    const res = await client.query(query);
    const row = res.rows[0];
    const orphaned = 0; // No orphaned check for this schema

    results.push({
      name: 'Tree Hierarchy Structure',
      status: row.root_nodes > 0 && row.child_nodes > 0 ? 'pass' : 'warn',
      detail: `${row.total_nodes} nodes (${row.root_nodes} roots + ${row.child_nodes} children), max_depth=${row.max_depth}`,
      metrics: {
        total_nodes: row.total_nodes,
        root_nodes: row.root_nodes,
        child_nodes: row.child_nodes,
        max_depth: row.max_depth,
      },
    });
  } catch (err) {
    results.push({
      name: 'Tree Hierarchy Structure',
      status: 'fail',
      detail: `Error: ${String(err)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 4: Summary layers coverage
// ════════════════════════════════════════════════════════════════════════════

async function testSummaryLayers(client) {
  try {
    const query = `
      SELECT
        COUNT(*) as total_summaries,
        COUNT(DISTINCT packet_key) as packets_with_summaries,
        SUM(CASE WHEN summary_text IS NULL OR summary_text = '' THEN 1 ELSE 0 END) as empty_summaries,
        COUNT(CASE WHEN metadata::text != '{}' THEN 1 END) as summaries_with_metadata
      FROM atlas_summary_layers;
    `;

    const res = await client.query(query);
    const row = res.rows[0];
    const coverage = row.packets_with_summaries / 3251;

    results.push({
      name: 'Summary Layers Coverage',
      status: coverage > 0.8 ? 'pass' : 'warn',
      detail: `${row.total_summaries} summaries, ${row.packets_with_summaries} packets covered (${(coverage * 100).toFixed(1)}%), ${row.summaries_with_metadata} with metadata`,
      metrics: {
        total_summaries: row.total_summaries,
        packets_with_summaries: row.packets_with_summaries,
        coverage_percent: (coverage * 100).toFixed(1),
        empty_summaries: row.empty_summaries || 0,
        with_metadata: row.summaries_with_metadata,
      },
    });
  } catch (err) {
    results.push({
      name: 'Summary Layers Coverage',
      status: 'fail',
      detail: `Error: ${String(err)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 5: Topology index (SOM/Karpathy scoring cache)
// ════════════════════════════════════════════════════════════════════════════

async function testTopology(client) {
  try {
    const query = `
      SELECT
        COUNT(*) as total_rows,
        COUNT(DISTINCT packet_key) as unique_packets,
        COUNT(CASE WHEN tree_node_id IS NOT NULL THEN 1 END) as rows_with_tree_node,
        COUNT(CASE WHEN z_som IS NOT NULL THEN 1 END) as rows_with_som,
        COUNT(CASE WHEN w_authority IS NOT NULL THEN 1 END) as rows_with_authority,
        COUNT(CASE WHEN karpathy_score IS NOT NULL THEN 1 END) as rows_with_karpathy
      FROM atlas_topology_index;
    `;

    const res = await client.query(query);
    const row = res.rows[0];

    results.push({
      name: 'Topology Index (Scoring Cache)',
      status: row.rows_with_som > 0 || row.rows_with_authority > 0 ? 'pass' : 'warn',
      detail: `${row.total_rows} rows, SOM=${row.rows_with_som}, authority=${row.rows_with_authority}, karpathy=${row.rows_with_karpathy}`,
      metrics: {
        total_rows: row.total_rows,
        unique_packets: row.unique_packets,
        rows_with_som: row.rows_with_som || 0,
        rows_with_authority: row.rows_with_authority || 0,
        rows_with_karpathy: row.rows_with_karpathy || 0,
      },
    });
  } catch (err) {
    results.push({
      name: 'Topology Index (Scoring Cache)',
      status: 'fail',
      detail: `Error: ${String(err)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 6: Error logs for P1
// ════════════════════════════════════════════════════════════════════════════

async function testErrorLogs(client) {
  try {
    const query = `
      SELECT
        CASE WHEN EXISTS(SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'error_logs')
        THEN 'exists' ELSE 'missing' END as status,
        COALESCE((SELECT COUNT(*) FROM error_logs), 0) as error_count,
        COALESCE((SELECT COUNT(DISTINCT error_category) FROM error_logs), 0) as categories;
    `;

    const res = await client.query(query);
    const row = res.rows[0];
    const status = row.status === 'exists' ? 'pass' : 'fail';

    results.push({
      name: 'Error Logs (P1)',
      status,
      detail: `error_logs table ${row.status}: ${row.error_count} errors across ${row.categories} categories`,
      metrics: {
        table_exists: row.status === 'exists',
        error_count: row.error_count,
        categories: row.categories,
      },
    });
  } catch (err) {
    results.push({
      name: 'Error Logs (P1)',
      status: 'fail',
      detail: `Error: ${String(err)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 7: Extensions
// ════════════════════════════════════════════════════════════════════════════

async function testExtensions(client) {
  try {
    const query = `
      SELECT
        COUNT(*) as installed,
        STRING_AGG(extname, ', ' ORDER BY extname) as extensions
      FROM pg_extension
      WHERE extname IN ('pgcrypto', 'vector', 'pg_trgm', 'btree_gin', 'unaccent');
    `;

    const res = await client.query(query);
    const row = res.rows[0];

    results.push({
      name: 'PostgreSQL Extensions',
      status: row.installed >= 5 ? 'pass' : 'warn',
      detail: `${row.installed}/5 required extensions: ${row.extensions}`,
      metrics: {
        installed: row.installed,
        required: 5,
      },
    });
  } catch (err) {
    results.push({
      name: 'PostgreSQL Extensions',
      status: 'fail',
      detail: `Error: ${String(err)}`,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function runTests() {
  const client = await pool.connect();

  try {
    console.log('[BACKFILL-READINESS] Starting tests...\n');

    await testTableExistence(client);
    await testIdentityChain(client);
    await testTreeHierarchy(client);
    await testSummaryLayers(client);
    await testTopology(client);
    await testErrorLogs(client);
    await testExtensions(client);

    // Print results
    console.log('═'.repeat(80));
    console.log('BACKFILL READINESS TEST RESULTS');
    console.log('═'.repeat(80));
    console.log('');

    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;

    for (const result of results) {
      const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️ ' : '❌';
      console.log(`${icon} ${result.name}`);
      console.log(`   ${result.detail}`);

      if (result.metrics) {
        for (const [key, val] of Object.entries(result.metrics)) {
          console.log(`   • ${key}: ${val}`);
        }
      }
      console.log('');

      if (result.status === 'pass') passCount++;
      else if (result.status === 'warn') warnCount++;
      else failCount++;
    }

    console.log('═'.repeat(80));
    console.log(`SUMMARY: ${passCount} pass, ${warnCount} warn, ${failCount} fail`);
    console.log('═'.repeat(80));

    // Write report
    const reportPath = path.join(REPO_ROOT, 'docs', 'reports', `backfill-readiness-${new Date().toISOString().split('T')[0]}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2));
    console.log(`\nReport written to: ${reportPath}`);

    process.exit(failCount > 0 ? 1 : 0);
  } finally {
    client.release();
    await pool.end();
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
