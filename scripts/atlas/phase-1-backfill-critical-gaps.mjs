#!/usr/bin/env node
/**
 * Phase 1: Backfill Critical Gaps
 *
 * Executes three sequential steps to fix blocking data gaps:
 * 1. Backfill file_path from source_ref
 * 2. Backfill tree_node_id from atlas_tree_nodes
 * 3. Add som_cluster column + seed with null
 *
 * Each step validates coverage gate before proceeding.
 * Dry-run by default; use --apply to commit changes.
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../../');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const flags = {
  apply: process.argv.includes('--apply'),
  verbose: process.argv.includes('--verbose')
};

const dryRun = !flags.apply;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 1: Backfill Critical Gaps                              ║');
console.log(`║  Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}${dryRun ? ' (preview only)' : ' (live changes)'}${' '.repeat(dryRun ? 15 : 21)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ────────────────────────────────────────────────────────────────
// Step 1: Backfill file_path from source_ref
// ────────────────────────────────────────────────────────────────

async function backfillFilePath() {
  console.log('📝 Step 1: Backfill file_path from source_ref\n');

  try {
    // Preview: show what will be updated
    const preview = await pool.query(`
      SELECT COUNT(*) as total, COUNT(file_path) as already_filled
      FROM atlas_codebase_packets
      WHERE source_ref IS NOT NULL AND (file_path IS NULL OR file_path = '')
    `);

    const toUpdate = preview.rows[0].total;
    const alreadyFilled = preview.rows[0].already_filled;

    console.log(`   Total packets needing file_path: ${toUpdate}`);
    console.log(`   Already filled: ${alreadyFilled}`);
    console.log(`   To update: ${toUpdate - alreadyFilled}\n`);

    if (dryRun) {
      console.log('   [DRY-RUN] Would execute:\n');
      console.log('   UPDATE atlas_codebase_packets');
      console.log('   SET file_path = source_ref');
      console.log('   WHERE source_ref IS NOT NULL AND (file_path IS NULL OR file_path = "")\n');

      // Preview expected coverage after update
      const expectedFilled = toUpdate - alreadyFilled;
      const totalRows = toUpdate + alreadyFilled;
      const expectedCoverage = ((totalRows / totalRows) * 100).toFixed(1);
      console.log(`   Expected coverage after update: 100.0% (all ${totalRows} rows would be filled)\n`);
    } else {
      console.log('   [APPLY] Executing update...\n');
      const result = await pool.query(`
        UPDATE atlas_codebase_packets
        SET file_path = source_ref
        WHERE source_ref IS NOT NULL AND (file_path IS NULL OR file_path = '')
      `);
      console.log(`   ✅ Updated ${result.rowCount} rows\n`);
    }

    // Verify coverage gate (after apply)
    const verify = await pool.query(`
      SELECT COUNT(*) as total, COUNT(NULLIF(file_path, '')) as filled
      FROM atlas_codebase_packets
    `);

    const totalRows = parseInt(verify.rows[0].total);
    const filledRows = parseInt(verify.rows[0].filled);
    const coverage = ((filledRows / totalRows) * 100).toFixed(1);

    console.log(`   Coverage after: ${coverage}% (${filledRows}/${totalRows})`);
    console.log(`   Gate (≥95%): ${coverage >= 95 ? '✅ PASS' : '❌ FAIL'}\n`);

    return coverage >= 95;
  } catch (err) {
    console.error('   ❌ Error:', err.message);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────
// Step 2: Backfill tree_node_id from atlas_tree_nodes
// ────────────────────────────────────────────────────────────────

async function backfillTreeNodeId() {
  console.log('📝 Step 2: Backfill tree_node_id from atlas_tree_nodes\n');

  try {
    // Check if atlas_tree_nodes exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'atlas_tree_nodes'
      )
    `);

    if (!tableExists.rows[0].exists) {
      console.log('   ⏳ atlas_tree_nodes does not exist yet (optional for Phase 1)\n');
      return true; // Non-blocking
    }

    // Preview: match packets to tree nodes by directory hierarchy
    const preview = await pool.query(`
      SELECT COUNT(*) as total, COUNT(tree_node_id) as already_filled
      FROM atlas_codebase_packets
      WHERE tree_node_id IS NULL
    `);

    const toUpdate = preview.rows[0].total;

    console.log(`   Packets without tree_node_id: ${toUpdate}\n`);

    if (dryRun) {
      console.log('   [DRY-RUN] Would execute:\n');
      console.log('   UPDATE atlas_codebase_packets ap');
      console.log('   SET tree_node_id = atn.id');
      console.log('   FROM atlas_tree_nodes atn');
      console.log('   WHERE ap.source_ref LIKE atn.path || \'/%\'');
      console.log('   AND ap.tree_node_id IS NULL\n');
      console.log(`   Expected coverage after update: 80-95% (hierarchical match, depends on path depth)\n`);
    } else {
      console.log('   [APPLY] Executing hierarchical match...\n');

      // Match packets to tree nodes by path prefix
      const result = await pool.query(`
        UPDATE atlas_codebase_packets ap
        SET tree_node_id = (
          SELECT id FROM atlas_tree_nodes atn
          WHERE ap.source_ref LIKE atn.path || '/%'
          ORDER BY LENGTH(atn.path) DESC
          LIMIT 1
        )
        WHERE ap.tree_node_id IS NULL
        AND ap.source_ref IS NOT NULL
      `);
      console.log(`   ✅ Linked ${result.rowCount} packets to tree nodes\n`);
    }

    // Verify coverage gate
    const verify = await pool.query(`
      SELECT COUNT(*) as total, COUNT(tree_node_id) as filled
      FROM atlas_codebase_packets
    `);

    const totalRows = parseInt(verify.rows[0].total);
    const filledRows = parseInt(verify.rows[0].filled);
    const coverage = ((filledRows / totalRows) * 100).toFixed(1);

    console.log(`   Coverage after: ${coverage}% (${filledRows}/${totalRows})`);
    console.log(`   Gate (≥90%): ${coverage >= 90 ? '✅ PASS' : '❌ FAIL'}\n`);

    return coverage >= 90;
  } catch (err) {
    console.error('   ❌ Error:', err.message);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────
// Step 3: Add som_cluster column (if missing)
// ────────────────────────────────────────────────────────────────

async function addSomClusterColumn() {
  console.log('📝 Step 3: Add som_cluster column (if missing)\n');

  try {
    // Check if column exists
    const columnExists = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'atlas_codebase_packets' AND column_name = 'som_cluster'
      )
    `);

    if (columnExists.rows[0].exists) {
      console.log('   ✅ som_cluster column already exists\n');

      // Check coverage
      const coverage = await pool.query(`
        SELECT COUNT(*) as total, COUNT(som_cluster) as filled
        FROM atlas_codebase_packets
      `);

      const totalRows = parseInt(coverage.rows[0].total);
      const filledRows = parseInt(coverage.rows[0].filled);
      const pct = ((filledRows / totalRows) * 100).toFixed(1);

      console.log(`   Current coverage: ${pct}% (${filledRows}/${totalRows})\n`);
      return true;
    }

    console.log('   [DRY-RUN] Would add column:\n');
    console.log('   ALTER TABLE atlas_codebase_packets');
    console.log('   ADD COLUMN som_cluster INTEGER DEFAULT NULL;\n');

    if (!dryRun) {
      console.log('   [APPLY] Adding som_cluster column...\n');
      await pool.query(`
        ALTER TABLE atlas_codebase_packets
        ADD COLUMN som_cluster INTEGER DEFAULT NULL
      `);
      console.log('   ✅ Column added\n');

      // Create index for SOM lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_atlas_codebase_packets_som_cluster
        ON atlas_codebase_packets(som_cluster)
        WHERE som_cluster IS NOT NULL
      `);
      console.log('   ✅ Sparse index created (som_cluster IS NOT NULL)\n');
    }

    console.log('   ⏳ Column ready for k-means population (Phase 1b)\n');
    return true;
  } catch (err) {
    console.error('   ❌ Error:', err.message);
    return false;
  }
}

// ────────────────────────────────────────────────────────────────
// Summary & Validation
// ────────────────────────────────────────────────────────────────

async function main() {
  try {
    const step1Pass = await backfillFilePath();
    const step2Pass = await backfillTreeNodeId();
    const step3Pass = await addSomClusterColumn();

    // Final health check
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Phase 1 Status                                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const allPass = step1Pass && step2Pass && step3Pass;

    console.log(`   Step 1 (file_path):     ${step1Pass ? '✅ PASS' : '⚠️  INCOMPLETE'}`);
    console.log(`   Step 2 (tree_node_id):  ${step2Pass ? '✅ PASS' : '⚠️  INCOMPLETE'}`);
    console.log(`   Step 3 (som_cluster):   ${step3Pass ? '✅ PASS' : '⚠️  INCOMPLETE'}\n`);

    if (dryRun) {
      console.log('   📋 DRY-RUN PREVIEW COMPLETE\n');
      console.log('   To apply these changes, run:\n');
      console.log('   node scripts/atlas/phase-1-backfill-critical-gaps.mjs --apply\n');
    } else {
      if (allPass) {
        console.log('   ✅ Phase 1 COMPLETE\n');
        console.log('   Next: Run health logger to validate improvement:\n');
        console.log('   npm run atlas:clustering:health\n');
      } else {
        console.log('   ❌ Phase 1 INCOMPLETE - see errors above\n');
      }
    }

    process.exit(allPass ? 0 : 1);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
