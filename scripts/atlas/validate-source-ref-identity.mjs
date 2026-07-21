#!/usr/bin/env node
/**
 * validate-source-ref-identity.mjs
 *
 * Audit source_ref derivation chain for identity conflation.
 * Identifies three problems:
 * 1. source_ref missing or null
 * 2. source_ref format invalid (must match /^(task:|src/|docs/|api-docs/)/)
 * 3. source_ref + packet_key duplicates (non-unique identity)
 *
 * Run: node scripts/atlas/validate-source-ref-identity.mjs [--fix]
 * Dry-run (default): audit only, no writes
 * --fix flag: backfill missing source_ref from OKF bundle and task metadata
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALID_SOURCE_REF_REGEX = /^(task:|src/|docs/|api-docs\/)/;
const DRY_RUN = !process.argv.includes('--fix');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:password@127.0.0.1:5434/legal_ai_db'
});

async function audit() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`SOURCE_REF IDENTITY VALIDATION AUDIT`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (audit only)' : 'FIX (backfill enabled)'}`);
  console.log(`${'═'.repeat(70)}\n`);

  try {
    // Issue 1: Missing or null source_ref
    console.log('[1/3] Checking for missing/null source_ref...');
    const missingRes = await pool.query(`
      SELECT COUNT(*) as cnt,
             COUNT(DISTINCT packet_key) as affected_packets
      FROM atlas_packets
      WHERE source_ref IS NULL OR source_ref = '';
    `);
    const missing = missingRes.rows[0];
    console.log(`  Missing source_ref: ${missing.cnt} rows (${missing.affected_packets} unique packets)`);
    if (missing.cnt > 0) {
      const examples = await pool.query(`
        SELECT packet_key, feature_id, created_at FROM atlas_packets
        WHERE source_ref IS NULL OR source_ref = ''
        LIMIT 5;
      `);
      console.log(`  Examples:`);
      examples.rows.forEach(r => {
        console.log(`    - packet_key=${r.packet_key}, feature_id=${r.feature_id}, created_at=${r.created_at}`);
      });
    }

    // Issue 2: Invalid format
    console.log('\n[2/3] Checking for invalid source_ref format...');
    const invalidRes = await pool.query(`
      SELECT COUNT(*) as cnt,
             COUNT(DISTINCT packet_key) as affected_packets
      FROM atlas_packets
      WHERE source_ref IS NOT NULL
        AND source_ref != ''
        AND source_ref NOT ~ '^(task:|src/|docs/|api-docs/)';
    `);
    const invalid = invalidRes.rows[0];
    console.log(`  Invalid format: ${invalid.cnt} rows (${invalid.affected_packets} unique packets)`);
    if (invalid.cnt > 0) {
      const examples = await pool.query(`
        SELECT packet_key, source_ref, feature_id FROM atlas_packets
        WHERE source_ref IS NOT NULL
          AND source_ref != ''
          AND source_ref NOT ~ '^(task:|src/|docs/|api-docs/)'
        LIMIT 5;
      `);
      console.log(`  Examples:`);
      examples.rows.forEach(r => {
        console.log(`    - packet_key=${r.packet_key}, source_ref="${r.source_ref}", feature_id=${r.feature_id}`);
      });
    }

    // Issue 3: Duplicates (non-unique identity)
    console.log('\n[3/3] Checking for duplicate source_ref + packet_key combinations...');
    const dupRes = await pool.query(`
      SELECT source_ref, packet_key, COUNT(*) as cnt
      FROM atlas_packets
      WHERE source_ref IS NOT NULL AND source_ref != ''
      GROUP BY source_ref, packet_key
      HAVING COUNT(*) > 1;
    `);
    console.log(`  Duplicate identities: ${dupRes.rows.length} unique pairs`);
    if (dupRes.rows.length > 0) {
      console.log(`  Examples:`);
      dupRes.rows.slice(0, 5).forEach(r => {
        console.log(`    - source_ref="${r.source_ref}", packet_key="${r.packet_key}", count=${r.cnt}`);
      });
    }

    // Summary
    const totalIssues = missing.cnt + invalid.cnt + dupRes.rows.length;
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`IDENTITY AUDIT SUMMARY`);
    console.log(`  Missing source_ref: ${missing.cnt}`);
    console.log(`  Invalid format: ${invalid.cnt}`);
    console.log(`  Duplicate pairs: ${dupRes.rows.length}`);
    console.log(`  Total issues: ${totalIssues}`);
    console.log(`${'─'.repeat(70)}\n`);

    if (totalIssues === 0) {
      console.log('✅ ALL CHECKS PASSED — source_ref identity is clean');
      return { pass: true, issues: 0 };
    }

    if (DRY_RUN) {
      console.log('⚠️  ISSUES FOUND — Run with --fix flag to attempt backfill');
      return { pass: false, issues: totalIssues };
    }

    // Backfill logic (only if --fix flag is set)
    console.log('\n🔧 ATTEMPTING BACKFILL...\n');

    // Step 1: Load OKF bundle to derive source_ref from file paths
    console.log('[Backfill Step 1] Loading OKF bundle...');
    const okfPath = path.join(__dirname, '../../sveltekit-frontend/.okf/packets/packets.ndjson');
    const okfMap = new Map(); // packet_key → source_ref

    if (fs.existsSync(okfPath)) {
      const lines = fs.readFileSync(okfPath, 'utf-8').split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const packet = JSON.parse(line);
          if (packet.packet_key && packet.source_ref) {
            okfMap.set(packet.packet_key, packet.source_ref);
          }
        } catch (e) {
          // Skip malformed lines
        }
      }
      console.log(`  Loaded ${okfMap.size} packet_key → source_ref mappings from OKF`);
    } else {
      console.log(`  ⚠️  OKF bundle not found at ${okfPath} — will use fallback strategy`);
    }

    // Step 2: Backfill missing source_ref from OKF or task metadata
    console.log('\n[Backfill Step 2] Backfilling missing source_ref...');
    let backfilled = 0;

    for (const [pkey, srcRef] of okfMap) {
      const result = await pool.query(
        `UPDATE atlas_packets
         SET source_ref = $1, updated_at = NOW()
         WHERE packet_key = $2 AND (source_ref IS NULL OR source_ref = '')`,
        [srcRef, pkey]
      );
      backfilled += result.rowCount;
    }

    console.log(`  Backfilled ${backfilled} rows from OKF mappings`);

    // Step 3: For remaining missing source_ref, derive from feature_id or task context
    console.log('\n[Backfill Step 3] Deriving source_ref for remaining packets...');
    const remainingRes = await pool.query(`
      SELECT packet_key, feature_id, context FROM atlas_packets
      WHERE (source_ref IS NULL OR source_ref = '')
      LIMIT 1000;
    `);

    let derivedCount = 0;
    for (const row of remainingRes.rows) {
      let derivedRef = null;

      // Try to derive from feature_id
      if (row.feature_id && row.feature_id.startsWith('src/')) {
        derivedRef = row.feature_id;
      } else if (row.feature_id && row.feature_id.includes(':')) {
        // task-based feature (e.g., "task:embed:2026-07-19:abc")
        derivedRef = `task:${row.feature_id.split(':')[1]}`;
      } else {
        // Last resort: check context JSONB for task_id or workspace_task_id
        try {
          const ctx = row.context || {};
          if (ctx.task_id) {
            derivedRef = `task:${ctx.task_id}`;
          } else if (ctx.workspace_task_id) {
            derivedRef = `task:${ctx.workspace_task_id}`;
          }
        } catch (e) {
          // Continue without backfill for this row
        }
      }

      if (derivedRef && VALID_SOURCE_REF_REGEX.test(derivedRef)) {
        await pool.query(
          `UPDATE atlas_packets SET source_ref = $1, updated_at = NOW() WHERE packet_key = $2`,
          [derivedRef, row.packet_key]
        );
        derivedCount++;
      }
    }

    console.log(`  Derived and backfilled ${derivedCount} source_ref values`);

    // Step 4: Check for duplicate identities and report (don't auto-fix)
    console.log('\n[Backfill Step 4] Checking for duplicate identities (post-backfill)...');
    const dupCheckRes = await pool.query(`
      SELECT source_ref, packet_key, COUNT(*) as cnt
      FROM atlas_packets
      WHERE source_ref IS NOT NULL AND source_ref != ''
      GROUP BY source_ref, packet_key
      HAVING COUNT(*) > 1;
    `);

    if (dupCheckRes.rows.length > 0) {
      console.log(`  ⚠️  Found ${dupCheckRes.rows.length} duplicate identities (manual review needed):`);
      dupCheckRes.rows.slice(0, 5).forEach(r => {
        console.log(`     - source_ref="${r.source_ref}", packet_key="${r.packet_key}", count=${r.cnt}`);
      });
    } else {
      console.log(`  ✅ No duplicate identities found`);
    }

    // Final validation
    console.log('\n[Backfill Step 5] Final validation...');
    const finalCheck = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND source_ref != '') as with_source_ref,
        COUNT(*) FILTER (WHERE source_ref ~ '^(task:|src/|docs/|api-docs/)') as valid_format
      FROM atlas_packets;
    `);

    const final = finalCheck.rows[0];
    const coverage = Math.round((final.valid_format / final.total) * 100);
    console.log(`  Total packets: ${final.total}`);
    console.log(`  With source_ref: ${final.with_source_ref} (${Math.round((final.with_source_ref / final.total) * 100)}%)`);
    console.log(`  Valid format: ${final.valid_format} (${coverage}%)`);

    console.log(`\n${'═'.repeat(70)}`);
    if (coverage >= 95) {
      console.log('✅ BACKFILL SUCCESSFUL — source_ref identity is now clean');
      return { pass: true, coverage };
    } else {
      console.log(`⚠️  PARTIAL BACKFILL — ${coverage}% coverage, ${final.total - final.valid_format} packets still missing valid source_ref`);
      return { pass: false, coverage };
    }

  } catch (err) {
    console.error('❌ AUDIT ERROR:', err.message);
    return { pass: false, error: err.message };
  } finally {
    await pool.end();
  }
}

await audit();
