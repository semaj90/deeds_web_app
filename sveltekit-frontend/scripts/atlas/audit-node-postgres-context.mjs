#!/usr/bin/env node
/**
 * audit-node-postgres-context.mjs
 *
 * Diagnose why Node.js runtime can't see atlas_tree_nodes
 * even though psql confirms it exists in legal_ai_db.
 *
 * Checks database target, search_path, schema visibility,
 * and table existence from the Node perspective.
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_password@127.0.0.1:5432/legal_ai_db';

// Parse and redact connection string
const url = new URL(DATABASE_URL);
const redacted = `postgresql://${url.username}:***@${url.hostname}:${url.port}${url.pathname}`;

async function auditContext() {
  console.log('\n═══ NODE POSTGRES CONTEXT AUDIT ═══\n');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const results = {
    timestamp: new Date().toISOString(),
    connection: {
      url: redacted,
      hostname: url.hostname,
      port: url.port,
      database: url.pathname.slice(1),
      username: url.username
    },
    queries: {}
  };

  try {
    // Query 1: current_database
    const dbRes = await pool.query('SELECT current_database() as db;');
    results.queries.current_database = dbRes.rows[0]?.db;
    console.log(`✓ current_database: ${results.queries.current_database}`);

    // Query 2: current_schema
    const schemaRes = await pool.query('SELECT current_schema() as schema;');
    results.queries.current_schema = schemaRes.rows[0]?.schema;
    console.log(`✓ current_schema: ${results.queries.current_schema}`);

    // Query 3: search_path
    const searchRes = await pool.query('SHOW search_path;');
    results.queries.search_path = searchRes.rows[0]?.search_path;
    console.log(`✓ search_path: ${results.queries.search_path}`);

    // Query 4: to_regclass('public.atlas_tree_nodes')
    const toRegRes1 = await pool.query(`SELECT to_regclass('public.atlas_tree_nodes') as regclass;`);
    results.queries.to_regclass_public_tree_nodes = toRegRes1.rows[0]?.regclass;
    console.log(`✓ to_regclass('public.atlas_tree_nodes'): ${results.queries.to_regclass_public_tree_nodes || 'NULL (not found)'}`);

    // Query 5: to_regclass('atlas_tree_nodes')
    const toRegRes2 = await pool.query(`SELECT to_regclass('atlas_tree_nodes') as regclass;`);
    results.queries.to_regclass_tree_nodes = toRegRes2.rows[0]?.regclass;
    console.log(`✓ to_regclass('atlas_tree_nodes'): ${results.queries.to_regclass_tree_nodes || 'NULL (not found)'}`);

    // Query 6: Try counting atlas_tree_nodes
    try {
      const treeRes = await pool.query('SELECT COUNT(*) as cnt FROM public.atlas_tree_nodes;');
      results.queries.atlas_tree_nodes_count = parseInt(treeRes.rows[0]?.cnt || '0');
      console.log(`✓ SELECT COUNT(*) FROM public.atlas_tree_nodes: ${results.queries.atlas_tree_nodes_count}`);
    } catch (e) {
      results.queries.atlas_tree_nodes_count_error = e.message;
      console.log(`✗ SELECT COUNT(*) FROM public.atlas_tree_nodes: ${e.code} - ${e.message}`);
    }

    // Query 7: atlas_packets count
    const pktsRes = await pool.query('SELECT COUNT(*) as cnt FROM public.atlas_packets;');
    results.queries.atlas_packets_count = parseInt(pktsRes.rows[0]?.cnt || '0');
    console.log(`✓ SELECT COUNT(*) FROM public.atlas_packets: ${results.queries.atlas_packets_count}`);

    // Query 8: nes_chrom_packets count
    const chromRes = await pool.query('SELECT COUNT(*) as cnt FROM public.nes_chrom_packets;');
    results.queries.nes_chrom_packets_count = parseInt(chromRes.rows[0]?.cnt || '0');
    console.log(`✓ SELECT COUNT(*) FROM public.nes_chrom_packets: ${results.queries.nes_chrom_packets_count}`);

    // Query 9: List all atlas* tables visible to Node
    const tablesRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'atlas%'
      ORDER BY table_name;
    `);
    results.queries.atlas_tables = tablesRes.rows.map(r => r.table_name);
    console.log(`✓ Atlas tables visible: ${results.queries.atlas_tables.length}`);
    console.log(`  ${results.queries.atlas_tables.join(', ').substring(0, 120)}...`);

    // Query 10: Column existence in atlas_tree_nodes (if visible)
    if (results.queries.to_regclass_public_tree_nodes) {
      try {
        const colsRes = await pool.query(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'atlas_tree_nodes'
          ORDER BY ordinal_position
          LIMIT 5;
        `);
        results.queries.atlas_tree_nodes_columns = colsRes.rows.map(r => `${r.column_name} (${r.data_type})`);
        console.log(`✓ atlas_tree_nodes first 5 columns: ${results.queries.atlas_tree_nodes_columns.join(', ')}`);
      } catch (e) {
        results.queries.atlas_tree_nodes_columns_error = e.message;
      }
    }

    console.log('\n═══ DIAGNOSIS ═══\n');

    const summary = {
      database_match: results.queries.current_database === url.pathname.slice(1),
      schema_default_public: results.queries.current_schema === 'public',
      tree_nodes_visible: !!results.queries.to_regclass_public_tree_nodes,
      tree_nodes_accessible: !results.queries.atlas_tree_nodes_count_error,
      tree_nodes_populated: results.queries.atlas_tree_nodes_count > 0,
      packets_visible: results.queries.atlas_packets_count > 0,
      chrom_visible: results.queries.nes_chrom_packets_count > 0
    };

    console.log(`Database target matches: ${summary.database_match ? '✓' : '✗'} (${results.queries.current_database})`);
    console.log(`Schema is 'public': ${summary.schema_default_public ? '✓' : '✗'}`);
    console.log(`atlas_tree_nodes to_regclass: ${summary.tree_nodes_visible ? '✓' : '✗'}`);
    console.log(`atlas_tree_nodes SELECT COUNT: ${summary.tree_nodes_accessible ? '✓' : '✗'}`);
    console.log(`atlas_tree_nodes has rows: ${summary.tree_nodes_populated ? '✓' : '✗'} (${results.queries.atlas_tree_nodes_count})`);
    console.log(`atlas_packets visible: ${summary.packets_visible ? '✓' : '✗'} (${results.queries.atlas_packets_count})`);
    console.log(`nes_chrom_packets visible: ${summary.chrom_visible ? '✓' : '✗'} (${results.queries.nes_chrom_packets_count})`);

    if (!summary.database_match) {
      console.log('\n⚠️  DATABASE MISMATCH: Node is NOT connected to legal_ai_db. Check DATABASE_URL env var.');
    }

    if (!summary.tree_nodes_visible && summary.packets_visible) {
      console.log('\n⚠️  SCHEMA GAP: Postgres has atlas_tree_nodes but Node can\'t see it.');
      console.log('   Likely cause: to_regclass() returns NULL, table may be in wrong schema.');
      console.log('   Next steps:');
      console.log('   1. Verify table exists with: psql -c "\\dt atlas_tree_nodes"');
      console.log('   2. Check schema with: psql -c "SELECT schemaname, tablename FROM pg_tables WHERE tablename=\'atlas_tree_nodes\';"');
      console.log('   3. Ensure Drizzle schema includes atlas_tree_nodes export');
    }

    // Write report files
    const reportDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../docs/reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    fs.writeFileSync(
      path.join(reportDir, 'node-postgres-context-audit.json'),
      JSON.stringify({ ...results, summary }, null, 2)
    );

    fs.writeFileSync(
      path.join(reportDir, 'node-postgres-context-audit.md'),
      `# Node Postgres Context Audit

Generated: ${results.timestamp}

## Connection

\`\`\`
${redacted}
\`\`\`

## Current State

- **current_database**: ${results.queries.current_database}
- **current_schema**: ${results.queries.current_schema}
- **search_path**: ${results.queries.search_path}

## Table Visibility

| Table | to_regclass | Accessible | Count |
|-------|-------------|-----------|-------|
| atlas_tree_nodes | ${summary.tree_nodes_visible ? '✓' : '✗'} | ${summary.tree_nodes_accessible ? '✓' : '✗'} | ${results.queries.atlas_tree_nodes_count || 'ERROR'} |
| atlas_packets | ✓ | ✓ | ${results.queries.atlas_packets_count} |
| nes_chrom_packets | ✓ | ✓ | ${results.queries.nes_chrom_packets_count} |

## Diagnosis

${Object.entries(summary).map(([k, v]) => `- **${k}**: ${v ? '✓ PASS' : '✗ FAIL'}`).join('\n')}

## Recommendation

${!summary.tree_nodes_visible ? '**Add atlas_tree_nodes to Drizzle schema** and ensure it exports from schema-postgres.ts.' : 'atlas_tree_nodes is visible to Node runtime.'}
`
    );

    console.log(`\n✓ Reports written to docs/reports/node-postgres-context-audit.*`);

    process.exit(summary.tree_nodes_visible ? 0 : 1);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

auditContext();
