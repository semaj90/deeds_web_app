#!/usr/bin/env node
/**
 * scripts/atlas/quarantine-vendor-rows.mjs
 *
 * Marks vendor/generated rows in parent_atlas_documents with:
 *   - tags: append 'vendor', 'excluded_from_profile_cards'
 *
 * Does NOT delete any rows. Safe to re-run (idempotent).
 *
 * Usage:
 *   node scripts/atlas/quarantine-vendor-rows.mjs --dry-run
 *   node scripts/atlas/quarantine-vendor-rows.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

// ── Vendor path patterns ────────────────────────────────────────────────────
const VENDOR_PREFIXES = [
  'turbovec/',
  'docker/langgraph-synthesis/.venv/',
  'docker/langgraph-synthesis/node_modules/',
  'scripts/api-cleanup/reports/',
  'scripts/case_data/_cache/',
  'scripts/tests/performance-results/',
  'scripts/tests/agent-investigate-results/',
  'scripts/unsloth-training/COLAB_PACKAGE/',
  'scripts/atlas/out/',
  '.venv/',
  'node_modules/',
  '.svelte-kit/',
  '.vite/',
  'dist/',
  'build/',
  'models/',
];

const VENDOR_SUBSTRINGS = [
  '/.venv/',
  '/node_modules/',
  '/dist-info/',
  '.dist-info',
  '/site-packages/',
];

function isVendor(sourceRef) {
  const normalized = String(sourceRef ?? '')
    .replace(/\\/g, '/')
    .replace(/^(\.\.\/)+/, '')
    .replace(/^sveltekit-frontend\//, '');
  for (const p of VENDOR_PREFIXES) {
    if (normalized.startsWith(p)) return { match: true, pattern: p };
  }
  for (const s of VENDOR_SUBSTRINGS) {
    if (normalized.includes(s)) return { match: true, pattern: s };
  }
  return { match: false };
}

// ── Env loader ───────────────────────────────────────────────────────────────
function loadEnv() {
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    break;
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL
  ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  console.log('\n══ Vendor Quarantine ══════════════════════════════════════');
  console.log(`  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  Patterns: ${VENDOR_PREFIXES.length} prefixes + ${VENDOR_SUBSTRINGS.length} substrings\n`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Load all non-feature rows
  console.log('  Step 1: Load parent_atlas_documents rows...');
  const { rows: allRows } = await pool.query(`
    SELECT id, source_ref, tags
    FROM parent_atlas_documents
    WHERE source_ref NOT LIKE 'feature:%'
    ORDER BY source_ref
  `);
  console.log(`  ✅ Loaded ${allRows.length} rows`);

  // Classify
  const vendorRows = [];
  const patternCounts = {};
  for (const row of allRows) {
    const result = isVendor(row.source_ref);
    if (result.match) {
      vendorRows.push(row);
      patternCounts[result.pattern] = (patternCounts[result.pattern] ?? 0) + 1;
    }
  }
  console.log(`\n  Vendor rows found: ${vendorRows.length} / ${allRows.length}`);
  console.log(`  Already clean:     ${allRows.length - vendorRows.length}`);

  console.log('\n  Pattern breakdown:');
  for (const [pat, count] of Object.entries(patternCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(5)}  ${pat}`);
  }

  // Rows already quarantined
  const alreadyDone = vendorRows.filter(r => Array.isArray(r.tags) && r.tags.includes('vendor'));
  const needsUpdate = vendorRows.filter(r => !Array.isArray(r.tags) || !r.tags.includes('vendor'));

  console.log(`\n  Already quarantined: ${alreadyDone.length}`);
  console.log(`  Needs update:        ${needsUpdate.length}`);

  if (needsUpdate.length > 0 && VERBOSE) {
    console.log('\n  Sample (first 10):');
    needsUpdate.slice(0, 10).forEach(r => console.log(`    ${r.source_ref}`));
  }

  if (!APPLY) {
    console.log('\n  [DRY-RUN] No writes. Pass --apply to quarantine vendor rows.');

    // Write dry-run report
    const report = {
      timestamp: new Date().toISOString(),
      mode: 'dry-run',
      total_rows: allRows.length,
      vendor_rows: vendorRows.length,
      already_quarantined: alreadyDone.length,
      needs_update: needsUpdate.length,
      pattern_breakdown: patternCounts,
      sample_paths: vendorRows.slice(0, 20).map(r => r.source_ref),
    };
    const reportPath = path.join(ROOT, '.tmp', 'vendor-quarantine-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n  Report → ${reportPath}`);
    await pool.end();
    return;
  }

  // Apply: UPDATE tags array
  console.log('\n  Step 2: Updating vendor rows...');
  let updated = 0;
  let failed = 0;
  const BATCH = 100;

  for (let i = 0; i < needsUpdate.length; i += BATCH) {
    const batch = needsUpdate.slice(i, i + BATCH);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of batch) {
        // Merge new tags into existing array, avoid duplicates
        await client.query(`
          UPDATE parent_atlas_documents
          SET
            tags = (
              SELECT ARRAY(
                SELECT DISTINCT unnest(
                  COALESCE(tags, ARRAY[]::text[]) ||
                  ARRAY['vendor', 'excluded_from_profile_cards']
                )
              )
            ),
            updated_at = now()
          WHERE id = $1
        `, [row.id]);
        updated++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      failed += batch.length;
      console.error(`  [batch ${i}] failed:`, err.message);
    } finally {
      client.release();
    }
    if ((i + BATCH) % 200 === 0 || i + BATCH >= needsUpdate.length) {
      console.log(`  updated ${Math.min(i + BATCH, needsUpdate.length)}...`);
    }
  }

  // Final counts
  const { rows: finalCounts } = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE 'vendor' = ANY(tags)) AS quarantined,
      COUNT(*) FILTER (WHERE 'vendor' != ALL(COALESCE(tags, '{}')) AND source_ref NOT LIKE 'feature:%') AS clean
    FROM parent_atlas_documents;
  `);

  await pool.end();

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    mode: 'apply',
    total_rows: allRows.length,
    vendor_rows: vendorRows.length,
    already_quarantined: alreadyDone.length,
    updated,
    failed,
    pattern_breakdown: patternCounts,
    db_counts: finalCounts[0],
    sample_paths: vendorRows.slice(0, 20).map(r => r.source_ref),
    profile_card_exclusion_count: vendorRows.length,
  };
  const reportPath = path.join(ROOT, '.tmp', 'vendor-quarantine-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n══ Results ═════════════════════════════════════════════════');
  console.log(`  Total rows:       ${allRows.length}`);
  console.log(`  Vendor rows:      ${vendorRows.length}`);
  console.log(`  Already done:     ${alreadyDone.length}`);
  console.log(`  Updated:          ${updated}`);
  console.log(`  Failed:           ${failed}`);
  console.log(`  DB quarantined:   ${finalCounts[0].quarantined}`);
  console.log(`  DB clean:         ${finalCounts[0].clean}`);
  console.log(`\n  Profile-card builds will now skip ${vendorRows.length} vendor rows.`);
  console.log(`  Report → ${reportPath}`);
  console.log('\n  ✅ Quarantine complete. Next: derive-semantic-api-tags.mjs');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
