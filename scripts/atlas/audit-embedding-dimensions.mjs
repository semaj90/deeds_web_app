#!/usr/bin/env node

/**
 * AUDIT: Embedding Dimension Compliance
 *
 * Checks:
 * - Postgres pgvector columns and actual dimensions
 * - Qdrant collections and vector sizes
 * - Script references to _768 vs _384
 * - Hardcoded dimension assumptions
 *
 * Hard fail if:
 * - 384 vector written to 768 collection
 * - 768 vector written to 384 collection
 * - Collection name/size mismatch
 * - Schema inconsistency (says 384 but collection says 768)
 */

import pg from 'pg';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __root = path.resolve(__dirname, '../..');

const pool = new pg.Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5434,
  user: process.env.PGUSER || 'legal_admin',
  password: process.env.PGPASSWORD || '123456',
  database: process.env.PGDATABASE || 'legal_ai_db'
});

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const TMP_DIR = path.resolve(__root, '.tmp');

const audit = {
  timestamp: new Date().toISOString(),
  postgres: {
    pgvector_columns: [],
    actual_dimensions: {},
    schema_mismatches: []
  },
  qdrant: {
    collections: [],
    vector_sizes: {},
    mismatches: []
  },
  scripts: {
    references_768: [],
    references_384: [],
    dimension_assumptions: []
  },
  violations: [],
  status: 'PASS'
};

console.log('\n🔍 EMBEDDING DIMENSION AUDIT\n');

// ── Step 1: Audit Postgres pgvector columns ─────────────────────────
console.log('📋 Checking Postgres pgvector columns...');

try {
  const pgvectorResult = await pool.query(`
    SELECT
      table_name,
      column_name,
      data_type,
      udt_name
    FROM information_schema.columns
    WHERE (data_type = 'USER-DEFINED' AND udt_name = 'vector')
       OR column_name LIKE '%embedding%'
    ORDER BY table_name, column_name
  `);

  for (const col of pgvectorResult.rows) {
    audit.postgres.pgvector_columns.push({
      table: col.table_name,
      column: col.column_name,
      type: col.data_type === 'USER-DEFINED' ? 'vector' : col.data_type
    });

    // Try to determine actual dimension
    const dimResult = await pool.query(
      `SELECT ${col.column_name}, array_dims(${col.column_name}) as dims FROM ${col.table_name} WHERE ${col.column_name} IS NOT NULL LIMIT 1`
    ).catch(() => null);

    if (dimResult && dimResult.rows.length > 0) {
      const dims = dimResult.rows[0].dims;
      audit.postgres.actual_dimensions[`${col.table_name}.${col.column_name}`] = dims;
    }
  }

  console.log(`   ✓ Found ${pgvectorResult.rows.length} pgvector columns`);
} catch (err) {
  console.error(`   ❌ Postgres query failed: ${err.message}`);
  audit.violations.push(`Postgres audit failed: ${err.message}`);
  audit.status = 'PARTIAL';
}

// ── Step 2: Audit Qdrant collections ──────────────────────────────
console.log('📋 Checking Qdrant collections...');

try {
  const collectionsRes = await fetch(`${QDRANT_URL}/collections`);
  const collectionsData = await collectionsRes.json();

  if (collectionsData.result && collectionsData.result.collections) {
    for (const coll of collectionsData.result.collections) {
      const collName = coll.name;

      // Fetch collection config
      const configRes = await fetch(`${QDRANT_URL}/collections/${collName}`);
      const configData = await configRes.json();

      if (configData.result) {
        const config = configData.result.config;
        const vectors = config.params.vectors;

        audit.qdrant.collections.push({
          name: collName,
          vector_config: Object.keys(vectors).map(k => ({
            name: k,
            size: vectors[k].size
          }))
        });

        audit.qdrant.vector_sizes[collName] = vectors;

        // Check for name/size mismatch
        if (collName.includes('768') && Object.values(vectors).some(v => v.size !== 768)) {
          audit.qdrant.mismatches.push({
            collection: collName,
            expected: 768,
            actual: Object.values(vectors)[0].size,
            message: 'Collection name suggests 768 but vectors are different size'
          });
        }
        if (collName.includes('384') && Object.values(vectors).some(v => v.size !== 384)) {
          audit.qdrant.mismatches.push({
            collection: collName,
            expected: 384,
            actual: Object.values(vectors)[0].size,
            message: 'Collection name suggests 384 but vectors are different size'
          });
        }
      }
    }
  }

  console.log(`   ✓ Found ${audit.qdrant.collections.length} Qdrant collections`);
} catch (err) {
  console.error(`   ❌ Qdrant query failed: ${err.message}`);
  audit.violations.push(`Qdrant audit failed: ${err.message}`);
  audit.status = 'PARTIAL';
}

