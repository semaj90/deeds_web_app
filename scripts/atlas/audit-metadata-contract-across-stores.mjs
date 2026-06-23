#!/usr/bin/env node
/**
 * Audit Metadata Contract Across All Stores
 *
 * Purpose: Before any backfill, indexing, or execution, answer these questions:
 * - Does this field exist?
 * - Where does it exist (Postgres column, JSONB key, Qdrant payload, Neo4j property, Redis key)?
 * - Is it indexed?
 * - Is it populated?
 * - Can we join it back to source_ref / packet_key?
 *
 * Do NOT invent fields. Do NOT backfill. Do NOT create indexes. Just audit.
 *
 * Output: docs/reports/metadata-contract-cross-store-audit.json + .md
 *
 * Usage:
 *   node scripts/atlas/audit-metadata-contract-across-stores.mjs
 *   node scripts/atlas/audit-metadata-contract-across-stores.mjs --detailed
 */

import pg from 'pg';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DETAILED = process.argv.includes('--detailed');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

// Target fields to audit
const TARGET_FIELDS = [
  'packet_key', 'source_ref', 'sourceRef',
  'feature_id', 'feature_ids',
  'qdrant_point_id',
  'community_id',
  'som_cluster', 'som_code', 'som_x', 'som_y',
  'ontology_label', 'topology_label',
  'retrieval_strategy', 'retrieval_path',
  'trace_id',
  'ae_epoch', 'ae_val_loss', 'ae_confidence',
  'latent_64', 'latent_64_embedding',
  'embedding', 'embedding_384', 'embedding_768'
];

const report = {
  audit_date: new Date().toISOString(),
  fields: {},
  stores: {
    postgres: { status: 'pending', tables: {} },
    qdrant: { status: 'pending', collections: {} },
    neo4j: { status: 'pending', nodes: {} },
    redis: { status: 'pending', keys: {} }
  },
  verdicts: {},
  blockers: [],
  recommendations: []
};

// ============================================================================
// POSTGRES AUDIT
// ============================================================================

