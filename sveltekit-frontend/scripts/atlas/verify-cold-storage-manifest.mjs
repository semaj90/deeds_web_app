#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import https from 'node:https';
import http from 'node:http';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// Load environment
const { loadedFiles } = loadAtlasEnv(REPO_ROOT);
console.log(`[ATLAS:COLD:VERIFY] Loaded env from: ${loadedFiles.join(', ') || '(none)'}`);

// Parse CLI flags
const applyRestore = process.argv.includes('--apply-restore');
const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const testSamples = parseInt(process.argv.find(arg => arg.startsWith('--test-samples='))?.split('=')[1] || '5', 10);

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30000,
  idleTimeoutMillis: 5000,
  max: 2,
});

const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const TIMESTAMP = new Date().toISOString().split('T')[0];
const REPORT_JSON = path.join(REPORT_DIR, `cold-storage-verify-${TIMESTAMP}.json`);
const REPORT_MD = path.join(REPORT_DIR, `cold-storage-verify-${TIMESTAMP}.md`);

// Ensure report directory exists
fs.mkdirSync(REPORT_DIR, { recursive: true });

/**
 * Normalize URI for comparison
 */
function normalizeUri(val) {
  if (!val) return null;
  const s = String(val).trim();
  return s.length === 0 ? null : s;
}

/**
 * Test HTTP/HTTPS connectivity to a URI
 */
async function testUriConnectivity(uri) {
  if (!uri) {
    return { reachable: false, status: 'null_uri', latency_ms: 0 };
  }

  try {
    const url = new URL(uri);
    const client = url.protocol === 'https:' ? https : http;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const req = client.request(
        uri,
        { method: 'HEAD', timeout: 5000 },
        (res) => {
          const latency = Date.now() - startTime;
          resolve({
            reachable: res.statusCode < 500,
            status: `http_${res.statusCode}`,
            latency_ms: latency,
          });
        }
      );

      req.on('error', (err) => {
        const latency = Date.now() - startTime;
        resolve({
          reachable: false,
          status: `error_${err.code || 'unknown'}`,
          latency_ms: latency,
        });
      });

      req.end();
    });
  } catch (err) {
    return { reachable: false, status: `invalid_uri: ${err.message}`, latency_ms: 0 };
  }
}

/**
 * Validate manifest schema
 */
function validateManifestRow(row, rowIndex) {
  const issues = [];

  // Hard fail conditions from Parent Atlas contract
  const id = row.id;
  const sourceRef = normalizeUri(row.source_ref);
  const packetKey = normalizeUri(row.packet_key);
  const featureId = normalizeUri(row.feature_id);
  const seaweedfsFpath = normalizeUri(row.seaweedfs_path);
  const coldObjectHash = normalizeUri(row.cold_object_hash);

  if (!id) {
    issues.push({ type: 'missing_id', severity: 'CRITICAL' });
  }

  if (!sourceRef) {
    issues.push({ type: 'missing_source_ref', severity: 'CRITICAL' });
  }

  if (!packetKey) {
    issues.push({ type: 'missing_packet_key', severity: 'CRITICAL', detail: 'FK reference broken' });
  }

  if (!featureId) {
    issues.push({ type: 'missing_feature_id', severity: 'CRITICAL' });
  }

  if (!seaweedfsFpath) {
    issues.push({ type: 'missing_seaweedfs_path', severity: 'CRITICAL' });
  }

  if (!coldObjectHash || !/^[a-f0-9]{64}$/.test(coldObjectHash)) {
    issues.push({
      type: 'invalid_cold_object_hash',
      severity: 'CRITICAL',
      detail: coldObjectHash ? 'not a valid SHA-256 hex string' : 'missing',
    });
  }

  return issues;
}

/**
 * Main verification gate
 */
