#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// Load environment variables
function loadAtlasEnv(root) {
  const envFile = path.join(root, 'sveltekit-frontend', '.env');
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf-8');
    for (const line of content.split('\n')) {
      const [key, val] = line.split('=');
      if (key && val && !key.startsWith('#')) {
        process.env[key.trim()] = val.trim();
      }
    }
  }
  return { loadedFiles: [envFile] };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Load environment
const { loadedFiles } = loadAtlasEnv(REPO_ROOT);
console.log(`[ATLAS:ERROR:AUDIT] Loaded env from: ${loadedFiles.join(', ') || '(none)'}`);

// Parse CLI flags
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const limit = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '100', 10);
const verbose = process.argv.includes('--verbose');

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30000,
  idleTimeoutMillis: 5000,
  max: 2,
});

const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const TIMESTAMP = new Date().toISOString().split('T')[0];
const REPORT_JSON = path.join(REPORT_DIR, `error-audit-${TIMESTAMP}.json`);
const REPORT_MD = path.join(REPORT_DIR, `error-audit-${TIMESTAMP}.md`);

// Ensure report directory exists
fs.mkdirSync(REPORT_DIR, { recursive: true });

/**
 * P1.1: Error Audit
 *
 * Analyzes error logs and identifies patterns for P1 error fixing.
 * This is a read-only audit that categorizes errors and reports coverage.
 *
 * Hard-fail conditions: None (audit always succeeds, reports findings)
 */