async function auditPostgres() {
  console.log('\n📊 Auditing Postgres...');

  try {
    // Get all tables and columns
    const tablesResult = await pool.query(`
      SELECT table_name, column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema='public'
      AND table_name IN (
        'atlas_packets',
        'nes_chrom_packets',
        'task_semantic_packets',
        'atlas_higher_hop_index',
        'atlas_feature_map',
        'parent_atlas_documents',
        'retrieval_provenance'
      )
      ORDER BY table_name, ordinal_position
    `);

    const tables = [
      'atlas_packets', 'nes_chrom_packets', 'task_semantic_packets',
      'atlas_higher_hop_index', 'atlas_feature_map', 'parent_atlas_documents',
      'retrieval_provenance'
    ];

    for (const table of tables) {
      const countResult = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      const rowCount = countResult.rows[0].count;

      report.stores.postgres.tables[table] = {
        row_count: rowCount,
        columns: {},
        jsonb_keys: {},
        indexes: {}
      };
    }

    // Map columns to tables
    for (const col of tablesResult.rows) {
      const table = col.table_name;
      if (report.stores.postgres.tables[table]) {
        report.stores.postgres.tables[table].columns[col.column_name] = {
          data_type: col.data_type,
          udt_name: col.udt_name
        };

        // If it's a target field, record it
        if (TARGET_FIELDS.includes(col.column_name)) {
          if (!report.fields[col.column_name]) {
            report.fields[col.column_name] = {
              exists_in: {},
              indexed: {},
              coverage: {}
            };
          }
          report.fields[col.column_name].exists_in.postgres = {
            table,
            column: col.column_name,
            type: col.data_type
          };
        }
      }
    }

    // JSONB coverage for atlas_packets
    const jsonbResult = await pool.query(`
      SELECT jsonb_object_keys(metadata) AS key, COUNT(*) AS count
      FROM atlas_packets
      WHERE metadata IS NOT NULL
      GROUP BY jsonb_object_keys(metadata)
      ORDER BY count DESC
    `);

    for (const row of jsonbResult.rows) {
      const key = row.key;
      if (TARGET_FIELDS.includes(key)) {
        if (!report.fields[key]) {
          report.fields[key] = { exists_in: {}, indexed: {}, coverage: {} };
        }
        report.fields[key].exists_in.postgres = {
          table: 'atlas_packets',
          column: 'metadata',
          jsonb_key: key
        };
        report.fields[key].coverage.postgres = {
          populated: row.count,
          total: report.stores.postgres.tables['atlas_packets'].row_count,
          percent: (row.count / report.stores.postgres.tables['atlas_packets'].row_count * 100).toFixed(2)
        };
      }
    }

    // Get all indexes on target tables
    const indexResult = await pool.query(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname='public'
      AND tablename IN (
        'atlas_packets', 'nes_chrom_packets', 'task_semantic_packets',
        'atlas_higher_hop_index', 'atlas_feature_map',
        'parent_atlas_documents', 'retrieval_provenance'
      )
      ORDER BY tablename, indexname
    `);

    for (const idx of indexResult.rows) {
      const table = idx.tablename;
      if (report.stores.postgres.tables[table]) {
        report.stores.postgres.tables[table].indexes[idx.indexname] = {
          definition: idx.indexdef
        };

        // Check if index is on target field
        for (const field of TARGET_FIELDS) {
          if (idx.indexdef.includes(field)) {
            if (!report.fields[field]) {
              report.fields[field] = { exists_in: {}, indexed: {}, coverage: {} };
            }
            if (!report.fields[field].indexed) {
              report.fields[field].indexed = {};
            }
            if (!report.fields[field].indexed.postgres) {
              report.fields[field].indexed.postgres = [];
            }
            report.fields[field].indexed.postgres.push({
              table,
              index: idx.indexname
            });
          }
        }
      }
    }

    report.stores.postgres.status = 'complete';
    console.log('✅ Postgres audit complete');
  } catch (e) {
    report.stores.postgres.status = `error: ${e.message}`;
    console.error('❌ Postgres audit failed:', e.message);
  }
}

// ============================================================================
// QDRANT AUDIT
// ============================================================================

async function auditQdrant() {
  console.log('\n📊 Auditing Qdrant...');

  try {
    // Get collections
    const collectionsRes = await httpGet('http://127.0.0.1:6333/collections');
    const collections = collectionsRes.result?.collections || [];

    for (const coll of collections) {
      const name = coll.name;
      report.stores.qdrant.collections[name] = {
        points: coll.points_count,
        payload_schema: {}
      };

      // Get collection details
      const collRes = await httpGet(`http://127.0.0.1:6333/collections/${name}`);
      const payloadSchema = collRes.result?.payload_schema || {};

      // Record payload fields
      for (const field of Object.keys(payloadSchema)) {
        if (TARGET_FIELDS.includes(field)) {
          if (!report.fields[field]) {
            report.fields[field] = { exists_in: {}, indexed: {}, coverage: {} };
          }
          report.fields[field].exists_in.qdrant = {
            collection: name,
            field,
            type: payloadSchema[field]?.data_type || 'unknown'
          };
          report.stores.qdrant.collections[name].payload_schema[field] = payloadSchema[field];
        }
      }

      // Sample points to check payload coverage
      if (name === 'codebase_chunks_768') {
        const scrollRes = await httpPost(`http://127.0.0.1:6333/collections/${name}/points/scroll`, {
          limit: 100,
          with_payload: true,
          with_vector: false
        });

        const points = scrollRes.result?.points || [];
        const payloadKeys = new Set();

        for (const point of points) {
          if (point.payload) {
            Object.keys(point.payload).forEach(k => payloadKeys.add(k));
          }
        }

        // Check which target fields are in payload
        for (const field of TARGET_FIELDS) {
          if (payloadKeys.has(field)) {
            if (!report.fields[field]) {
              report.fields[field] = { exists_in: {}, indexed: {}, coverage: {} };
            }
            report.fields[field].exists_in.qdrant = {
              collection: name,
              field,
              type: 'payload_key',
              in_sample: true
            };
          }
        }

        // Check for naming variants
        if (payloadKeys.has('source_ref') && payloadKeys.has('sourceRef')) {
          report.blockers.push({
            blocker: 'Qdrant naming conflict: source_ref vs sourceRef',
            tables_affected: ['codebase_chunks_768'],
            severity: 'WARN'
          });
        }

        if (payloadKeys.has('feature_id') && payloadKeys.has('feature_ids')) {
          report.blockers.push({
            blocker: 'Qdrant naming conflict: feature_id vs feature_ids',
            tables_affected: ['codebase_chunks_768'],
            severity: 'WARN'
          });
        }

        // Check for missing critical fields
        if (!payloadKeys.has('packet_key')) {
          report.blockers.push({
            blocker: 'Qdrant missing packet_key in payload',
            tables_affected: ['codebase_chunks_768'],
            severity: 'CRITICAL',
            impact: 'Cannot join Qdrant hits back to Postgres'
          });
        }

        if (!payloadKeys.has('qdrant_point_id')) {
          report.blockers.push({
            blocker: 'Qdrant missing qdrant_point_id in payload',
            tables_affected: ['codebase_chunks_768'],
            severity: 'CRITICAL',
            impact: 'Cannot audit point identity'
          });
        }
      }
    }

    report.stores.qdrant.status = 'complete';
    console.log('✅ Qdrant audit complete');
  } catch (e) {
    report.stores.qdrant.status = `error: ${e.message}`;
    console.error('❌ Qdrant audit failed:', e.message);
  }
}

// ============================================================================
// NEO4J AUDIT
// ============================================================================

