#!/usr/bin/env node
/**
 * Apply Hardened Sanitizer to Production Database
 *
 * Updates all summaries in codebase_chunk_index with cleaned versions.
 * Runs in two modes:
 *   --dry-run: Show what would be changed (no writes)
 *   --all: Actually apply changes to database
 */

import pg from 'pg';
import {
  sanitizeGemma4Summary,
  isUsableGemma4Summary
} from './lib/gemma4-summary-sanitizer.mjs';

const { Pool } = pg;

const dryRun = process.argv.includes('--dry-run');
const applyAll = process.argv.includes('--all');
const batchSize = 100;

if (!dryRun && !applyAll) {
  console.error('❌ Usage: node apply-hardened-sanitizer.mjs [--dry-run|--all]');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: parseInt(process.env.DATABASE_PORT || '5434'),
  database: process.env.DATABASE_NAME || 'legal_ai_db',
  user: process.env.DATABASE_USER || 'legal_admin',
  password: process.env.DATABASE_PASSWORD || 'legal_admin',
  max: 5
});

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log(`  APPLY HARDENED SANITIZER${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('═'.repeat(80));

  try {
    // 1. Fetch all summaries
    console.log(`\n📥 Fetching all summaries...`);
    const result = await pool.query(`
      SELECT id, summary, relative_path
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL
      ORDER BY id
    `);

    const rows = result.rows;
    console.log(`✅ Loaded ${rows.length} summaries`);

    // 2. Process in batches
    let updated = 0;
    let failed = 0;
    let noChange = 0;
    const failures = [];

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(rows.length / batchSize)}...`);

      for (const row of batch) {
        const { summary: cleaned, markersCleaned, markersFailed } = sanitizeGemma4Summary(row.summary);

        // Check if cleaning was effective
        if (markersFailed.length > 0) {
          failures.push({
            id: row.id,
            path: row.relative_path,
            errors: markersFailed
          });
          failed++;
          continue;
        }

        // Skip if no change
        if (cleaned === row.summary) {
          noChange++;
          continue;
        }

        // Check if cleaned summary is still usable
        if (!isUsableGemma4Summary(cleaned)) {
          failures.push({
            id: row.id,
            path: row.relative_path,
            error: 'Sanitized summary not usable (too short or low quality)'
          });
          failed++;
          continue;
        }

        // Apply change
        if (!dryRun) {
          await pool.query(
            `UPDATE codebase_chunk_index SET summary = $1, updated_at = NOW() WHERE id = $2`,
            [cleaned, row.id]
          );
        }

        updated++;
        if (updated % 100 === 0) {
          console.log(`  ✅ ${updated} updated...`);
        }
      }
    }

    // 3. Summary report
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`  RESULTS`);
    console.log(`${'═'.repeat(80)}`);
    console.log(`\nTotal processed: ${rows.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`No change needed: ${noChange}`);
    console.log(`Failed: ${failed}`);
    console.log(`Clean rate: ${Math.round((rows.length - failed) / rows.length * 100)}%`);

    if (failures.length > 0) {
      console.log(`\n⚠️ Failures:\n`);
      failures.slice(0, 10).forEach(f => {
        console.log(`   - ${f.path} (ID ${f.id}): ${f.error || f.errors?.[0]?.error}`);
      });
      if (failures.length > 10) {
        console.log(`   ... and ${failures.length - 10} more`);
      }
    }

    if (dryRun) {
      console.log(`\n📋 DRY RUN: No database changes made.`);
      console.log(`\nTo apply changes, run:`);
      console.log(`  npm run atlas:sanitize:apply:hardened -- --all`);
    } else {
      console.log(`\n✅ Applied to database.`);
    }

    process.exit(failed > 0 ? 1 : 0);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
