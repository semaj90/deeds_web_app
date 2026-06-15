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
console.log(`[ATLAS:ERROR:PLAN] Loaded env from: ${loadedFiles.join(', ') || '(none)'}`);

// Parse CLI flags
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
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
const REPORT_JSON = path.join(REPORT_DIR, `error-plan-${TIMESTAMP}.json`);
const REPORT_MD = path.join(REPORT_DIR, `error-plan-${TIMESTAMP}.md`);

// Ensure report directory exists
fs.mkdirSync(REPORT_DIR, { recursive: true });

/**
 * P1.2: Error Planning
 *
 * Generates a prioritized error fixing plan based on P1.1 audit findings.
 * Categorizes errors by fixability, severity, and frequency.
 */
async function runPlan() {
  console.log('[ATLAS:ERROR:PLAN] Starting error plan generation...\n');

  const client = await pool.connect();

  try {
    // Get error summary by category
    const summary = await client.query(`
      SELECT
        error_category,
        severity,
        COUNT(*) as count,
        COUNT(CASE WHEN fixed_at IS NOT NULL THEN 1 END) as fixed_count,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM error_logs
      WHERE resolved = false
      GROUP BY error_category, severity
      ORDER BY count DESC
    `);

    if (summary.rows.length === 0) {
      console.log('[ATLAS:ERROR:PLAN] ℹ️  No errors to plan (empty error_logs table)');

      const result = {
        status: 'pass',
        summary: {
          total_errors: 0,
          error_categories: 0,
          plan_items: [],
          notes: 'P1 error collection not yet active — no errors to plan'
        },
        plan: [],
        timestamp: new Date().toISOString(),
      };

      fs.writeFileSync(REPORT_JSON, JSON.stringify(result, null, 2));
      console.log(`\n[ATLAS:ERROR:PLAN] Report: ${REPORT_JSON}`);

      const mdReport = `# P1.2: Error Plan Report

**Date**: ${new Date().toISOString()}
**Status**: ✅ PASS (no errors yet)

## Summary

- Total errors: 0
- Categories: 0
- Plan items: 0

## Interpretation

P1 error collection is not yet active. Once errors are populated in the error_logs table, P1.2 will generate a prioritized fix plan.

## Next Steps

1. Wire error collection into key API routes
2. Collect errors for 1-2 days
3. Run P1.1 (error audit) to categorize errors
4. Re-run P1.2 (error plan) to generate fix plan
5. Execute P1.3 (error apply) per the plan
`;

      fs.writeFileSync(REPORT_MD, mdReport);
      console.log(`[ATLAS:ERROR:PLAN] Markdown report: ${REPORT_MD}`);

      return result;
    }

    console.log(`[ATLAS:ERROR:PLAN] Found ${summary.rows.length} error categories`);

    // Categorize errors by fixer strategy
    const plan = [];

    for (const row of summary.rows) {
      const { error_category, severity, count, fixed_count, oldest, newest } = row;

      // Determine fixer strategy
      let fixer_type = 'manual';
      let estimated_effort = 30; // minutes
      let confidence = 0.5;

      // Pattern fixers (high confidence)
      if (error_category.includes('type_mismatch')) {
        fixer_type = 'ast';
        estimated_effort = 15;
        confidence = 0.75;
      } else if (error_category.includes('missing_field')) {
        fixer_type = 'pattern';
        estimated_effort = 10;
        confidence = 0.85;
      } else if (error_category.includes('identity_error')) {
        fixer_type = 'semantic';
        estimated_effort = 20;
        confidence = 0.8;
      }

      // Severity multiplier for effort
      const severity_multiplier = {
        'CRITICAL': 2.0,
        'ERROR': 1.5,
        'WARNING': 1.0,
        'INFO': 0.5
      }[severity] || 1.0;

      estimated_effort = Math.round(estimated_effort * severity_multiplier);

      // Impact score (frequency × severity)
      const severity_score = {
        'CRITICAL': 4,
        'ERROR': 3,
        'WARNING': 2,
        'INFO': 1
      }[severity] || 0;

      const impact_score = count * severity_score;
      const effort_score = estimated_effort;
      const roi = impact_score / Math.max(effort_score, 1); // Higher is better

      plan.push({
        error_category,
        severity,
        occurrence_count: count,
        fixed_count: fixed_count,
        fixer_type,
        estimated_effort_minutes: estimated_effort,
        confidence: confidence,
        impact_score: impact_score,
        roi_rank: roi,
        date_range: {
          oldest: oldest,
          newest: newest
        }
      });
    }

    // Sort by ROI (return on investment)
    plan.sort((a, b) => b.roi_rank - a.roi_rank);

    const result = {
      status: 'pass',
      summary: {
        total_errors: summary.rows.reduce((sum, row) => sum + row.count, 0),
        error_categories: summary.rows.length,
        plan_items: plan.length,
        total_effort_minutes: plan.reduce((sum, item) => sum + item.estimated_effort_minutes, 0),
        estimated_completion_hours: Math.round(plan.reduce((sum, item) => sum + item.estimated_effort_minutes, 0) / 60)
      },
      plan: plan.slice(0, 20), // Top 20 fixes
      timestamp: new Date().toISOString(),
    };

    console.log(`\n[ATLAS:ERROR:PLAN] Plan generated: ${plan.length} fixes`);
    console.log(`[ATLAS:ERROR:PLAN] Estimated effort: ${result.summary.estimated_completion_hours} hours`);

    // Write reports
    fs.writeFileSync(REPORT_JSON, JSON.stringify(result, null, 2));
    console.log(`\n[ATLAS:ERROR:PLAN] Report: ${REPORT_JSON}`);

    // Write markdown report
    const mdReport = `# P1.2: Error Plan Report

**Date**: ${new Date().toISOString()}
**Status**: ✅ PASS

## Summary

- Total errors: ${result.summary.total_errors}
- Categories: ${result.summary.error_categories}
- Planned fixes: ${result.summary.plan_items}
- Estimated effort: ${result.summary.estimated_completion_hours} hours

## Plan (Ranked by ROI)

${plan.slice(0, 10).map((item, i) => `
### ${i + 1}. ${item.error_category} (${item.severity})

| Property | Value |
|----------|-------|
| Occurrences | ${item.occurrence_count} |
| Fixed | ${item.fixed_count} |
| Fixer Type | ${item.fixer_type} |
| Confidence | ${(item.confidence * 100).toFixed(0)}% |
| Effort | ${item.estimated_effort_minutes} min |
| Impact Score | ${item.impact_score} |
| ROI Rank | ${item.roi_rank.toFixed(2)} |
`).join('\n')}

## Next Steps

1. **P1.3 (Apply)**: Execute fixes per the plan
   - Start with top ROI items
   - Use appropriate fixer type (pattern/ast/semantic/manual)
   - Run in dry-run mode first

2. **P1.4 (Verify)**: Validate fixes
   - Confirm error counts decreased
   - Check for regressions
   - Measure confidence >0.85

3. **P1.5 (Trace)**: Attribution
   - Link fixed errors to root causes
   - Identify systematic issues

## Execution

Start with the top 5 fixes (highest ROI):
\`\`\`bash
npm run atlas:error:apply --category "${plan[0]?.error_category}" --dry-run
npm run atlas:error:apply --category "${plan[0]?.error_category}" --apply
npm run atlas:error:verify
\`\`\`
`;

    fs.writeFileSync(REPORT_MD, mdReport);
    console.log(`[ATLAS:ERROR:PLAN] Markdown report: ${REPORT_MD}`);

    return result;
  } finally {
    client.release();
    await pool.end();
  }
}

// Execute
try {
  const result = await runPlan();
  process.exit(result.status === 'pass' ? 0 : 1);
} catch (err) {
  console.error('[ATLAS:ERROR:PLAN] Fatal error:', err.message);
  process.exit(2);
}
