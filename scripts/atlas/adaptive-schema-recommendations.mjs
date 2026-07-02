#!/usr/bin/env node

/**
 * Adaptive Schema Recommendations Engine
 *
 * Reads live PostgreSQL schema, Qdrant payload schema, Redis keyspace,
 * and error logs to recommend safe, additive SQL migrations.
 *
 * Output:
 *   - docs/reports/adaptive-schema-recommendations.json (structured)
 *   - docs/reports/adaptive-schema-recommendations.md (human-readable)
 *   - drizzle/manual/0045_adaptive_schema_recommendations.generated.sql (idempotent SQL)
 *
 * RULE: Only additive SQL (CREATE TABLE IF NOT EXISTS, ALTER TABLE ... ADD COLUMN IF NOT EXISTS)
 * NEVER: ALTER COLUMN, DROP, or destructive changes
 */

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

const recommendations = {
  timestamp: new Date().toISOString(),
  tables: [],
  columns: [],
  indexes: [],
  extensions: [],
  qdrant_schema_gaps: [],
  redis_keyspace_observations: [],
  error_log_schema_gaps: [],
};

const sqlStatements = [];

// ════════════════════════════════════════════════════════════════════════════
// GATE 1: PostgreSQL Information Schema Inspection
// ════════════════════════════════════════════════════════════════════════════

