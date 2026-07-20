#!/usr/bin/env node

/**
 * Derive GSD IDs from (file_purpose, app_criticality) pairs
 *
 * Maps each (purpose, criticality) combination to a stable gsd_id UUID.
 * Uses deterministic name-based UUID v5 to ensure consistency across runs.
 *
 * Input: 804 fanout labels from structured-lexical-fanout.json
 * Output: Backfill report + SQL statements
 *
 * Modes:
 *   --dry-run (default)   Show what would be inserted
 *   --apply               Actually update Postgres
 *   --limit N             Limit to first N files
 *   --report FILE         Save report to FILE (default: docs/reports/gsd-id-derivation.json)
 */

import pg from 'pg';
import { v5 as uuidv5 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

// Deterministic UUID v5 namespace for GSD IDs
const GSD_NAMESPACE = '550e8400-e29b-41d4-a716-446655440001';

// Purpose + Criticality → GSD ID mapping (stable across runs)
const PURPOSE_CRITICALITY_TO_GSD = {
  'core-logic:critical': uuidv5('gsd:core-logic:critical', GSD_NAMESPACE),
  'core-logic:high': uuidv5('gsd:core-logic:high', GSD_NAMESPACE),
  'core-logic:medium': uuidv5('gsd:core-logic:medium', GSD_NAMESPACE),
  'core-logic:low': uuidv5('gsd:core-logic:low', GSD_NAMESPACE),
  'ui-component:critical': uuidv5('gsd:ui-component:critical', GSD_NAMESPACE),
  'ui-component:high': uuidv5('gsd:ui-component:high', GSD_NAMESPACE),
  'ui-component:medium': uuidv5('gsd:ui-component:medium', GSD_NAMESPACE),
  'ui-component:low': uuidv5('gsd:ui-component:low', GSD_NAMESPACE),
  'integration:critical': uuidv5('gsd:integration:critical', GSD_NAMESPACE),
  'integration:high': uuidv5('gsd:integration:high', GSD_NAMESPACE),
  'integration:medium': uuidv5('gsd:integration:medium', GSD_NAMESPACE),
  'integration:low': uuidv5('gsd:integration:low', GSD_NAMESPACE),
  'utility:critical': uuidv5('gsd:utility:critical', GSD_NAMESPACE),
  'utility:high': uuidv5('gsd:utility:high', GSD_NAMESPACE),
  'utility:medium': uuidv5('gsd:utility:medium', GSD_NAMESPACE),
  'utility:low': uuidv5('gsd:utility:low', GSD_NAMESPACE),
  'test-fixture:critical': uuidv5('gsd:test-fixture:critical', GSD_NAMESPACE),
  'test-fixture:high': uuidv5('gsd:test-fixture:high', GSD_NAMESPACE),
  'test-fixture:medium': uuidv5('gsd:test-fixture:medium', GSD_NAMESPACE),
  'test-fixture:low': uuidv5('gsd:test-fixture:low', GSD_NAMESPACE),
  'documentation:critical': uuidv5('gsd:documentation:critical', GSD_NAMESPACE),
  'documentation:high': uuidv5('gsd:documentation:high', GSD_NAMESPACE),
  'documentation:medium': uuidv5('gsd:documentation:medium', GSD_NAMESPACE),
  'documentation:low': uuidv5('gsd:documentation:low', GSD_NAMESPACE),
  'config:critical': uuidv5('gsd:config:critical', GSD_NAMESPACE),
  'config:high': uuidv5('gsd:config:high', GSD_NAMESPACE),
  'config:medium': uuidv5('gsd:config:medium', GSD_NAMESPACE),
  'config:low': uuidv5('gsd:config:low', GSD_NAMESPACE),
  'script:critical': uuidv5('gsd:script:critical', GSD_NAMESPACE),
  'script:high': uuidv5('gsd:script:high', GSD_NAMESPACE),
  'script:medium': uuidv5('gsd:script:medium', GSD_NAMESPACE),
  'script:low': uuidv5('gsd:script:low', GSD_NAMESPACE),
  'type-definition:critical': uuidv5('gsd:type-definition:critical', GSD_NAMESPACE),
  'type-definition:high': uuidv5('gsd:type-definition:high', GSD_NAMESPACE),
  'type-definition:medium': uuidv5('gsd:type-definition:medium', GSD_NAMESPACE),
  'type-definition:low': uuidv5('gsd:type-definition:low', GSD_NAMESPACE),
  'unknown:unknown': uuidv5('gsd:unknown:unknown', GSD_NAMESPACE),
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
    return pos >= 0 ? argv[pos + 1] : 'docs/reports/gsd-id-derivation.json';
  })(),
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const log = {
  info: (msg) => console.log(`[gsd-id] ${msg}`),
  warn: (msg) => console.warn(`⚠️  [gsd-id] ${msg}`),
  error: (msg) => console.error(`❌ [gsd-id] ${msg}`),
  success: (msg) => console.log(`✅ [gsd-id] ${msg}`),
};

