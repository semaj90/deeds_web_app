#!/usr/bin/env node

import pg from 'pg';

const isVerbose = process.argv.includes('--verbose');
const log = (msg) => console.log(`[P1.4 Verify] ${msg}`);
const verbose = (msg) => isVerbose && console.log(`  ${msg}`);

async function getDb() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
  });
  return pool;
}

async function main() {
  const db = await getDb();

  try {
    log('Verifying error fix results...');

    // Load the initial audit report to compare
    const auditReportPath = 'docs/reports/error-audit-2026-06-25.md';
    let initialErrorCount = null;
    try {
      const fs = await import('fs/promises');
      const report = await fs.readFile(auditReportPath, 'utf-8');
      const match = report.match(/Total errors:\s*(\d+)/);
      if (match) {
        initialErrorCount = parseInt(match[1], 10);
      }
    } catch (err) {
      verbose(`Could not read initial audit report: ${err.message}`);
    }

    // Current error state
    const currentResult = await db.query(`
      SELECT
        COUNT(*) as total_errors,
        SUM(CASE WHEN resolved = false THEN 1 ELSE 0 END) as unresolved,
        SUM(CASE WHEN resolved = true THEN 1 ELSE 0 END) as resolved
      FROM error_logs
    `);

    const { total_errors, unresolved, resolved } = currentResult.rows[0];

    verbose(`Total errors in database: ${total_errors}`);
    verbose(`  Resolved: ${resolved}`);
    verbose(`  Unresolved: ${unresolved}`);

    // Check fix confidence (strategies with confidence >= 0.85)
    const confidenceResult = await db.query(`
      SELECT
        error_category,
        COUNT(*) as fixed_count,
        COUNT(CASE WHEN fix_strategy IS NOT NULL THEN 1 END) as with_strategy
      FROM error_logs
      WHERE resolved = true
      GROUP BY error_category
    `);

    let totalConfidence = 0;
    let totalFixed = 0;

    if (confidenceResult.rows.length > 0) {
      verbose('\nFix Confidence by Category:');
      for (const row of confidenceResult.rows) {
        const confidence = row.with_strategy / row.fixed_count;
        verbose(`  ${row.error_category}: ${(confidence * 100).toFixed(1)}% (${row.fixed_count} fixed)`);
        totalConfidence += confidence;
        totalFixed += row.fixed_count;
      }
    }

    const avgConfidence = totalFixed > 0 ? totalConfidence / confidenceResult.rows.length : 0;

    // Verification gates
    let allPass = true;

    log('\n=== Verification Gates ===');

    // Gate 1: Error count decreased by at least 10%
    let gate1Pass = true;
    if (initialErrorCount !== null && initialErrorCount > 0) {
      const reduction = ((initialErrorCount - unresolved) / initialErrorCount) * 100;
      gate1Pass = reduction >= 10;
      log(`Gate 1: Error reduction >= 10% ... ${gate1Pass ? '✓ PASS' : '✗ FAIL'} (${reduction.toFixed(1)}%)`);
      allPass = allPass && gate1Pass;
    } else {
      log(`Gate 1: Error reduction >= 10% ... ? SKIP (no baseline)`);
    }

    // Gate 2: No new errors in recent window
    const newErrorsResult = await db.query(`
      SELECT COUNT(*) as new_count
      FROM error_logs
      WHERE created_at > NOW() - INTERVAL '10 minutes'
    `);
    const newErrors = newErrorsResult.rows[0].new_count;
    const gate2Pass = newErrors <= 1;
    log(`Gate 2: No error spike ... ${gate2Pass ? '✓ PASS' : '✗ FAIL'} (${newErrors} new in 10min)`);
    allPass = allPass && gate2Pass;

    // Gate 3: Fix confidence > 0.80
    const gate3Pass = avgConfidence > 0.80;
    log(`Gate 3: Fix confidence > 0.80 ... ${gate3Pass ? '✓ PASS' : '✗ FAIL'} (${(avgConfidence * 100).toFixed(1)}%)`);
    allPass = allPass && gate3Pass;

    log('\n=== Summary ===');
    log(`Overall: ${allPass ? '✓ PASS' : '✗ FAIL'}`);
    log(`  Errors resolved: ${resolved}/${total_errors}`);
    log(`  Unresolved remaining: ${unresolved}`);
    log(`  Average fix confidence: ${(avgConfidence * 100).toFixed(1)}%`);

    process.exit(allPass ? 0 : 1);

  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