async function runVerification() {
  console.log('[ATLAS:COLD:VERIFY] Starting cold storage manifest verification...\n');

  const client = await pool.connect();

  try {
    // Gate 1: Table existence
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'atlas_cold_storage_manifest'
      ) as exists
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('[ATLAS:COLD:VERIFY] ❌ GATE 1 FAIL: atlas_cold_storage_manifest table not found');
      return {
        status: 'fail',
        gate: 'table_existence',
        summary: {
          table_exists: false,
          total_manifests: 0,
          valid_manifests: 0,
          manifest_coverage: null,
          failures: {
            missing_manifest_id: 0,
            missing_packet_id: 0,
            missing_source_ref: 0,
            missing_seaweedfs_uri: 0,
            invalid_sha256: 0,
            orphaned_packet_id: 0,
            uri_unreachable: 0,
          },
        },
        failed_manifests: [],
        connectivity_failures: [],
        timestamp: new Date().toISOString(),
      };
    }

    console.log('[ATLAS:COLD:VERIFY] ✅ GATE 1 PASS: Table exists');

    // Gate 2: Schema validation
    const schemaCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'atlas_cold_storage_manifest'
      ORDER BY column_name
    `);

    const requiredColumns = {
      id: 'bigint',
      source_ref: 'text',
      packet_key: 'text',
      feature_id: 'text',
      seaweedfs_path: 'text',
      seaweedfs_file_id: 'text',
      seaweedfs_volume: 'integer',
      cold_object_key: 'text',
      cold_object_hash: 'text',
      restore_manifest: 'jsonb',
      required_for_restore: 'boolean',
      created_at: 'timestamp with time zone',
    };

    const schemaColumns = new Map(schemaCheck.rows.map(r => [r.column_name, r.data_type]));
    const schemaMissing = Object.entries(requiredColumns)
      .filter(([col]) => !schemaColumns.has(col));

    if (schemaMissing.length > 0) {
      console.log(`[ATLAS:COLD:VERIFY] ❌ GATE 2 FAIL: Missing columns: ${schemaMissing.map(([c]) => c).join(', ')}`);
      return {
        status: 'fail',
        gate: 'schema_validation',
        summary: {
          table_exists: true,
          schema_valid: false,
          missing_columns: schemaMissing.map(([col]) => col),
          total_manifests: 0,
          valid_manifests: 0,
          failures: { missing_columns: schemaMissing.length },
        },
        timestamp: new Date().toISOString(),
      };
    }

    console.log('[ATLAS:COLD:VERIFY] ✅ GATE 2 PASS: Schema valid');

    // Gate 3: Packet key resolution (packet_key should exist in atlas_packets)
    const fkCheck = await client.query(`
      SELECT COUNT(*) as orphaned
      FROM atlas_cold_storage_manifest m
      LEFT JOIN atlas_packets p ON m.packet_key = p.packet_key
      WHERE p.packet_key IS NULL AND m.packet_key IS NOT NULL
    `);

    const orphanedCount = parseInt(fkCheck.rows[0].orphaned, 10);
    if (orphanedCount > 0) {
      console.log(`[ATLAS:COLD:VERIFY] ⚠️  GATE 3 WARN: ${orphanedCount} orphaned packet_keys`);
    } else {
      console.log('[ATLAS:COLD:VERIFY] ✅ GATE 3 PASS: Packet key resolution valid');
    }

    // Gate 4: Hard-fail condition scan
    const manifests = await client.query(
      'SELECT id, packet_key, source_ref, feature_id, seaweedfs_path, cold_object_hash FROM atlas_cold_storage_manifest LIMIT 50000'
    );

    const failures = {
      missing_id: 0,
      missing_packet_key: 0,
      missing_source_ref: 0,
      missing_feature_id: 0,
      missing_seaweedfs_path: 0,
      invalid_cold_object_hash: 0,
      orphaned_packet_key: orphanedCount,
      path_unreachable: 0,
    };

    const failedManifests = [];

    for (let i = 0; i < manifests.rows.length; i++) {
      const row = manifests.rows[i];
      const issues = validateManifestRow(row, i);

      if (issues.length > 0) {
        for (const issue of issues) {
          failures[issue.type] = (failures[issue.type] || 0) + 1;
        }
        failedManifests.push({
          manifest_id: row.manifest_id,
          packet_id: row.packet_id,
          issues,
        });
      }
    }

    const totalFailures = Object.values(failures).reduce((a, b) => a + b, 0);

    if (totalFailures > 0) {
      console.log(`[ATLAS:COLD:VERIFY] ❌ GATE 4 FAIL: Found ${totalFailures} hard-fail conditions`);
      console.log(`  - missing_id: ${failures.missing_id}`);
      console.log(`  - missing_packet_key: ${failures.missing_packet_key}`);
      console.log(`  - missing_source_ref: ${failures.missing_source_ref}`);
      console.log(`  - missing_feature_id: ${failures.missing_feature_id}`);
      console.log(`  - missing_seaweedfs_path: ${failures.missing_seaweedfs_path}`);
      console.log(`  - invalid_cold_object_hash: ${failures.invalid_cold_object_hash}`);
      console.log(`  - orphaned_packet_key: ${failures.orphaned_packet_key}`);
    } else {
      console.log('[ATLAS:COLD:VERIFY] ✅ GATE 4 PASS: No hard-fail conditions detected');
    }

    // Gate 5: Path validation sampling (test first N samples)
    console.log(`\n[ATLAS:COLD:VERIFY] Validating SeaweedFS paths (sample: ${testSamples} manifests)...`);

    const connectivity_failures = [];
    const sampleManifests = manifests.rows.slice(0, testSamples);

    for (const manifest of sampleManifests) {
      const path = manifest.seaweedfs_path;
      if (!path) continue;

      // Check path format (SeaweedFS paths are of form /bucket/key or similar)
      const isValid = /^\/[a-zA-Z0-9_\-/.]+$/.test(path);
      if (!isValid) {
        connectivity_failures.push({
          id: manifest.id,
          path,
          status: 'invalid_path_format',
          latency_ms: 0,
        });
        failures.path_unreachable = (failures.path_unreachable || 0) + 1;
      }
    }

    if (connectivity_failures.length > 0) {
      console.log(`[ATLAS:COLD:VERIFY] ⚠️  Found ${connectivity_failures.length} invalid paths (sample)`);
    } else {
      console.log(`[ATLAS:COLD:VERIFY] ✅ All sampled paths valid`);
    }

    // Empty tables are structurally valid but do not prove restore readiness.
    const overallStatus = totalFailures > 0
      ? 'fail'
      : manifests.rows.length === 0
        ? 'warn_empty'
        : 'pass';

    const result = {
      status: overallStatus,
      summary: {
        table_exists: true,
        schema_valid: true,
        fk_integrity: orphanedCount === 0,
        total_manifests: manifests.rows.length,
        valid_manifests: manifests.rows.length - failedManifests.length,
        manifest_coverage: manifests.rows.length > 0 ? ((manifests.rows.length - failedManifests.length) / manifests.rows.length * 100).toFixed(1) : null,
        connectivity_tested: sampleManifests.length,
        failures,
      },
      failed_manifests: failedManifests.slice(0, 100), // Cap at 100 for report size
      connectivity_failures: connectivity_failures.slice(0, 100),
      timestamp: new Date().toISOString(),
      database_url: process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@'),
    };

    const statusLabel = result.status === 'pass'
      ? '✅ VERIFICATION PASSED'
      : result.status === 'warn_empty'
        ? '⚠️ VERIFICATION INCOMPLETE: NO MANIFEST ROWS'
        : '❌ VERIFICATION FAILED';
    console.log(`\n[ATLAS:COLD:VERIFY] ${statusLabel}`);
    console.log(`[ATLAS:COLD:VERIFY] Valid manifests: ${result.summary.valid_manifests}/${result.summary.total_manifests} (${result.summary.manifest_coverage}%)`);

    // Write reports
    fs.writeFileSync(REPORT_JSON, JSON.stringify(result, null, 2));
    console.log(`\n[ATLAS:COLD:VERIFY] Report: ${REPORT_JSON}`);

    // Write markdown report
    const mdReport = `# P0.3 Cold Storage Manifest Verification

