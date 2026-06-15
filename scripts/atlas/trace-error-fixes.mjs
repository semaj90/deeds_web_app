#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

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

const { loadedFiles } = loadAtlasEnv(REPO_ROOT);
console.log(`[ATLAS:ERROR:TRACE] Loaded env from: ${loadedFiles.join(', ') || '(none)'}`);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30000,
  idleTimeoutMillis: 5000,
  max: 2,
});

const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const TIMESTAMP = new Date().toISOString().split('T')[0];
const REPORT_JSON = path.join(REPORT_DIR, `error-trace-${TIMESTAMP}.json`);
const REPORT_MD = path.join(REPORT_DIR, `error-trace-${TIMESTAMP}.md`);

fs.mkdirSync(REPORT_DIR, { recursive: true });

async function runTrace() {
  console.log('[ATLAS:ERROR:TRACE] Starting error attribution analysis...\n');

  const client = await pool.connect();

  try {
    // Error distribution by category
    const byCategory = await client.query(`
      SELECT
        error_category,
        COUNT(*) as count,
        COUNT(CASE WHEN fixed_at IS NOT NULL THEN 1 END) as fixed_count,
        ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM error_logs), 1) as percentage,
        MIN(created_at) as first_seen,
        MAX(created_at) as last_seen
      FROM error_logs
      GROUP BY error_category
      ORDER BY count DESC
    `);

    // Error distribution by route
    const byRoute = await client.query(`
      SELECT
        route_path,
        COUNT(*) as count,
        COUNT(DISTINCT error_category) as unique_categories,
        MIN(created_at) as first_seen,
        MAX(created_at) as last_seen
      FROM error_logs
      WHERE route_path IS NOT NULL
      GROUP BY route_path
      ORDER BY count DESC
      LIMIT 20
    `);

    // Error distribution by severity
    const bySeverity = await client.query(`
      SELECT
        severity,
        COUNT(*) as count,
        COUNT(CASE WHEN fixed_at IS NOT NULL THEN 1 END) as fixed_count,
        ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM error_logs), 1) as percentage
      FROM error_logs
      GROUP BY severity
      ORDER BY count DESC
    `);

    // Root cause analysis: most common error messages
    const topErrors = await client.query(`
      SELECT
        error_category,
        message,
        COUNT(*) as frequency,
        COUNT(CASE WHEN fixed_at IS NOT NULL THEN 1 END) as fixed_count
      FROM error_logs
      GROUP BY error_category, message
      ORDER BY frequency DESC
      LIMIT 15
    `);

    const result = {
      status: 'pass',
      summary: {
        total_errors: byCategory.rows.reduce((sum, row) => sum + row.count, 0),
        total_categories: byCategory.rows.length,
        fixed_count: byCategory.rows.reduce((sum, row) => sum + row.fixed_count, 0),
        routes_with_errors: byRoute.rows.length,
        severity_levels: bySeverity.rows.length
      },
      by_category: byCategory.rows.slice(0, 15),
      by_route: byRoute.rows.slice(0, 10),
      by_severity: bySeverity.rows,
      top_errors: topErrors.rows.slice(0, 10),
      timestamp: new Date().toISOString(),
    };

    const totalFixed = result.summary.fixed_count;
    const totalErrors = result.summary.total_errors;
    const fixRate = totalErrors > 0 ? ((totalFixed / totalErrors) * 100).toFixed(1) : 0;

    fs.writeFileSync(REPORT_JSON, JSON.stringify(result, null, 2));
    console.log(`[ATLAS:ERROR:TRACE] Analysis complete:`);
    console.log(`  Total errors: ${totalErrors}`);
    console.log(`  Fixed: ${totalFixed} (${fixRate}%)`);
    console.log(`  Categories: ${result.summary.total_categories}`);
    console.log(`  Routes affected: ${result.summary.routes_with_errors}`);

    // Write markdown report
    const mdReport = `# P1.5: Error Trace Report

**Date**: ${new Date().toISOString()}
**Status**: ✅ PASS

## Summary

| Metric | Value |
|--------|-------|
| Total errors | ${totalErrors} |
| Fixed | ${totalFixed} (${fixRate}%) |
| Categories | ${result.summary.total_categories} |
| Routes affected | ${result.summary.routes_with_errors} |

## Errors by Category (Top 10)

${byCategory.rows.slice(0, 10).map(row => `
- **${row.error_category}**: ${row.count} (${row.percentage}%) — Fixed: ${row.fixed_count}
`).join('\n')}

## Errors by Severity

${bySeverity.rows.map(row => `
- **${row.severity}**: ${row.count} (${row.percentage}%) — Fixed: ${row.fixed_count}
`).join('\n')}

## Most Common Errors

${topErrors.rows.slice(0, 10).map(row => `
- **${row.error_category}**: "${row.message}" (${row.frequency}×, fixed ${row.fixed_count}×)
`).join('\n')}

## Routes with Most Errors

${byRoute.rows.slice(0, 10).map(row => `
- **${row.route_path}**: ${row.count} errors across ${row.unique_categories} categories
`).join('\n')}

## Key Insights

1. **Top category**: ${byCategory.rows[0]?.error_category || 'N/A'} (${byCategory.rows[0]?.count || 0} errors)
2. **Most affected route**: ${byRoute.rows[0]?.route_path || 'N/A'} (${byRoute.rows[0]?.count || 0} errors)
3. **Severity distribution**:
${bySeverity.rows.map(r => `   - ${r.severity}: ${r.count} (${r.percentage}%)`).join('\n')}

## Attribution Summary

- Errors concentrated in: ${result.summary.routes_with_errors} API routes
- Fix coverage: ${fixRate}% of errors fixed
- Systematic issue: ${byCategory.rows[0]?.error_category} accounts for ${byCategory.rows[0]?.percentage}% of all errors

## Next Steps

1. ✅ Error attribution complete
2. Review systematic issues (highest-count categories)
3. Consider preventive measures for top error sources
4. Handoff to P2 (Rust parser) with error analysis

`;

    fs.writeFileSync(REPORT_MD, mdReport);
    console.log(`[ATLAS:ERROR:TRACE] ✅ PASS`);
    console.log(`[ATLAS:ERROR:TRACE] Report: ${REPORT_JSON}`);

    return result;
  } finally {
    client.release();
    await pool.end();
  }
}

try {
  const result = await runTrace();
  process.exit(result.status === 'pass' ? 0 : 1);
} catch (err) {
  console.error('[ATLAS:ERROR:TRACE] Fatal error:', err.message);
  process.exit(2);
}
