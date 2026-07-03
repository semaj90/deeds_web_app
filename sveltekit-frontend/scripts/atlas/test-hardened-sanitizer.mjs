#!/usr/bin/env node
/**
 * Hardened Sanitizer Test Suite
 *
 * Tests the new marker-by-marker sanitizer on real Postgres data
 * Generates detailed report of:
 *   - Before/after statistics
 *   - Each marker type: count, examples
 *   - Quality degradation (length, word count)
 *   - Failures (if any)
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import {
  sanitizeGemma4Summary,
  isUsableGemma4Summary,
  analyzeContamination
} from './lib/gemma4-summary-sanitizer.mjs';

const { Pool } = pg;

// Parse CLI args
const limit = parseInt(process.argv[2] || '100');
const includeFailures = process.argv.includes('--failures');
const dryRun = process.argv.includes('--dry-run');
const outputFile = process.argv.includes('--output')
  ? process.argv[process.argv.indexOf('--output') + 1]
  : null;

const pool = new Pool({
  host: process.env.DATABASE_HOST || '127.0.0.1',
  port: parseInt(process.env.DATABASE_PORT || '5434'),
  database: process.env.DATABASE_NAME || 'legal_ai_db',
  user: process.env.DATABASE_USER || 'legal_admin',
  password: process.env.DATABASE_PASSWORD || 'legal_admin',
  max: 5
});

const REPORT_DIR = './logs/sanitizer-reports';

/**
 * Initialize report directory
 */
function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}

/**
 * Query contaminated summaries from Postgres
 */
async function fetchContaminatedSummaries(limit) {
  console.log(`\n📊 Querying Postgres for contaminated summaries (limit ${limit})...`);

  const result = await pool.query(`
    SELECT
      id,
      summary,
      length(summary) as length_before,
      relative_path
    FROM codebase_chunk_index
    WHERE summary IS NOT NULL
      AND (
        summary LIKE '%<end_of_turn>%'
        OR summary LIKE '%<start_of_turn>%'
        OR summary LIKE '%<|%'
        OR summary LIKE '%<thinking>%'
        OR summary LIKE '%<bos>%'
        OR summary LIKE '%<eos>%'
      )
    ORDER BY id
    LIMIT $1
  `, [limit]);

  console.log(`✅ Found ${result.rows.length} contaminated summaries`);
  return result.rows;
}

/**
 * Test sanitizer on one summary
 */
function testSummary(row) {
  const contaminationBefore = analyzeContamination(row.summary);
  const { summary: cleaned, markersCleaned, markersFailed } = sanitizeGemma4Summary(row.summary);
  const contaminationAfter = analyzeContamination(cleaned);
  const usable = isUsableGemma4Summary(cleaned);

  return {
    id: row.id,
    relativePath: row.relative_path,
    before: {
      text: row.summary,
      length: row.summary.length,
      contamination: contaminationBefore
    },
    after: {
      text: cleaned,
      length: cleaned.length,
      contamination: contaminationAfter,
      usable
    },
    sanitization: {
      markersCleaned,
      markersFailed,
      lengthChange: cleaned.length - row.summary.length,
      percentChange: Math.round((cleaned.length - row.summary.length) / row.summary.length * 100)
    }
  };
}

/**
 * Generate markdown report
 */