**Date**: ${new Date().toISOString()}
**Status**: ${result.status === 'pass' ? '✅ PASS' : result.status === 'warn_empty' ? '⚠️ WARN_EMPTY' : '❌ FAIL'}

## Summary

- Total manifests: ${result.summary.total_manifests}
- Valid manifests: ${result.summary.valid_manifests}
- Coverage: ${result.summary.manifest_coverage || 'N/A'}%
- FK integrity: ${result.summary.fk_integrity ? '✅' : '❌'}

## Failures

- Missing id: ${result.summary.failures.missing_id}
- Missing packet_key: ${result.summary.failures.missing_packet_key}
- Missing source_ref: ${result.summary.failures.missing_source_ref}
- Missing feature_id: ${result.summary.failures.missing_feature_id}
- Missing seaweedfs_path: ${result.summary.failures.missing_seaweedfs_path}
- Invalid cold_object_hash: ${result.summary.failures.invalid_cold_object_hash}
- Orphaned packet_key: ${result.summary.failures.orphaned_packet_key}
- Path validation failures: ${result.summary.failures.path_unreachable}

## Path Validation Sample

Tested: ${result.summary.connectivity_tested} manifests

${result.connectivity_failures.length > 0 ? `### Invalid Paths
${result.connectivity_failures.map(f => `- Record \`${f.id}\`: ${f.path} (${f.status})`).join('\n')}` : '### All sampled paths valid ✅'}

## Next Steps

${result.status === 'fail' ? `
- Investigate failed manifests in \`${REPORT_JSON}\`
- Repair missing fields or orphaned references
- Restore from backup if needed
- Re-run verification after repairs
` : result.status === 'warn_empty' ? `
- Generate at least one real cold-storage manifest from canonical packet metadata.
- Verify the SeaweedFS object exists and can be restored.
- Re-run this verifier; 0/0 is not restore proof.
` : `
- P0.3 verification PASSED
- Ready for P0A (directory stability) and P0B (cold storage integration)
- Proceed to P1 (agentic error fixing) after P0 gate closure
`}
`;

    fs.writeFileSync(REPORT_MD, mdReport);
    console.log(`[ATLAS:COLD:VERIFY] Markdown report: ${REPORT_MD}`);

    return result;
  } finally {
    client.release();
    await pool.end();
  }
}

// Execute
try {
  const result = await runVerification();
  process.exit(result.status === 'fail' ? 1 : 0);
} catch (err) {
  console.error('[ATLAS:COLD:VERIFY] Fatal error:', err.message);
  process.exit(2);
}