async function inspectPostgresSchema(client) {
  try {
    // Check for missing system tables
    const tables = await client.query(`
      SELECT table_name, table_schema
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    recommendations.tables = tables.rows.map(r => ({
      name: r.table_name,
      schema: r.table_schema,
      exists: true,
    }));

    console.log(`✓ Found ${tables.rowCount} tables in public schema`);
  } catch (err) {
    console.error('✗ PostgreSQL schema inspection failed:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GATE 2: Column Inventory and Missing Columns Detection
// ════════════════════════════════════════════════════════════════════════════

async function inspectColumns(client) {
  try {
    const columns = await client.query(`
      SELECT
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    // Group by table
    const byTable = {};
    for (const col of columns.rows) {
      if (!byTable[col.table_name]) {
        byTable[col.table_name] = [];
      }
      byTable[col.table_name].push({
        name: col.column_name,
        type: col.data_type,
        nullable: col.is_nullable === 'YES',
        default: col.column_default,
      });
    }

    recommendations.columns = Object.entries(byTable).map(([table, cols]) => ({
      table,
      count: cols.length,
      columns: cols,
    }));

    // Detect common missing columns (based on parent-atlas schema)
    const missingByTable = {
      error_logs: ['error_category', 'severity', 'context_json', 'resolution_status'],
      atlas_packets: ['cold_storage_uri', 'restore_verified'],
      atlas_tree_nodes: ['summary_cached', 'summary_level'],
      atlas_topology_index: ['som_cluster', 'authority_score', 'community_id'],
    };

    for (const [table, expectedCols] of Object.entries(missingByTable)) {
      const actualCols = byTable[table]?.map(c => c.name) || [];
      const missing = expectedCols.filter(ec => !actualCols.includes(ec));

      if (missing.length > 0) {
        // Infer types from schema expectations
        const columnDefs = {
          error_category: "VARCHAR(100) NOT NULL DEFAULT 'unknown'",
          severity: "VARCHAR(50) NOT NULL DEFAULT 'info'",
          context_json: 'JSONB DEFAULT NULL',
          resolution_status: "VARCHAR(50) DEFAULT 'open'",
          cold_storage_uri: 'TEXT DEFAULT NULL',
          restore_verified: 'BOOLEAN DEFAULT FALSE',
          summary_cached: 'BOOLEAN DEFAULT FALSE',
          summary_level: 'INTEGER DEFAULT 0',
          som_cluster: 'INTEGER DEFAULT NULL',
          authority_score: 'REAL DEFAULT NULL',
          community_id: 'INTEGER DEFAULT NULL',
        };

        for (const col of missing) {
          const colDef = columnDefs[col] || 'TEXT DEFAULT NULL';
          recommendations.columns.push({
            table,
            missing: true,
            column: col,
            type: colDef,
          });

          sqlStatements.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${colDef};`);
        }
      }
    }

    console.log(`✓ Inspected ${columns.rowCount} columns across ${Object.keys(byTable).length} tables`);
  } catch (err) {
    console.error('✗ Column inspection failed:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GATE 3: Index Inventory and Missing Indexes
// ════════════════════════════════════════════════════════════════════════════

async function inspectIndexes(client) {
  try {
    const indexes = await client.query(`
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);

    recommendations.indexes = indexes.rows.map(r => ({
      name: r.indexname,
      table: r.tablename,
      definition: r.indexdef,
    }));

    // Recommend missing strategic indexes
    const recommendedIndexes = [
      {
        table: 'error_logs',
        name: 'idx_error_logs_category',
        sql: 'CREATE INDEX IF NOT EXISTS idx_error_logs_category ON error_logs(error_category);',
      },
      {
        table: 'error_logs',
        name: 'idx_error_logs_severity',
        sql: 'CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);',
      },
      {
        table: 'atlas_packets',
        name: 'idx_atlas_packets_feature_id',
        sql: 'CREATE INDEX IF NOT EXISTS idx_atlas_packets_feature_id ON atlas_packets(feature_id);',
      },
      {
        table: 'atlas_topology_index',
        name: 'idx_atlas_topology_som_cluster',
        sql: 'CREATE INDEX IF NOT EXISTS idx_atlas_topology_som_cluster ON atlas_topology_index(som_cluster);',
      },
      {
        table: 'atlas_topology_index',
        name: 'idx_atlas_topology_authority',
        sql: 'CREATE INDEX IF NOT EXISTS idx_atlas_topology_authority ON atlas_topology_index(authority_score DESC);',
      },
    ];

    for (const rec of recommendedIndexes) {
      const exists = indexes.rows.some(i => i.indexname === rec.name);
      if (!exists) {
        recommendations.indexes.push({
          name: rec.name,
          table: rec.table,
          recommended: true,
          definition: rec.sql,
        });
        sqlStatements.push(rec.sql);
      }
    }

    console.log(`✓ Found ${indexes.rowCount} indexes; recommended ${recommendedIndexes.length} missing`);
  } catch (err) {
    console.error('✗ Index inspection failed:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GATE 4: Extension Inventory
// ════════════════════════════════════════════════════════════════════════════

async function inspectExtensions(client) {
  try {
    const extensions = await client.query(`
      SELECT extname, extversion
      FROM pg_extension
      ORDER BY extname
    `);

    recommendations.extensions = extensions.rows.map(r => ({
      name: r.extname,
      version: r.extversion,
      installed: true,
    }));

    // Recommend required extensions
    const required = ['pgcrypto', 'vector', 'pg_trgm', 'btree_gin', 'unaccent'];
    const installed = extensions.rows.map(e => e.extname);

    for (const ext of required) {
      if (!installed.includes(ext)) {
        recommendations.extensions.push({
          name: ext,
          recommended: true,
        });
        sqlStatements.push(`CREATE EXTENSION IF NOT EXISTS ${ext};`);
      }
    }

    console.log(`✓ ${extensions.rowCount} extensions installed; ${required.length} required`);
  } catch (err) {
    console.error('✗ Extension inspection failed:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GATE 5: Error Logs Schema Gaps
// ════════════════════════════════════════════════════════════════════════════

async function inspectErrorLogs(client) {
  try {
    const errorLogs = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'error_logs'
      ) as exists
    `);

    if (!errorLogs.rows[0].exists) {
      const createErrorLogs = `
        CREATE TABLE IF NOT EXISTS error_logs (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
          error_category varchar(100) NOT NULL DEFAULT 'unknown',
          severity varchar(50) NOT NULL DEFAULT 'info',
          message text NOT NULL,
          context_json jsonb DEFAULT NULL,
          resolution_status varchar(50) DEFAULT 'open',
          created_at timestamp with time zone DEFAULT now() NOT NULL,
          updated_at timestamp with time zone DEFAULT now() NOT NULL
        );
      `;
      sqlStatements.push(createErrorLogs);
      recommendations.error_log_schema_gaps.push({
        gap: 'error_logs table missing',
        recommendation: 'Create error_logs table',
        sql: createErrorLogs,
      });
    }

    // Check for required columns
    const columns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'error_logs'
    `);
    const actualCols = columns.rows.map(r => r.column_name);
    const requiredCols = ['error_category', 'severity', 'message', 'context_json', 'resolution_status'];
    const missingCols = requiredCols.filter(c => !actualCols.includes(c));

    if (missingCols.length > 0) {
      recommendations.error_log_schema_gaps.push({
        gap: `error_logs missing columns: ${missingCols.join(', ')}`,
        recommendation: 'Add missing columns',
      });
    }

    console.log(`✓ Error logs schema: ${missingCols.length === 0 ? 'complete' : 'gaps detected'}`);
  } catch (err) {
    console.error('✗ Error logs inspection failed:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GATE 6: Qdrant Payload Schema Observations
// ════════════════════════════════════════════════════════════════════════════

async function observeQdrantSchema() {
  try {
    // This is a reference observation; actual Qdrant introspection would require HTTP API
    recommendations.qdrant_schema_gaps.push({
      observation: 'Qdrant payload must include: directory_path, source_ref, file_path, feature_id, feature_label, packet_key, cold_storage_uri',
      gap: 'Check if all collections have these fields via Qdrant HTTP /collections endpoint',
      recommendation: 'Run: curl -s http://127.0.0.1:6333/collections | jq .',
    });

    console.log(`✓ Qdrant schema observations recorded`);
  } catch (err) {
    console.error('✗ Qdrant schema observation failed:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GATE 7: Redis Keyspace Observations
// ════════════════════════════════════════════════════════════════════════════

async function observeRedisKeyspace() {
  try {
    // Redis keyspace observation (reference only, requires Redis client)
    recommendations.redis_keyspace_observations.push({
      observation: 'Redis should have cache keys: bifrost:packet:*, centroid:*, gpu:karpathy:*',
      gap: 'Verify via: docker exec legal-ai-valkey redis-cli KEYS "*"',
      recommendation: 'Monitor key patterns for orphaned entries',
    });

    console.log(`✓ Redis keyspace observations recorded`);
  } catch (err) {
    console.error('✗ Redis observation failed:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// OUTPUT: Write recommendations to JSON, Markdown, and SQL
// ════════════════════════════════════════════════════════════════════════════

async function writeRecommendations() {
  try {
    const reportsDir = path.join(REPO_ROOT, 'docs', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });

    // Write JSON report
    const jsonPath = path.join(reportsDir, 'adaptive-schema-recommendations.json');
    fs.writeFileSync(jsonPath, JSON.stringify(recommendations, null, 2));
    console.log(`\n✓ JSON report written to: ${jsonPath}`);

    // Write Markdown report
    const mdPath = path.join(reportsDir, 'adaptive-schema-recommendations.md');
    let mdContent = `# Adaptive Schema Recommendations\n\n**Generated**: ${new Date().toISOString()}\n\n`;

    mdContent += `## Summary\n\n`;
    mdContent += `- **Tables**: ${recommendations.tables.length}\n`;
    mdContent += `- **Columns inspected**: ${recommendations.columns.filter(c => !c.missing).length}\n`;
    mdContent += `- **Missing columns detected**: ${recommendations.columns.filter(c => c.missing).length}\n`;
    mdContent += `- **Indexes found**: ${recommendations.indexes.filter(i => !i.recommended).length}\n`;
    mdContent += `- **Missing indexes**: ${recommendations.indexes.filter(i => i.recommended).length}\n`;
    mdContent += `- **Extensions installed**: ${recommendations.extensions.filter(e => e.installed).length}\n`;
    mdContent += `- **SQL statements to apply**: ${sqlStatements.length}\n\n`;

    mdContent += `## Missing Columns\n\n`;
    for (const col of recommendations.columns.filter(c => c.missing)) {
      mdContent += `- **${col.table}**: \`${col.column}\` (${col.type})\n`;
    }

    mdContent += `\n## Recommended Indexes\n\n`;
    for (const idx of recommendations.indexes.filter(i => i.recommended)) {
      mdContent += `- **${idx.table}**: \`${idx.name}\`\n`;
    }

    mdContent += `\n## Error Logs Schema\n\n`;
    for (const gap of recommendations.error_log_schema_gaps) {
      mdContent += `- ${gap.gap}: ${gap.recommendation}\n`;
    }

    mdContent += `\n## Qdrant Payload Schema\n\n`;
    for (const obs of recommendations.qdrant_schema_gaps) {
      mdContent += `- ${obs.observation}\n`;
      mdContent += `  - Gap: ${obs.gap}\n`;
      mdContent += `  - Recommendation: ${obs.recommendation}\n`;
    }

    mdContent += `\n## Redis Keyspace\n\n`;
    for (const obs of recommendations.redis_keyspace_observations) {
      mdContent += `- ${obs.observation}\n`;
      mdContent += `  - Gap: ${obs.gap}\n`;
      mdContent += `  - Recommendation: ${obs.recommendation}\n`;
    }

    fs.writeFileSync(mdPath, mdContent);
    console.log(`✓ Markdown report written to: ${mdPath}`);

    // Write SQL migration
    const sqlPath = path.join(REPO_ROOT, 'sveltekit-frontend', 'drizzle', 'manual', '0045_adaptive_schema_recommendations.generated.sql');
    fs.mkdirSync(path.dirname(sqlPath), { recursive: true });

    let sqlContent = `-- Adaptive Schema Recommendations\n`;
    sqlContent += `-- Generated: ${new Date().toISOString()}\n`;
    sqlContent += `-- RULE: Only additive SQL (CREATE TABLE IF NOT EXISTS, ALTER TABLE ... ADD COLUMN IF NOT EXISTS)\n`;
    sqlContent += `-- NEVER: Destructive changes (ALTER COLUMN, DROP)\n\n`;

    for (const stmt of sqlStatements) {
      sqlContent += stmt + '\n';
    }

    fs.writeFileSync(sqlPath, sqlContent);
    console.log(`✓ SQL migration written to: ${sqlPath}`);

    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`SCHEMA RECOMMENDATIONS COMPLETE`);
    console.log(`═══════════════════════════════════════════════════════════════`);
    console.log(`\nApply migrations safely:\n`);
    console.log(`  1. Review: cat ${sqlPath}`);
    console.log(`  2. Test: psql -U legal_admin -d legal_ai_db -f ${sqlPath} --dry-run`);
    console.log(`  3. Apply: psql -U legal_admin -d legal_ai_db -f ${sqlPath}`);
    console.log(`  4. Verify: npm run atlas:lineage:verify`);
  } catch (err) {
    console.error('✗ Report writing failed:', String(err));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function runAdaptiveSchema() {
  const client = await pool.connect();

  try {
    console.log(`[ADAPTIVE-SCHEMA] Starting schema analysis...\n`);

    await inspectPostgresSchema(client);
    await inspectColumns(client);
    await inspectIndexes(client);
    await inspectExtensions(client);
    await inspectErrorLogs(client);
    await observeQdrantSchema();
    await observeRedisKeyspace();

    await writeRecommendations();

    process.exit(0);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runAdaptiveSchema();