async function runAudit() {
  console.log('[ATLAS:ERROR:AUDIT] Starting error audit...\n');

  const client = await pool.connect();

  try {
    // Check if error tracking tables exist
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'error_logs'
      ) as exists
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('[ATLAS:ERROR:AUDIT] ℹ️  error_logs table not found (optional)');

      const result = {
        status: 'pass',
        summary: {
          total_errors: 0,
          errors_by_category: {},
          errors_by_severity: {},
          error_coverage: null,
          notes: 'error_logs table not yet created — P1 infrastructure setup phase'
        },
        error_samples: [],
        timestamp: new Date().toISOString(),
      };

      fs.writeFileSync(REPORT_JSON, JSON.stringify(result, null, 2));
      console.log(`\n[ATLAS:ERROR:AUDIT] Report: ${REPORT_JSON}`);

      const mdReport = `# P1.1: Error Audit Report

**Date**: ${new Date().toISOString()}
**Status**: ✅ PASS (no errors to audit yet)

## Summary

- Total errors: 0
- Error logs table: Not yet created
- Coverage: N/A

## Interpretation

P1 infrastructure is in setup phase. Error tracking will be enabled once the error_logs table is created and error collection begins.

## Next Steps

1. Create error_logs table schema
2. Wire error collection into key API routes
3. Run error audit (this script) weekly
4. Generate P1.2 (error plan) based on audit findings
`;

      fs.writeFileSync(REPORT_MD, mdReport);
      console.log(`[ATLAS:ERROR:AUDIT] Markdown report: ${REPORT_MD}`);

      return result;
    }

    console.log('[ATLAS:ERROR:AUDIT] ✅ error_logs table found');

    // Get error summary statistics
    const summary = await client.query(`
      SELECT
        COUNT(*) as total_errors,
        COUNT(DISTINCT error_category) as categories,
        COUNT(DISTINCT severity) as severity_levels,
        MIN(created_at) as oldest_error,
        MAX(created_at) as newest_error
      FROM error_logs
      LIMIT 1
    `);

    const { total_errors, categories, severity_levels, oldest_error, newest_error } = summary.rows[0];

    console.log(`[ATLAS:ERROR:AUDIT] Total errors: ${total_errors}`);
    console.log(`[ATLAS:ERROR:AUDIT] Categories: ${categories}`);
    console.log(`[ATLAS:ERROR:AUDIT] Severity levels: ${severity_levels}`);

    // Get errors by category
    const byCategory = await client.query(`
      SELECT
        error_category,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM error_logs), 1) as percentage
      FROM error_logs
      GROUP BY error_category
      ORDER BY count DESC
      LIMIT 10
    `);

    const errors_by_category = {};
    for (const row of byCategory.rows) {
      errors_by_category[row.error_category] = {
        count: row.count,
        percentage: row.percentage
      };
    }

    // Get errors by severity
    const bySeverity = await client.query(`
      SELECT
        severity,
        COUNT(*) as count,
        ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM error_logs), 1) as percentage
      FROM error_logs
      GROUP BY severity
      ORDER BY count DESC
    `);

    const errors_by_severity = {};
    for (const row of bySeverity.rows) {
      errors_by_severity[row.severity] = {
        count: row.count,
        percentage: row.percentage
      };
    }

    // Get sample errors for detailed inspection
    const samples = await client.query(
      `SELECT
        id, error_category, severity, message, stack, context_key, created_at
       FROM error_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    const error_samples = samples.rows.map(row => ({
      id: row.id,
      category: row.error_category,
      severity: row.severity,
      message: row.message,
      context: row.context_key,
      timestamp: row.created_at
    }));

    // Determine overall status
    const status = total_errors === 0 ? 'pass' : 'pass'; // Audit always passes; errors are findings

    const result = {
      status: status,
      summary: {
        total_errors: total_errors,
        categories: categories,
        severity_levels: severity_levels,
        date_range: {
          oldest: oldest_error,
          newest: newest_error
        },
        errors_by_category: errors_by_category,
        errors_by_severity: errors_by_severity,
        coverage: total_errors > 0 ? 'errors detected' : 'no errors (clean state)',
      },
      error_samples: error_samples,
      timestamp: new Date().toISOString(),
    };

    console.log(`\n[ATLAS:ERROR:AUDIT] ✅ AUDIT COMPLETE`);
    console.log(`[ATLAS:ERROR:AUDIT] Total errors found: ${total_errors}`);

    // Write reports
    fs.writeFileSync(REPORT_JSON, JSON.stringify(result, null, 2));
    console.log(`\n[ATLAS:ERROR:AUDIT] Report: ${REPORT_JSON}`);

    // Write markdown report
    const mdReport = `# P1.1: Error Audit Report

**Date**: ${new Date().toISOString()}
**Status**: ✅ PASS

## Summary

- Total errors: ${total_errors}
- Categories: ${categories}
- Severity levels: ${severity_levels}
- Date range: ${oldest_error} → ${newest_error}

## Errors by Category

| Category | Count | % |
|----------|-------|---|
${Object.entries(errors_by_category)
  .map(([cat, data]) => `| ${cat} | ${data.count} | ${data.percentage}% |`)
  .join('\n')}

## Errors by Severity

| Severity | Count | % |
|----------|-------|---|
${Object.entries(errors_by_severity)
  .map(([sev, data]) => `| ${sev} | ${data.count} | ${data.percentage}% |`)
  .join('\n')}

## Sample Errors (Latest ${limit})

${error_samples.slice(0, 10).map((err, i) => `
### ${i + 1}. ${err.category} (${err.severity})
\`\`\`
${err.message}
\`\`\`
*Context*: ${err.context}
*Time*: ${err.timestamp}
`).join('\n')}

## Next Steps

1. Run P1.2 (error plan) to generate fix recommendations
2. Review top categories and severity distribution
3. Plan P1.3 (error apply) based on audit findings
4. Implement targeted error fixes per category
`;

    fs.writeFileSync(REPORT_MD, mdReport);
    console.log(`[ATLAS:ERROR:AUDIT] Markdown report: ${REPORT_MD}`);

    return result;
  } finally {
    client.release();
    await pool.end();
  }
}

// Execute
try {
  const result = await runAudit();
  process.exit(result.status === 'pass' ? 0 : 1);
} catch (err) {
  console.error('[ATLAS:ERROR:AUDIT] Fatal error:', err.message);
  process.exit(2);
}