async function auditNeo4j() {
  console.log('\n📊 Auditing Neo4j...');

  try {
    const neo4jUrl = 'http://localhost:7474/db/neo4j/query/v2';
    const neo4jAuth = Buffer.from('neo4j:neo4j123').toString('base64');

    // Query node types and properties
    const nodeRes = await fetch(neo4jUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${neo4jAuth}`
      },
      body: JSON.stringify({
        statement: 'MATCH (n) RETURN DISTINCT labels(n) AS labels, keys(n) AS keys, COUNT(*) AS count LIMIT 50'
      })
    });

    if (!nodeRes.ok) {
      throw new Error(`Neo4j HTTP error: ${nodeRes.status}`);
    }

    const neo4jData = await nodeRes.json();
    const records = neo4jData.data?.values || [];

    for (const record of records) {
      const labels = record[0] || [];
      const keys = record[1] || [];
      const count = record[2] || 0;
      const label = labels.join(':') || 'Unknown';

      report.stores.neo4j.nodes[label] = {
        count,
        properties: keys
      };

      // Check for target fields
      for (const field of TARGET_FIELDS) {
        if (keys.includes(field)) {
          if (!report.fields[field]) {
            report.fields[field] = { exists_in: {}, indexed: {}, coverage: {} };
          }
          if (!report.fields[field].exists_in.neo4j) {
            report.fields[field].exists_in.neo4j = [];
          }
          report.fields[field].exists_in.neo4j.push({
            node_type: label,
            property: field
          });
        }
      }
    }

    report.stores.neo4j.status = 'complete';
    console.log('✅ Neo4j audit complete');
  } catch (e) {
    report.stores.neo4j.status = `error: ${e.message}`;
    console.error('❌ Neo4j audit failed:', e.message);
  }
}

// ============================================================================
// REDIS AUDIT
// ============================================================================

async function auditRedis() {
  console.log('\n📊 Auditing Redis...');

  // Placeholder: Redis scan would require redis client
  report.stores.redis.status = 'skipped (requires redis client)';
  console.log('⏭️  Redis audit skipped (requires client setup)');
}

// ============================================================================
// VERDICT LOGIC
// ============================================================================

function generateVerdicts() {
  console.log('\n🎯 Generating verdicts...');

  const criticalFields = [
    'packet_key', 'source_ref', 'feature_id', 'qdrant_point_id',
    'community_id', 'som_cluster', 'retrieval_strategy'
  ];

  for (const field of TARGET_FIELDS) {
    const fieldData = report.fields[field];
    if (!fieldData) {
      report.verdicts[field] = { status: 'NOT_FOUND', details: 'Field not found in any store' };
      continue;
    }

    const stores = Object.keys(fieldData.exists_in).length;
    const indexed = Object.keys(fieldData.indexed).length;

    if (stores === 0) {
      report.verdicts[field] = { status: 'MISSING', stores: 0 };
    } else if (criticalFields.includes(field) && !fieldData.exists_in.qdrant) {
      report.verdicts[field] = {
        status: 'FAIL',
        reason: `Critical field missing from Qdrant`,
        stores
      };
      if (!report.blockers.find(b => b.blocker.includes(field))) {
        report.blockers.push({
          blocker: `Critical field missing from Qdrant: ${field}`,
          severity: 'CRITICAL',
          impact: 'ACE/KAG/DAG retrieval cannot filter by this field'
        });
      }
    } else if (stores >= 2) {
      report.verdicts[field] = { status: 'PASS', stores, indexed };
    } else if (stores === 1) {
      report.verdicts[field] = { status: 'WARN', reason: 'Field only in one store', stores };
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => { responseData += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🔍 Auditing Metadata Contract Across All Stores');
  console.log('================================================\n');

  await auditPostgres();
  await auditQdrant();
  await auditNeo4j();
  await auditRedis();

  generateVerdicts();

  // Write JSON report
  const jsonPath = path.join(__dirname, '../../docs/reports/metadata-contract-cross-store-audit.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ JSON report: ${jsonPath}`);

  // Write MD report
  const mdReport = generateMarkdownReport(report);
  const mdPath = path.join(__dirname, '../../docs/reports/metadata-contract-cross-store-audit.md');
  fs.writeFileSync(mdPath, mdReport);
  console.log(`✅ Markdown report: ${mdPath}`);

  // Summary
  const failCount = Object.values(report.verdicts).filter(v => v.status === 'FAIL').length;
  const passCount = Object.values(report.verdicts).filter(v => v.status === 'PASS').length;

  console.log(`\n📊 Summary: ${passCount} PASS, ${failCount} FAIL, ${report.blockers.length} blockers\n`);

  await pool.end();
}

function generateMarkdownReport(data) {
  let md = `# Metadata Contract Cross-Store Audit\n\n`;
  md += `**Date**: ${data.audit_date}\n\n`;

  md += `## Verdicts Summary\n\n`;
  md += `| Field | Status | Stores | Indexed |\n`;
  md += `|-------|--------|--------|----------|\n`;

  for (const [field, verdict] of Object.entries(data.verdicts)) {
    const status = verdict.status || 'UNKNOWN';
    const stores = verdict.stores || 0;
    const indexed = verdict.indexed || 0;
    md += `| ${field} | ${status} | ${stores} | ${indexed} |\n`;
  }

  if (data.blockers.length > 0) {
    md += `\n## Blockers\n\n`;
    for (const blocker of data.blockers) {
      md += `- **${blocker.blocker}** (${blocker.severity})\n`;
      if (blocker.impact) md += `  - Impact: ${blocker.impact}\n`;
    }
  }

  return md;
}

main().catch(console.error);
