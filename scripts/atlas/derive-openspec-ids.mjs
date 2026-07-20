#!/usr/bin/env node

/**
 * Derive OpenSpec IDs from domain_class
 *
 * Maps each domain_class to a stable openspec_id UUID.
 * Uses deterministic name-based UUID v5 to ensure consistency across runs.
 *
 * Input: 804 fanout labels from structured-lexical-fanout.json
 * Output: Backfill report + SQL statements
 *
 * Modes:
 *   --dry-run (default)   Show what would be inserted
 *   --apply               Actually update Postgres
 *   --limit N             Limit to first N files
 *   --report FILE         Save report to FILE (default: docs/reports/openspec-id-derivation.json)
 */

import pg from 'pg';
import { createHash } from 'crypto';
import { v5 as uuidv5 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

// Deterministic UUID v5 namespace for openspec IDs
const OPENSPEC_NAMESPACE = '550e8400-e29b-41d4-a716-446655440000';

// Domain class → OpenSpec ID mapping (stable across runs)
const DOMAIN_CLASS_TO_OPENSPEC = {
  'utility': uuidv5('openspec:utility', OPENSPEC_NAMESPACE),
  'core-logic': uuidv5('openspec:core-logic', OPENSPEC_NAMESPACE),
  'integration': uuidv5('openspec:integration', OPENSPEC_NAMESPACE),
  'ui-component': uuidv5('openspec:ui-component', OPENSPEC_NAMESPACE),
  'test-fixture': uuidv5('openspec:test-fixture', OPENSPEC_NAMESPACE),
  'documentation': uuidv5('openspec:documentation', OPENSPEC_NAMESPACE),
  'config': uuidv5('openspec:config', OPENSPEC_NAMESPACE),
  'script': uuidv5('openspec:script', OPENSPEC_NAMESPACE),
  'type-definition': uuidv5('openspec:type-definition', OPENSPEC_NAMESPACE),
  'unknown': uuidv5('openspec:unknown', OPENSPEC_NAMESPACE),
};

const args = {
  dryRun: !process.argv.includes('--apply'),
  apply: process.argv.includes('--apply'),
  limit: (() => {
    const argv = process.argv.slice(2);
    const eq = argv.find((a) => a.startsWith('--limit='));
    if (eq) return parseInt(eq.split('=')[1] || '999999', 10);
    const pos = argv.findIndex((a) => a === '--limit');
    return parseInt((pos >= 0 ? argv[pos + 1] : '999999') || '999999', 10);
  })(),
  report: (() => {
    const argv = process.argv.slice(2);
    const eq = argv.find((a) => a.startsWith('--report='));
    if (eq) return eq.split('=')[1];
    const pos = argv.findIndex((a) => a === '--report');
    return pos >= 0 ? argv[pos + 1] : 'docs/reports/openspec-id-derivation.json';
  })(),
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const log = {
  info: (msg) => console.log(`[openspec-id] ${msg}`),
  warn: (msg) => console.warn(`⚠️  [openspec-id] ${msg}`),
  error: (msg) => console.error(`❌ [openspec-id] ${msg}`),
  success: (msg) => console.log(`✅ [openspec-id] ${msg}`),
};

async function main() {
  const startTime = Date.now();
  const report = {
    status: 'UNKNOWN',
    mode: args.dryRun ? 'dry-run' : 'apply',
    startedAt: new Date().toISOString(),
    domainClassCounts: {},
    derivedMappings: {},
    stats: {
      filesProcessed: 0,
      filesWithOpenspecId: 0,
      filesAlreadyHaveId: 0,
      filesNewlyAssigned: 0,
      filesSkipped: 0,
      errors: [],
    },
    timing: {},
  };

  try {
    log.info(`Starting openspec ID derivation (mode: ${args.dryRun ? 'DRY-RUN' : 'APPLY'})...`);

    // Step 1: Load fanout data
    log.info('Loading structured-lexical-fanout data...');
    const fanoutPath = path.join(__dirname, '../../docs/reports/structured-lexical-fanout.json');

    if (!fs.existsSync(fanoutPath)) {
      throw new Error(`Fanout report not found at ${fanoutPath}`);
    }

    const fanoutData = JSON.parse(fs.readFileSync(fanoutPath, 'utf-8'));
    const files = fanoutData.files || [];

    report.stats.filesProcessed = Math.min(files.length, args.limit);
    log.info(`Loaded ${files.length} files (processing ${report.stats.filesProcessed})`);

    // Step 2: Analyze domain class distribution
    log.info('Analyzing domain class distribution...');
    for (const file of files.slice(0, args.limit)) {
      if (!file) continue;
      const domainClass = (file.domain_class && file.domain_class.trim()) || 'unknown';
      report.domainClassCounts[domainClass] = (report.domainClassCounts[domainClass] || 0) + 1;
    }

    // Process domain class counts, handling nulls gracefully
    const sortedCounts = Object.entries(report.domainClassCounts).sort((a, b) => b[1] - a[1]);
    sortedCounts.forEach(([dc, count]) => {
      const safeDc = (dc && dc.trim()) ? dc : 'unknown';
      report.derivedMappings[safeDc] = DOMAIN_CLASS_TO_OPENSPEC[safeDc] || DOMAIN_CLASS_TO_OPENSPEC['unknown'];
      log.info(`  ${safeDc}: ${count} files → ${report.derivedMappings[safeDc]}`);
    });

    // Step 3: Build update statements
    log.info('Building update statements...');
    const updates = [];

    for (const file of files.slice(0, args.limit)) {
      if (!file) continue;
      const domainClass = (file.domain_class && file.domain_class.trim()) || 'unknown';
      const openspecId = DOMAIN_CLASS_TO_OPENSPEC[domainClass] || DOMAIN_CLASS_TO_OPENSPEC['unknown'];
      const titleId = file.title_id;

      if (!titleId) {
        report.stats.filesSkipped++;
        continue;
      }

      updates.push({
        titleId,
        domainClass,
        openspecId,
      });
    }

    report.stats.filesNewlyAssigned = updates.length;
    log.info(`Prepared ${updates.length} update statements`);

    // Step 4: Preview (dry-run)
    if (args.dryRun) {
      log.info(`DRY-RUN: Would update ${updates.length} files`);
      if (updates.length > 0 && updates.length <= 5) {
        log.info('Sample updates:');
        updates.forEach((u, i) => {
          log.info(`  ${i + 1}. ${u.titleId} (${u.domainClass}) → ${u.openspecId}`);
        });
      }
      report.status = 'DRY_RUN_COMPLETE';
    } else {
      // Step 5: Apply updates to Postgres
      log.info('Applying updates to Postgres...');
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        for (const update of updates) {
          // Assuming there's a way to link title_id to a row in the database
          // This is a placeholder — adjust table/column names as needed
          await client.query(
            `UPDATE atlas_packets
             SET openspec_id = $1
             WHERE title_id = $2`,
            [update.openspecId, update.titleId]
          );
        }

        await client.query('COMMIT');
        report.stats.filesWithOpenspecId = updates.length;
        report.status = 'APPLY_COMPLETE';
        log.success(`Applied ${updates.length} updates to Postgres`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // Step 6: Generate report
    report.timing.elapsedMs = Date.now() - startTime;
    report.completedAt = new Date().toISOString();

    const reportDir = path.dirname(args.report);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    fs.writeFileSync(args.report, JSON.stringify(report, null, 2));
    log.success(`Report saved to ${args.report}`);

    // Summary
    log.info('');
    log.info('═'.repeat(60));
    log.info(`Status: ${report.status}`);
    log.info(`Mode: ${report.mode}`);
    log.info(`Files Processed: ${report.stats.filesProcessed}`);
    log.info(`Files Newly Assigned OpenSpec ID: ${report.stats.filesNewlyAssigned}`);
    log.info(`Elapsed Time: ${report.timing.elapsedMs}ms`);
    log.info('═'.repeat(60));

  } catch (err) {
    report.status = 'ERROR';
    report.stats.errors.push(err.message);
    log.error(err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
