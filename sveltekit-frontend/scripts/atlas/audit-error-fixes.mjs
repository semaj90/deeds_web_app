#!/usr/bin/env node
/**
 * P1.1: Error Audit Script
 *
 * Read-only audit of error logs in Postgres.
 * Categorizes errors by type, severity, frequency.
 * Generates structured findings for P1.2 (planning).
 *
 * Usage:
 *   node scripts/atlas/audit-error-fixes.mjs [--verbose] [--output=path]
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const VERBOSE = process.argv.includes('--verbose');
const OUTPUT_ARG = process.argv.find(a => a.startsWith('--output='))?.split('=')[1];
const OUTPUT_DIR = OUTPUT_ARG || path.join(ROOT, 'docs', 'reports');

// ── Utilities ──────────────────────────────────────────────────────

function log(msg, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = { info: '✓', warn: '⚠', error: '✗', debug: '◆' }[level] || '•';
  if (level !== 'debug' || VERBOSE) {
    console.log(`[${timestamp}] ${prefix} ${msg}`);
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ── Database Connection ────────────────────────────────────────────

async function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL env var not set');
  }

  const pool = new pg.Pool({ connectionString });

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return pool;
  } catch (err) {
    log(`Connection failed: ${err.message}`, 'error');
    throw err;
  }
}

// ── Audit Logic ────────────────────────────────────────────────────

async function auditErrors(pool) {
  log('Starting error audit...');

  const tableCheck = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'error_logs' AND table_schema = 'public'
    )
  `);

  if (!tableCheck.rows[0].exists) {
    log('error_logs table does not exist', 'warn');
    return {
      timestamp: new Date().toISOString(),
      table_exists: false,
      total_errors: 0,
      by_category: {},
      by_severity: {},
      by_route: {},
      unresolved_count: 0,
      critical_count: 0,
      recommendations: ['Create error_logs table via migration', 'Wire error collection into API routes']
    };
  }

  const countRes = await pool.query('SELECT COUNT(*) as count FROM error_logs');
  const totalErrors = parseInt(countRes.rows[0].count, 10);

  log(`Found ${totalErrors} total errors in error_logs`);

  if (totalErrors === 0) {
    return {
      timestamp: new Date().toISOString(),
      table_exists: true,
      total_errors: 0,
      by_category: {},
      by_severity: {},
      by_route: {},
      unresolved_count: 0,
      critical_count: 0,
      recommendations: ['No errors logged yet', 'Verify error collection is wired into API routes']
    };
  }

  const byCategory = await pool.query(`
    SELECT error_category, COUNT(*) as count,
           MIN(created_at) as first_seen,
           MAX(created_at) as last_seen,
           ARRAY_AGG(DISTINCT severity) as severities
    FROM error_logs
    GROUP BY error_category
    ORDER BY count DESC
  `);

  const categoryMap = {};
  byCategory.rows.forEach(row => {
    categoryMap[row.error_category] = {
      count: row.count,
      first_seen: row.first_seen,
      last_seen: row.last_seen,
      severities: row.severities
    };
  });

  const bySeverity = await pool.query(`
    SELECT severity, COUNT(*) as count
    FROM error_logs
    GROUP BY severity
    ORDER BY CASE severity
      WHEN 'CRITICAL' THEN 0 WHEN 'ERROR' THEN 1 WHEN 'WARNING' THEN 2
      WHEN 'INFO' THEN 3 ELSE 4 END
  `);

  const severityMap = {};
  bySeverity.rows.forEach(row => {
    severityMap[row.severity] = row.count;
  });

  const byRoute = await pool.query(`
    SELECT route_path, COUNT(*) as count, ARRAY_AGG(DISTINCT error_category) as categories
    FROM error_logs
    WHERE route_path IS NOT NULL
    GROUP BY route_path
    ORDER BY count DESC
    LIMIT 20
  `);

  const routeMap = {};
  byRoute.rows.forEach(row => {
    routeMap[row.route_path] = { count: row.count, categories: row.categories };
  });

  const criticalCount = severityMap['CRITICAL'] || 0;
  const unresolvedRes = await pool.query(`SELECT COUNT(*) as count FROM error_logs WHERE resolved = false`);
  const unresolvedCount = parseInt(unresolvedRes.rows[0].count, 10);

  const recommendations = [];
  if (criticalCount > 0) {
    recommendations.push(`CRITICAL: ${criticalCount} critical errors need immediate attention`);
  }
  const topCategory = Object.entries(categoryMap).sort((a, b) => b[1].count - a[1].count)[0];
  if (topCategory && topCategory[1].count > 100) {
    recommendations.push(`HIGH VOLUME: ${topCategory[0]} has ${topCategory[1].count} occurrences`);
  }
  recommendations.push('Next: Run P1.2 (plan) to generate fix strategy');

  return {
    timestamp: new Date().toISOString(),
    table_exists: true,
    total_errors: totalErrors,
    by_category: categoryMap,
    by_severity: severityMap,
    by_route: routeMap,
    unresolved_count: unresolvedCount,
    critical_count: criticalCount,
    recommendations
  };
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  ensureDir(OUTPUT_DIR);

  log('═══════════════════════════════════════════════════════════════');
  log('       P1.1: ERROR AUDIT');
  log('═══════════════════════════════════════════════════════════════\n');

  let pool;
  try {
    pool = await getPool();
    log('Connected to Postgres');

    const findings = await auditErrors(pool);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const jsonPath = path.join(OUTPUT_DIR, `error-audit-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(findings, null, 2));
    log(`JSON report: ${jsonPath}`);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                      AUDIT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`Total Errors:     ${findings.total_errors}`);
    console.log(`Critical:         ${findings.critical_count}`);
    console.log(`Unresolved:       ${findings.unresolved_count}`);
    console.log(`Categories:       ${Object.keys(findings.by_category).length}`);
    console.log('Recommendations:');
    findings.recommendations.forEach(rec => {
      console.log(`  • ${rec}`);
    });
    console.log('\n═══════════════════════════════════════════════════════════════\n');

  } catch (err) {
    log(`Fatal error: ${err.message}`, 'error');
    if (VERBOSE) console.error(err);
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
