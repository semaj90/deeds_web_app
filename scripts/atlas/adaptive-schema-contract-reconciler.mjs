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

const reconciliation = {
  timestamp: new Date().toISOString(),
  checks: {
    tables: {},
    columns: {},
    indexes: {},
    extensions: {},
    constraints: {},
    rowCounts: {},
  },
  recommendations: [],
  sql: [],
  summary: {
    tables_missing: 0,
    columns_missing: 0,
    indexes_missing: 0,
    extensions_missing: 0,
    constraints_missing: 0,
    safe_operations: 0,
    total_recommendations: 0,
  },
};

// ════════════════════════════════════════════════════════════════════════════
// CHECK 1: Extensions
// ════════════════════════════════════════════════════════════════════════════

async function checkExtensions(client) {
  try {
    const required = ['pgcrypto', 'vector', 'pg_trgm', 'btree_gin', 'unaccent'];
    const query = `
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname = ANY($1::text[])
      ORDER BY extname;
    `;
    const res = await client.query(query, [required]);
    const installed = new Set(res.rows.map(r => r.extname));

    for (const ext of required) {
      if (!installed.has(ext)) {
        reconciliation.checks.extensions[ext] = { installed: false, version: null };
        reconciliation.sql.push(`CREATE EXTENSION IF NOT EXISTS ${ext};`);
        reconciliation.recommendations.push({
          type: 'extension',
          name: ext,
          status: 'missing',
          action: `CREATE EXTENSION IF NOT EXISTS ${ext};`,
          reason: `Required for ${ext === 'vector' ? 'pgvector embeddings' : ext === 'pg_trgm' ? 'fuzzy matching' : ext === 'btree_gin' ? 'JSONB/hybrid indexing' : ext === 'unaccent' ? 'text normalization' : 'ID generation'}`,
        });
        reconciliation.summary.extensions_missing++;
      } else {
        const row = res.rows.find(r => r.extname === ext);
        reconciliation.checks.extensions[ext] = { installed: true, version: row.extversion };
      }
    }
    console.log(`✓ Extensions check: ${installed.size}/${required.length} installed`);
  } catch (err) {
    console.error('✗ Extensions check error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CHECK 2: Core Tables
// ════════════════════════════════════════════════════════════════════════════

async function checkCoreTables(client) {
  try {
    const coreTableDefs = {
      atlas_packets: [
        { name: 'packet_key', type: 'character varying', nullable: false },
        { name: 'source_ref', type: 'character varying', nullable: false },
        { name: 'file_path', type: 'character varying', nullable: true },
        { name: 'feature_id', type: 'character varying', nullable: true },
        { name: 'feature_label', type: 'character varying', nullable: true },
        { name: 'summary', type: 'text', nullable: true },
      ],
      atlas_tree_nodes: [
        { name: 'node_id', type: 'uuid', nullable: false },
        { name: 'packet_key', type: 'character varying', nullable: true },
        { name: 'parent_id', type: 'uuid', nullable: true },
        { name: 'tree_depth', type: 'integer', nullable: true },
      ],
      atlas_topology_index: [
        { name: 'packet_key', type: 'character varying', nullable: false },
        { name: 'w_authority', type: 'real', nullable: true },
        { name: 'community_id', type: 'integer', nullable: true },
        { name: 'y_graph', type: 'real', nullable: true },
      ],
      error_logs: [
        { name: 'id', type: 'uuid', nullable: false },
        { name: 'error_category', type: 'character varying', nullable: true },
        { name: 'error_text', type: 'text', nullable: true },
        { name: 'error_embedding', type: 'vector', nullable: true },
      ],
    };

    for (const [table, columns] of Object.entries(coreTableDefs)) {
      // Check table existence
      const tableQuery = `
        SELECT EXISTS(
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        ) as exists;
      `;
      const tableRes = await client.query(tableQuery, [table]);
      const tableExists = tableRes.rows[0].exists;

      if (!tableExists) {
        reconciliation.checks.tables[table] = { exists: false, columns: [] };
        reconciliation.summary.tables_missing++;
        reconciliation.recommendations.push({
          type: 'table',
          name: table,
          status: 'missing',
          action: `CREATE TABLE IF NOT EXISTS ${table} (...)`,
          reason: `Core table required by parent atlas`,
        });
      } else {
        reconciliation.checks.tables[table] = { exists: true, columns: [] };

        // Check columns
        for (const col of columns) {
          const colQuery = `
            SELECT EXISTS(
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
            ) as exists;
          `;
          const colRes = await client.query(colQuery, [table, col.name]);
          const colExists = colRes.rows[0].exists;

          if (!colExists) {
            reconciliation.checks.columns[`${table}.${col.name}`] = { exists: false };
            reconciliation.sql.push(
              `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${col.nullable ? '' : ' NOT NULL'};`
            );
            reconciliation.recommendations.push({
              type: 'column',
              table,
              name: col.name,
              data_type: col.type,
              status: 'missing',
              action: `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${col.nullable ? '' : ' NOT NULL'};`,
            });
            reconciliation.summary.columns_missing++;
          } else {
            reconciliation.checks.columns[`${table}.${col.name}`] = { exists: true };
          }
        }

        // Row count
        const countQuery = `SELECT COUNT(*) as cnt FROM ${table};`;
        const countRes = await client.query(countQuery);
        reconciliation.checks.rowCounts[table] = countRes.rows[0].cnt;
      }
    }

    console.log(`✓ Tables check: ${Object.keys(coreTableDefs).filter(t => reconciliation.checks.tables[t]?.exists).length}/${Object.keys(coreTableDefs).length} exist`);
  } catch (err) {
    console.error('✗ Tables check error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CHECK 3: Indexes
// ════════════════════════════════════════════════════════════════════════════

async function checkIndexes(client) {
  try {
    const requiredIndexes = [
      { table: 'atlas_packets', columns: ['packet_key'], name: 'idx_atlas_packets_packet_key', unique: true },
      { table: 'atlas_packets', columns: ['source_ref'], name: 'idx_atlas_packets_source_ref', unique: false },
      { table: 'atlas_tree_nodes', columns: ['packet_key'], name: 'idx_atlas_tree_nodes_packet_key', unique: false },
      { table: 'atlas_topology_index', columns: ['packet_key'], name: 'idx_atlas_topology_packet_key', unique: true },
      { table: 'atlas_topology_index', columns: ['w_authority'], name: 'idx_atlas_topology_authority', unique: false },
      { table: 'error_logs', columns: ['error_category'], name: 'idx_error_logs_category', unique: false },
    ];

    for (const idx of requiredIndexes) {
      const indexQuery = `
        SELECT EXISTS(
          SELECT 1 FROM pg_indexes
          WHERE tablename = $1 AND indexname = $2
        ) as exists;
      `;
      const indexRes = await client.query(indexQuery, [idx.table, idx.name]);
      const indexExists = indexRes.rows[0].exists;

      if (!indexExists) {
        const columnList = idx.columns.join(', ');
        const uniqueStr = idx.unique ? 'UNIQUE' : '';
        reconciliation.sql.push(
          `CREATE ${uniqueStr} INDEX IF NOT EXISTS ${idx.name} ON ${idx.table} (${columnList});`
        );
        reconciliation.recommendations.push({
          type: 'index',
          table: idx.table,
          name: idx.name,
          columns: idx.columns,
          unique: idx.unique,
          status: 'missing',
          action: `CREATE ${uniqueStr} INDEX IF NOT EXISTS ${idx.name} ON ${idx.table} (${columnList});`,
        });
        reconciliation.summary.indexes_missing++;
      }
      reconciliation.checks.indexes[idx.name] = { exists: indexExists };
    }

    console.log(`✓ Indexes check: ${requiredIndexes.filter(i => reconciliation.checks.indexes[i.name]?.exists).length}/${requiredIndexes.length} exist`);
  } catch (err) {
    console.error('✗ Indexes check error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CHECK 4: Constraints
// ════════════════════════════════════════════════════════════════════════════

async function checkConstraints(client) {
  try {
    const requiredConstraints = [
      { table: 'atlas_packets', name: 'pk_atlas_packets', type: 'PRIMARY KEY', definition: 'packet_key' },
      { table: 'atlas_topology_index', name: 'pk_atlas_topology', type: 'PRIMARY KEY', definition: 'packet_key' },
      { table: 'error_logs', name: 'pk_error_logs', type: 'PRIMARY KEY', definition: 'id' },
    ];

    for (const constraint of requiredConstraints) {
      const query = `
        SELECT EXISTS(
          SELECT 1 FROM pg_constraint
          WHERE conrelid = '${constraint.table}'::regclass AND conname = $1
        ) as exists;
      `;
      try {
        const res = await client.query(query, [constraint.name]);
        const exists = res.rows[0].exists;
        reconciliation.checks.constraints[constraint.name] = { exists };

        if (!exists && constraint.type === 'PRIMARY KEY') {
          reconciliation.recommendations.push({
            type: 'constraint',
            table: constraint.table,
            name: constraint.name,
            constraint_type: constraint.type,
            status: 'missing',
            reason: `Primary key missing on ${constraint.table}`,
          });
          reconciliation.summary.constraints_missing++;
        }
      } catch {
        // Table may not exist yet
      }
    }

    console.log(`✓ Constraints check: complete`);
  } catch (err) {
    console.error('✗ Constraints check error:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function runReconciliation() {
  const client = await pool.connect();

  try {
    console.log('[SCHEMA-RECONCILER] Starting adaptive schema contract reconciliation...\n');

    await checkExtensions(client);
    await checkCoreTables(client);
    await checkIndexes(client);
    await checkConstraints(client);

    reconciliation.summary.safe_operations = reconciliation.sql.length;
    reconciliation.summary.total_recommendations = reconciliation.recommendations.length;

    // Print summary
    console.log('\n' + '═'.repeat(80));
    console.log('SCHEMA RECONCILIATION RESULTS');
    console.log('═'.repeat(80));
    console.log('');

    console.log(`Extensions missing: ${reconciliation.summary.extensions_missing}`);
    console.log(`Tables missing: ${reconciliation.summary.tables_missing}`);
    console.log(`Columns missing: ${reconciliation.summary.columns_missing}`);
    console.log(`Indexes missing: ${reconciliation.summary.indexes_missing}`);
    console.log(`Constraints missing: ${reconciliation.summary.constraints_missing}`);
    console.log(`Safe operations to apply: ${reconciliation.summary.safe_operations}`);
    console.log('');

    // Write SQL migration file
    const sqlPath = path.join(REPO_ROOT, 'sveltekit-frontend', 'drizzle', 'manual', '0045_adaptive_schema_repair.generated.sql');
    fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
    const sqlContent = `-- Generated adaptive schema repair migration
-- Date: ${new Date().toISOString()}
-- This file contains additive-only operations: CREATE TABLE/INDEX, ALTER ADD COLUMN
-- No DROP, RENAME, or destructive operations

BEGIN;

${reconciliation.sql.map(s => s.trim()).join('\n\n')}

COMMIT;
`;
    fs.writeFileSync(sqlPath, sqlContent);
    console.log(`SQL migration written to: ${sqlPath}`);

    // Write JSON report
    const jsonPath = path.join(REPO_ROOT, 'docs', 'reports', 'adaptive-schema-reconciliation.json');
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(reconciliation, null, 2));
    console.log(`JSON report written to: ${jsonPath}`);

    // Write markdown report
    const mdPath = path.join(REPO_ROOT, 'docs', 'reports', 'adaptive-schema-reconciliation.md');
    let mdContent = `# Adaptive Schema Reconciliation Report\n\n`;
    mdContent += `**Generated**: ${new Date().toISOString()}\n\n`;
    mdContent += `## Summary\n\n`;
    mdContent += `- **Extensions Missing**: ${reconciliation.summary.extensions_missing}\n`;
    mdContent += `- **Tables Missing**: ${reconciliation.summary.tables_missing}\n`;
    mdContent += `- **Columns Missing**: ${reconciliation.summary.columns_missing}\n`;
    mdContent += `- **Indexes Missing**: ${reconciliation.summary.indexes_missing}\n`;
    mdContent += `- **Constraints Missing**: ${reconciliation.summary.constraints_missing}\n`;
    mdContent += `- **Safe Operations**: ${reconciliation.summary.safe_operations}\n\n`;

    mdContent += `## Recommendations\n\n`;
    for (const rec of reconciliation.recommendations) {
      mdContent += `### ${rec.type.toUpperCase()}: ${rec.name || rec.table}\n`;
      mdContent += `- **Status**: ${rec.status}\n`;
      mdContent += `- **Reason**: ${rec.reason || 'Missing resource'}\n`;
      if (rec.action) mdContent += `- **Action**: \`${rec.action}\`\n`;
      mdContent += '\n';
    }

    mdContent += `## Checks Performed\n\n`;
    mdContent += `### Extensions\n`;
    for (const [ext, status] of Object.entries(reconciliation.checks.extensions)) {
      mdContent += `- ${ext}: ${status.installed ? '✅ installed' : '❌ missing'}\n`;
    }
    mdContent += '\n';

    mdContent += `### Row Counts\n`;
    for (const [table, count] of Object.entries(reconciliation.checks.rowCounts)) {
      mdContent += `- ${table}: ${count} rows\n`;
    }

    fs.writeFileSync(mdPath, mdContent);
    console.log(`Markdown report written to: ${mdPath}\n`);

    console.log('═'.repeat(80));
    process.exit(reconciliation.summary.constraints_missing > 0 ? 1 : 0);
  } finally {
    client.release();
    await pool.end();
  }
}

runReconciliation().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