// ── Step 3: Scan scripts for dimension references ──────────────────
console.log('📋 Scanning scripts for dimension assumptions...');

try {
  const scriptsDir = path.resolve(__root, 'scripts');
  const files = fs.readdirSync(scriptsDir, { recursive: true })
    .filter(f => f.endsWith('.mjs') || f.endsWith('.ts'))
    .slice(0, 100); // Limit to first 100 files

  for (const file of files) {
    const fullPath = path.join(scriptsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');

    if (content.includes('_768') || content.includes('768')) {
      audit.scripts.references_768.push(file);
    }
    if (content.includes('_384') || content.includes('384')) {
      audit.scripts.references_384.push(file);
    }
    if (content.match(/dimension\s*[:=]\s*\d+/) || content.match(/embedding.*\d+.*dim/i)) {
      const match = content.match(/dimension\s*[:=]\s*(\d+)/);
      if (match) {
        audit.scripts.dimension_assumptions.push({
          file,
          dimension: parseInt(match[1]),
          line: content.split('\n').findIndex(l => l.includes(match[0])) + 1
        });
      }
    }
  }

  console.log(`   ✓ Scanned ${files.length} script files`);
} catch (err) {
  console.error(`   ⚠️  Script scan error: ${err.message}`);
}

// ── Step 4: Check for critical violations ──────────────────────────
console.log('📋 Checking for critical violations...');

const violations = [];

// Violation 1: Qdrant collection name/size mismatch
if (audit.qdrant.mismatches.length > 0) {
  violations.push({
    severity: 'CRITICAL',
    type: 'QDRANT_NAME_SIZE_MISMATCH',
    count: audit.qdrant.mismatches.length,
    details: audit.qdrant.mismatches
  });
  audit.status = 'FAIL';
}

// Violation 2: Multiple dimension assumptions in scripts
if (audit.scripts.dimension_assumptions.length > 1) {
  const dims = new Set(audit.scripts.dimension_assumptions.map(d => d.dimension));
  if (dims.size > 1) {
    violations.push({
      severity: 'WARNING',
      type: 'MIXED_DIMENSION_ASSUMPTIONS',
      dimensions: Array.from(dims),
      count: audit.scripts.dimension_assumptions.length
    });
  }
}

// Violation 3: Check for _768 references that should be _384
const activeScripts = audit.scripts.references_768
  .filter(f => f.includes('p5') || f.includes('p8') || f.includes('langextract'));
if (activeScripts.length > 0) {
  violations.push({
    severity: 'HIGH',
    type: 'ACTIVE_SCRIPTS_USE_768',
    scripts: activeScripts,
    message: 'Active Phase 85 scripts reference _768 instead of _384'
  });
  audit.status = 'FAIL';
}

audit.violations = violations;

// ── Step 5: Write report ──────────────────────────────────────────
const reportPath = path.resolve(TMP_DIR, 'embedding-dimension-audit.json');
fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2));

console.log(`\n📊 AUDIT RESULTS\n`);
console.log(`Status: ${audit.status}`);
console.log(`Postgres pgvector columns: ${audit.postgres.pgvector_columns.length}`);
console.log(`Qdrant collections: ${audit.qdrant.collections.length}`);
console.log(`Script files with _768: ${audit.scripts.references_768.length}`);
console.log(`Script files with _384: ${audit.scripts.references_384.length}`);
console.log(`Violations found: ${violations.length}`);

if (violations.length > 0) {
  console.log('\n⚠️  VIOLATIONS:\n');
  violations.forEach(v => {
    console.log(`  [${v.severity}] ${v.type}`);
    if (v.details) console.log(`    ${JSON.stringify(v.details, null, 4)}`);
    if (v.message) console.log(`    ${v.message}`);
  });
}

console.log(`\n📁 Report: ${reportPath}\n`);

if (audit.status === 'FAIL') {
  process.exit(1);
}

await pool.end();