async function main() {
  const startTime = Date.now();
  const report = {
    status: 'UNKNOWN',
    mode: args.dryRun ? 'dry-run' : 'apply',
    startedAt: new Date().toISOString(),
    pairCounts: {},
    derivedMappings: {},
    stats: {
      filesProcessed: 0,
      filesWithGsdId: 0,
      filesAlreadyHaveId: 0,
      filesNewlyAssigned: 0,
      filesSkipped: 0,
      errors: [],
    },
    timing: {},
  };

  try {
    log.info(`Starting GSD ID derivation (mode: ${args.dryRun ? 'DRY-RUN' : 'APPLY'})...`);

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

    // Step 2: Analyze (purpose, criticality) distribution
    log.info('Analyzing (purpose, criticality) pair distribution...');
    for (const file of files.slice(0, args.limit)) {
      if (!file) continue;
      const purpose = (file.file_purpose && file.file_purpose.trim()) || 'unknown';
      const criticality = (file.app_criticality && file.app_criticality.trim()) || 'unknown';
      const pair = `${purpose}:${criticality}`;
      report.pairCounts[pair] = (report.pairCounts[pair] || 0) + 1;
    }

    // Sort pairs by count for readability
    const sortedPairs = Object.entries(report.pairCounts).sort((a, b) => b[1] - a[1]);
    sortedPairs.forEach(([pair, count]) => {
      const safePair = (pair && pair.trim()) ? pair : 'unknown:unknown';
      report.derivedMappings[safePair] =
        PURPOSE_CRITICALITY_TO_GSD[safePair] || PURPOSE_CRITICALITY_TO_GSD['unknown:unknown'];
      log.info(`  ${safePair}: ${count} files → ${report.derivedMappings[safePair]}`);
    });

    // Step 3: Build update statements
    log.info('Building update statements...');
    const updates = [];

    for (const file of files.slice(0, args.limit)) {
      if (!file) continue;
      const purpose = (file.file_purpose && file.file_purpose.trim()) || 'unknown';
      const criticality = (file.app_criticality && file.app_criticality.trim()) || 'unknown';
      const pair = `${purpose}:${criticality}`;
      const gsdId = PURPOSE_CRITICALITY_TO_GSD[pair] || PURPOSE_CRITICALITY_TO_GSD['unknown:unknown'];
      const titleId = file.title_id;

      if (!titleId) {
        report.stats.filesSkipped++;
        continue;
      }

      updates.push({
        titleId,
        pair,
        gsdId,
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
          log.info(`  ${i + 1}. ${u.titleId} (${u.pair}) → ${u.gsdId}`);
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
             SET gsd_id = $1
             WHERE title_id = $2`,
            [update.gsdId, update.titleId]
          );
        }

        await client.query('COMMIT');
        report.stats.filesWithGsdId = updates.length;
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
    log.info(`Files Newly Assigned GSD ID: ${report.stats.filesNewlyAssigned}`);
    log.info(`Unique Pairs: ${Object.keys(report.pairCounts).length}`);
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
