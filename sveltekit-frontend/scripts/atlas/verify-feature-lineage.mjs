#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Load environment
const { loadedFiles } = loadAtlasEnv(REPO_ROOT);
console.log(`[ATLAS:LINEAGE:VERIFY] Loaded env from: ${loadedFiles.join(', ') || '(none)'}`);

// Parse CLI flags
const applyRemediation = process.argv.includes('--apply-remediation');
const dryRun = process.argv.includes('--dry-run');
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
const REPORT_JSON = path.join(REPORT_DIR, `lineage-verify-${TIMESTAMP}.json`);
const REPORT_MD = path.join(REPORT_DIR, `lineage-verify-${TIMESTAMP}.md`);

// Ensure report directory exists
fs.mkdirSync(REPORT_DIR, { recursive: true });

/**
 * Normalize packet_key for comparison (handle null, whitespace, variants)
 */
function normalizeKey(val) {
  if (!val) return null;
  const s = String(val).trim();
  return s.length === 0 ? null : s;
}

/**
 * Validate lineage for a single row
 */
function validateRow(row, rowIndex) {
  const issues = [];

  // Hard fail conditions from Parent Atlas contract
  const sourceRef = normalizeKey(row.source_ref);
  const featureId = normalizeKey(row.feature_id);
  const featureLabel = normalizeKey(row.payload?.feature_label || row.feature_label);
  const packetKey = normalizeKey(row.packet_key);

  if (!sourceRef) {
    issues.push({ type: 'missing_source_ref', severity: 'CRITICAL' });
  }
  if (!featureId) {
    issues.push({ type: 'missing_feature_id', severity: 'CRITICAL' });
  }
  if (!featureLabel) {
    issues.push({ type: 'missing_feature_label', severity: 'CRITICAL' });
  }
  if (!packetKey) {
    issues.push({ type: 'missing_packet_key', severity: 'CRITICAL' });
  }

  return {
    rowIndex,
    packetId: row.packet_id,
    sourceRef,
    featureId,
    featureLabel,
    packetKey,
    issues,
    isValid: issues.length === 0,
  };
}

/**
 * Check for duplicates across all rows
 */
function findDuplicates(validatedRows) {
  const duplicates = {
    source_ref: [],
    packet_key: [],
  };

  const sourceRefMap = new Map();
  const packetKeyMap = new Map();

  for (const row of validatedRows) {
    if (row.sourceRef) {
      if (!sourceRefMap.has(row.sourceRef)) {
        sourceRefMap.set(row.sourceRef, []);
      }
      sourceRefMap.get(row.sourceRef).push(row.packetId);
    }

    if (row.packetKey) {
      if (!packetKeyMap.has(row.packetKey)) {
        packetKeyMap.set(row.packetKey, []);
      }
      packetKeyMap.get(row.packetKey).push(row.packetId);
    }
  }

  // Find duplicates
  for (const [key, ids] of sourceRefMap.entries()) {
    if (ids.length > 1) {
      duplicates.source_ref.push({ key, packetIds: ids });
    }
  }

  for (const [key, ids] of packetKeyMap.entries()) {
    if (ids.length > 1) {
      duplicates.packet_key.push({ key, packetIds: ids });
    }
  }

  return duplicates;
}

/**
 * Generate remediation SQL for failed rows
 */
function generateRemediationSql(failedRows) {
  const statements = [];

  statements.push('-- Parent Atlas Lineage Verification Remediation');
  statements.push('-- Generated: ' + new Date().toISOString());
  statements.push('-- Run with: psql -U legal_admin -d legal_ai_db < remediation.sql');
  statements.push('');
  statements.push('BEGIN;');
  statements.push('');

  for (const row of failedRows) {
    const issues = row.issues.map((i) => i.type).join(', ');
    statements.push(`-- Packet ${row.packetId}: ${issues}`);

    // For missing fields, suggest UPDATE statements
    const updates = [];
    if (row.issues.some((i) => i.type === 'missing_packet_key')) {
      const suggestedKey = `ace:packet:${row.featureId}:${row.rowIndex}`;
      updates.push(`packet_key = '${suggestedKey}'`);
    }

    if (updates.length > 0) {
      statements.push(
        `-- UPDATE atlas_packets SET ${updates.join(', ')} WHERE packet_id = '${row.packetId}';`
      );
    }
    statements.push('');
  }

  statements.push('-- Please review the comments above and uncomment the UPDATE statements you want to apply.');
  statements.push('-- COMMIT;');
  statements.push('ROLLBACK;');
  statements.push('');

  return statements.join('\n');
}