function generateReport(results, totalBefore) {
  const timestamp = new Date().toISOString();
  const passed = results.filter(r => r.after.contamination.isClean).length;
  const failed = results.length - passed;

  // Aggregate markers
  const markerStats = {};
  results.forEach(r => {
    r.sanitization.markersCleaned.forEach(marker => {
      markerStats[marker] = (markerStats[marker] || 0) + 1;
    });
  });

  let md = `# Hardened Sanitizer Test Report\n\n`;
  md += `**Date**: ${timestamp}\n`;
  md += `**Test Size**: ${results.length} summaries\n`;
  md += `**Total Contaminated (DB)**: ${totalBefore}\n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Passed (fully clean after) | ${passed}/${results.length} (${Math.round(passed/results.length*100)}%) |\n`;
  md += `| Failed (still contaminated) | ${failed}/${results.length} |\n`;
  md += `| Avg length before | ${Math.round(results.reduce((s, r) => s + r.before.length, 0) / results.length)} chars |\n`;
  md += `| Avg length after | ${Math.round(results.reduce((s, r) => s + r.after.length, 0) / results.length)} chars |\n`;
  md += `| Avg % change | ${Math.round(results.reduce((s, r) => s + r.sanitization.percentChange, 0) / results.length)}% |\n\n`;

  md += `## Markers Cleaned\n\n`;
  md += `| Marker Type | Count | Examples |\n`;
  md += `|-------------|-------|----------|\n`;
  Object.entries(markerStats).sort((a, b) => b[1] - a[1]).forEach(([marker, count]) => {
    const examples = results
      .filter(r => r.sanitization.markersCleaned.includes(marker))
      .slice(0, 2)
      .map(r => `\`${r.before.text.slice(0, 50)}...\``)
      .join(', ');
    md += `| \`${marker}\` | ${count} | ${examples} |\n`;
  });

  md += `\n## Detailed Results\n\n`;

  results.forEach((result, idx) => {
    md += `### Test ${idx + 1}: ${result.relativePath}\n\n`;
    md += `**Before**:\n\`\`\`\n${result.before.text}\n\`\`\`\n\n`;
    md += `**After**:\n\`\`\`\n${result.after.text}\n\`\`\`\n\n`;
    md += `**Metrics**:\n`;
    md += `- Length: ${result.before.length} → ${result.after.length} (${result.sanitization.percentChange > 0 ? '+' : ''}${result.sanitization.percentChange}%)\n`;
    md += `- Usable: ${result.after.usable ? '✅ Yes' : '❌ No'}\n`;
    md += `- Markers removed: ${result.sanitization.markersCleaned.join(', ') || 'none'}\n`;
    if (result.after.contamination.totalMatches > 0) {
      md += `- ⚠️ Remaining contamination: ${result.after.contamination.contaminants.map(c => `${c.type} (${c.count})`).join(', ')}\n`;
    }
    md += '\n';
  });

  md += `## Conclusion\n\n`;
  if (failed === 0) {
    md += `✅ **All summaries successfully sanitized to 100% clean**\n\n`;
    md += `Ready to apply to production.\n`;
  } else {
    md += `⚠️ **${failed} summaries still have contamination**\n\n`;
    md += `Review remaining markers and adjust patterns.\n`;
  }

  return md;
}

/**
 * Main execution
 */
async function main() {
  ensureReportDir();

  console.log('\n' + '═'.repeat(80));
  console.log('  HARDENED SANITIZER TEST');
  console.log('═'.repeat(80));

  try {
    // 1. Count total contamination in database
    const countResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN summary LIKE '%<end_of_turn>%' THEN 1 END) as has_eot,
        COUNT(CASE WHEN summary LIKE '%<start_of_turn>%' THEN 1 END) as has_sot,
        COUNT(CASE WHEN summary LIKE '%<|%' THEN 1 END) as has_control,
        COUNT(CASE WHEN summary LIKE '%<thinking>%' THEN 1 END) as has_thinking
      FROM codebase_chunk_index WHERE summary IS NOT NULL
    `);

    const { total, has_eot, has_sot, has_control, has_thinking } = countResult.rows[0];
    console.log(`\n📈 Database Summary (all summaries):`);
    console.log(`   Total: ${total}`);
    console.log(`   <end_of_turn>: ${has_eot}`);
    console.log(`   <start_of_turn>: ${has_sot}`);
    console.log(`   <|...| tokens: ${has_control}`);
    console.log(`   <thinking>: ${has_thinking}`);

    // 2. Fetch contaminated samples
    const samples = await fetchContaminatedSummaries(limit);

    if (samples.length === 0) {
      console.log('\n✅ No contaminated summaries found! Database is clean.');
      process.exit(0);
    }

    // 3. Test sanitizer on each
    console.log(`\n🧪 Testing sanitizer on ${samples.length} samples...`);
    const results = [];
    for (const sample of samples) {
      const result = testSummary(sample);
      results.push(result);
    }

    // 4. Generate report
    console.log(`\n📝 Generating report...`);
    const report = generateReport(results, total);

    // 5. Save report
    const reportPath = path.join(REPORT_DIR, `sanitizer-test-${Date.now()}.md`);
    fs.writeFileSync(reportPath, report);
    console.log(`\n✅ Report saved: ${reportPath}`);

    // 6. Print summary to console
    console.log('\n' + '═'.repeat(80));
    console.log(report.split('\n').slice(0, 30).join('\n'));
    console.log('...');
    console.log('═'.repeat(80));

    // 7. If --apply, update database (DRY RUN only for now)
    if (!dryRun && results.every(r => r.after.contamination.isClean)) {
      console.log(`\n💾 Ready to apply to production.`);
      console.log(`   Command: npm run atlas:sanitize:apply:hardened -- --all`);
    } else if (dryRun) {
      console.log(`\n📋 DRY RUN mode: no database changes made.`);
    } else {
      console.log(`\n⚠️ Not applying: ${results.filter(r => !r.after.contamination.isClean).length} summaries still contaminated.`);
    }

  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