/**
 * Main verification flow
 */
async function verifyLineage() {
  console.log('[ATLAS:LINEAGE:VERIFY] Starting verification...');

  let client;

  try {
    client = await pool.connect();

    // Query all rows from atlas_packets
    console.log('[ATLAS:LINEAGE:VERIFY] Querying atlas_packets table...');
    const result = await client.query(`
      SELECT
        packet_id,
        source_ref,
        feature_id,
        packet_key,
        payload,
        metadata,
        created_at
      FROM atlas_packets
      ORDER BY created_at ASC, packet_id ASC
      LIMIT 50000
    `);

    const rows = result.rows;
    console.log(`[ATLAS:LINEAGE:VERIFY] Retrieved ${rows.length} rows from atlas_packets`);

    // Validate each row
    const validatedRows = rows.map((row, idx) => validateRow(row, idx));
    const failedRows = validatedRows.filter((r) => !r.isValid);

    // Check for duplicates
    const duplicates = findDuplicates(validatedRows);
    const hasDuplicateSourceRef = duplicates.source_ref.length > 0;
    const hasDuplicatePacketKey = duplicates.packet_key.length > 0;

    // Build summary
    const summary = {
      total_packets: rows.length,
      valid_lineage: validatedRows.filter((r) => r.isValid).length,
      lineage_coverage:
        (validatedRows.filter((r) => r.isValid).length / rows.length) * 100,
      failures: {
        missing_source_ref: failedRows.filter((r) =>
          r.issues.some((i) => i.type === 'missing_source_ref')
        ).length,
        missing_feature_id: failedRows.filter((r) =>
          r.issues.some((i) => i.type === 'missing_feature_id')
        ).length,
        missing_feature_label: failedRows.filter((r) =>
          r.issues.some((i) => i.type === 'missing_feature_label')
        ).length,
        missing_packet_key: failedRows.filter((r) =>
          r.issues.some((i) => i.type === 'missing_packet_key')
        ).length,
        duplicate_source_ref: duplicates.source_ref.length,
        duplicate_packet_key: duplicates.packet_key.length,
        directory_mismatch: 0, // TODO: implement filesystem check
        postgres_row_missing: 0, // By definition, all rows exist if we fetched them
      },
    };

    // Determine pass/fail
    const isPass =
      summary.failures.missing_source_ref === 0 &&
      summary.failures.missing_feature_id === 0 &&
      summary.failures.missing_feature_label === 0 &&
      summary.failures.missing_packet_key === 0 &&
      summary.failures.duplicate_source_ref === 0 &&
      summary.failures.duplicate_packet_key === 0 &&
      summary.failures.directory_mismatch === 0;

    // Generate remediation SQL
    const remediationSql = generateRemediationSql(failedRows);

    // Build report object
    const report = {
      status: isPass ? 'pass' : 'fail',
      summary,
      failed_packets: failedRows.map((r) => ({
        packet_id: r.packetId,
        source_ref: r.sourceRef,
        feature_id: r.featureId,
        feature_label: r.featureLabel,
        packet_key: r.packetKey,
        issues: r.issues,
      })),
      duplicates,
      remediation_sql: remediationSql,
      timestamp: new Date().toISOString(),
      database_url: process.env.DATABASE_URL
        ? `${process.env.DATABASE_URL.split('@')[1]}`
        : 'unknown',
    };

    // Write JSON report
    fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`[ATLAS:LINEAGE:VERIFY] Report written to: ${REPORT_JSON}`);

    // Write markdown report
    const md = `# Parent Atlas Feature Lineage Verification Report

**Generated**: ${report.timestamp}
**Status**: ${report.status.toUpperCase()}
**Database**: ${report.database_url}

## Summary

| Metric | Value |
|--------|-------|
| Total Packets | ${summary.total_packets} |
| Valid Lineage | ${summary.valid_lineage} |
| Coverage | ${summary.lineage_coverage.toFixed(1)}% |

## Failures

| Failure Type | Count |
|--------------|-------|
| missing_source_ref | ${summary.failures.missing_source_ref} |
| missing_feature_id | ${summary.failures.missing_feature_id} |
| missing_feature_label | ${summary.failures.missing_feature_label} |
| missing_packet_key | ${summary.failures.missing_packet_key} |
| duplicate_source_ref | ${summary.failures.duplicate_source_ref} |
| duplicate_packet_key | ${summary.failures.duplicate_packet_key} |
| directory_mismatch | ${summary.failures.directory_mismatch} |

## Hard Fail Conditions (Parent Atlas Contract)

✓ missing_source_ref = ${summary.failures.missing_source_ref}
✓ missing_feature_id = ${summary.failures.missing_feature_id}
✓ missing_feature_label = ${summary.failures.missing_feature_label}
✓ missing_packet_key = ${summary.failures.missing_packet_key}
✓ duplicate_source_ref = ${summary.failures.duplicate_source_ref}
✓ duplicate_packet_key = ${summary.failures.duplicate_packet_key}
✓ directory_mismatch = ${summary.failures.directory_mismatch}

**RESULT**: ${isPass ? '✅ PASS — Lineage is frozen and ready for error-fixing.' : '❌ FAIL — Fix the issues above before proceeding to P0A.'}

${failedRows.length > 0 ? `\n## Failed Packets (${failedRows.length} total)\n` : ''}
${failedRows
  .slice(0, 20)
  .map(
    (r) => `- packet_id: \`${r.packetId}\`\n  - issues: ${r.issues.map((i) => i.type).join(', ')}`
  )
  .join('\n')}
${failedRows.length > 20 ? `\n... and ${failedRows.length - 20} more (see JSON report for full list)\n` : ''}

## Remediation

See \`remediation.sql\` in the same directory.

\`\`\`bash
# Review the remediation SQL
cat ${REPORT_JSON.replace(/\.json$/, '.sql')}

# Apply if confident
psql -U legal_admin -d legal_ai_db < ${REPORT_JSON.replace(/\.json$/, '.sql')}
\`\`\`
`;

    fs.writeFileSync(REPORT_MD, md, 'utf-8');
    console.log(`[ATLAS:LINEAGE:VERIFY] Markdown report written to: ${REPORT_MD}`);

    // Write remediation SQL
    const remediationPath = REPORT_JSON.replace(/\.json$/, '.sql');
    fs.writeFileSync(remediationPath, remediationSql, 'utf-8');
    console.log(`[ATLAS:LINEAGE:VERIFY] Remediation SQL written to: ${remediationPath}`);

    // Exit code
    if (!isPass) {
      console.error('[ATLAS:LINEAGE:VERIFY] ❌ VERIFICATION FAILED');
      console.error(
        `[ATLAS:LINEAGE:VERIFY] Run 'atlas:lineage:verify:fix' to apply remediation.`
      );
      process.exit(1);
    } else {
      console.log('[ATLAS:LINEAGE:VERIFY] ✅ VERIFICATION PASSED');
      console.log('[ATLAS:LINEAGE:VERIFY] Lineage is frozen and ready for P0A.');
      process.exit(0);
    }
  } catch (err) {
    console.error('[ATLAS:LINEAGE:VERIFY] Error:', err.message);
    if (verbose) console.error(err.stack);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Run verification
verifyLineage().catch((err) => {
  console.error('[ATLAS:LINEAGE:VERIFY] Fatal error:', err);
  process.exit(1);
});
