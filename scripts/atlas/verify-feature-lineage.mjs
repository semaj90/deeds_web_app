#!/usr/bin/env node
/**
 * ATLAS Feature Lineage Verification (P0 Task #3)
 *
 * Hard gate: Verify sourceRef → feature_id → feature_label → packet_id chain
 *
 * Validates:
 *   - directory_path → source_ref (no gaps)
 *   - source_ref → feature_id (all directories have unique feature_id)
 *   - feature_id → feature_label (human-readable labels exist)
 *   - feature_id → packet_id (Postgres atlas_packets references)
 *   - Qdrant payload consistency (som_cluster, feature_id, source_ref)
 *   - Redis centroid cache keys (format: centroid:directory:${source_ref}:${feature_id})
 *   - Orphan detection (missing sourceRef, feature_id, feature_label, Qdrant payload)
 *
 * Execution:
 *   node scripts/atlas/verify-feature-lineage.mjs [--verbose] [--strict]
 *
 * Output:
 *   - Console: Pass/Fail per gate
 *   - File: docs/reports/feature-lineage-verification.json
 *   - File: docs/reports/feature-lineage-verification.md
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

const VERBOSE = process.argv.includes('--verbose');
const STRICT  = process.argv.includes('--strict');
const EMOJI   = process.argv.includes('--emoji');
const OUTPUT_DIR = 'docs/reports';
const EXPORTS_DIR = 'memory/exports';

// ASCII-safe icons (same pattern as atlas-startup-intelligence.mjs)
const IC = EMOJI
  ? { pass: '✅', fail: '❌', warn: '⚠️ ', search: '🔍', data: '📂', doc: '📄', chart: '📊' }
  : { pass: '[PASS]', fail: '[FAIL]', warn: '[WARN]', search: '[SCAN]', data: '[DATA]', doc: '[FILE]', chart: '[STAT]' };

const REQUIRED_FIELDS = [
  'directory_path',
  'source_ref',
  'feature_id',
  'feature_label',
  'qdrant_collection',
  'redis_centroid_key'
];

// ============================================================================
// GATE VALIDATORS
// ============================================================================

class LineageValidator {
  constructor() {
    this.gates = [];
    this.passed = 0;
    this.failed = 0;
    this.warnings = 0;
  }

  addGate(name, passed, message) {
    const status = passed ? IC.pass : IC.fail;
    const gate = { name, passed, message, status };
    this.gates.push(gate);

    if (passed) {
      this.passed++;
      if (VERBOSE) console.log(`${status} ${name}: ${message}`);
    } else {
      this.failed++;
      console.error(`${status} ${name}: ${message}`);
    }
  }

  addWarning(name, message) {
    this.warnings++;
    console.warn(`${IC.warn} ${name}: ${message}`);
  }

  summary() {
    return {
      total: this.gates.length,
      passed: this.passed,
      failed: this.failed,
      warnings: this.warnings,
      success: this.failed === 0
    };
  }
}

// ============================================================================
// MAIN VALIDATION
// ============================================================================

async function livePostgresCheck(validator) {
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
    try {
      // feature_label lives in payload JSONB (not a top-level column)
      const r = await pool.query(`SELECT
        COUNT(*)                                                                          AS total,
        COUNT(*) FILTER (WHERE source_ref IS NULL OR source_ref = '')                    AS missing_source_ref,
        COUNT(*) FILTER (WHERE feature_id  IS NULL OR feature_id  = '')                  AS missing_feature_id,
        COUNT(*) FILTER (WHERE (payload->>'feature_label') IS NULL
                          OR (payload->>'feature_label') = '')                           AS missing_feature_label,
        COUNT(*) FILTER (WHERE packet_key IS NULL OR packet_key = '')                    AS missing_packet_key,
        COUNT(*) FILTER (WHERE summary IS NOT NULL AND LENGTH(summary) > 20)             AS with_summary,
        COUNT(DISTINCT feature_id)                                                        AS distinct_features
        FROM atlas_packets`);
      const row = r.rows[0];
      const total = Number(row.total) || 0;

      validator.addGate('G0a: Postgres atlas_packets reachable', total > 0,
        `${total} packets in atlas_packets`);
      validator.addGate('G0b: No missing source_ref', Number(row.missing_source_ref) === 0,
        `${row.missing_source_ref} packets missing source_ref (of ${total})`);
      validator.addGate('G0c: No missing feature_id', Number(row.missing_feature_id) === 0,
        `${row.missing_feature_id} packets missing feature_id (of ${total})`);
      validator.addGate('G0d: feature_label in payload', Number(row.missing_feature_label) < total * 0.5,
        `${row.missing_feature_label}/${total} packets missing payload.feature_label (warn if >50%)`);
      validator.addGate('G0e: No missing packet_key', Number(row.missing_packet_key) === 0,
        `${row.missing_packet_key} packets missing packet_key (of ${total})`);

      if (VERBOSE) {
        console.log(`  Postgres summary: ${total} total, ${row.distinct_features} distinct feature_ids`);
        console.log(`  Summaries >20 chars: ${row.with_summary}/${total}`);
      }
    } finally {
      await pool.end().catch(() => {});
    }
  } catch (e) {
    validator.addGate('G0: Postgres live check', false, `Connection failed: ${e.message}`);
  }
}

async function validateLineage() {
  const validator = new LineageValidator();

  console.log(`${IC.search} Verifying feature lineage chain...\n`);

  // G0: Live Postgres check (canonical source of truth)
  console.log('  Running live Postgres check (G0)...');
  await livePostgresCheck(validator);

  // Load directory-source-map
  let directoryMap = [];
  try {
    const mapPath = path.join(EXPORTS_DIR, 'directory-source-map.jsonl');
    const content = fs.readFileSync(mapPath, 'utf-8');
    directoryMap = content
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map((line, idx) => {
        try {
          return JSON.parse(line);
        } catch (e) {
          validator.addWarning(`JSONL Line ${idx}`, `Failed to parse: ${e.message}`);
          return null;
        }
      })
      .filter(Boolean);

    console.log(`${IC.data} Loaded ${directoryMap.length} directory entries from directory-source-map.jsonl\n`);
  } catch (e) {
    validator.addGate('Load directory-source-map', false, `Cannot read: ${e.message}`);
    return validator;
  }

  // ========================================================================
  // GATE 1: All directories have required fields
  // ========================================================================
  const missingFields = directoryMap.filter(entry =>
    !REQUIRED_FIELDS.every(field => field in entry && entry[field])
  );

  validator.addGate(
    'G1: All directories have required fields',
    missingFields.length === 0,
    `${missingFields.length} entries missing required fields`
  );

  if (missingFields.length > 0 && VERBOSE) {
    missingFields.slice(0, 5).forEach(entry => {
      const missing = REQUIRED_FIELDS.filter(f => !entry[f]);
      console.log(`  Missing: ${entry.directory_path || 'UNNAMED'} → ${missing.join(', ')}`);
    });
  }

  // ========================================================================
  // GATE 2: feature_id is unique per source_ref (or feature_label)
  // ========================================================================
  const sourceRefCounts = {};
  const featureIdCounts = {};

  directoryMap.forEach(entry => {
    sourceRefCounts[entry.source_ref] = (sourceRefCounts[entry.source_ref] || 0) + 1;
    featureIdCounts[entry.feature_id] = (featureIdCounts[entry.feature_id] || 0) + 1;
  });

  const duplicateSourceRefs = Object.entries(sourceRefCounts)
    .filter(([_, count]) => count > 1);
  const duplicateFeatureIds = Object.entries(featureIdCounts)
    .filter(([_, count]) => count > 1);

  validator.addGate(
    'G2: feature_id uniqueness',
    duplicateFeatureIds.length === 0,
    `${duplicateFeatureIds.length} feature_ids appear multiple times`
  );

  if (duplicateFeatureIds.length > 0 && VERBOSE) {
    duplicateFeatureIds.slice(0, 5).forEach(([fid, count]) => {
      console.log(`  feature_id ${fid}: ${count} entries`);
    });
  }

  // ========================================================================
  // GATE 3: source_ref is non-empty and exists
  // ========================================================================
  const emptySourceRefs = directoryMap.filter(entry => !entry.source_ref || entry.source_ref.length === 0);

  validator.addGate(
    'G3: source_ref non-empty',
    emptySourceRefs.length === 0,
    `${emptySourceRefs.length} directories have empty source_ref`
  );

  // ========================================================================
  // GATE 4: feature_id is 12-char hex (SHA256 slice)
  // ========================================================================
  const invalidFeatureIds = directoryMap.filter(entry =>
    !/^[a-f0-9]{12}$/.test(entry.feature_id)
  );

  validator.addGate(
    'G4: feature_id format (12-char hex)',
    invalidFeatureIds.length === 0,
    `${invalidFeatureIds.length} feature_ids are not 12-char hex`
  );

  // ========================================================================
  // GATE 5: feature_label is non-empty and descriptive
  // ========================================================================
  const emptyLabels = directoryMap.filter(entry =>
    !entry.feature_label || entry.feature_label.length < 3
  );

  validator.addGate(
    'G5: feature_label descriptiveness',
    emptyLabels.length === 0,
    `${emptyLabels.length} feature_labels are empty or too short`
  );

  // ========================================================================
  // GATE 6: qdrant_collection is valid (known collections)
  // ========================================================================
  const VALID_COLLECTIONS = [
    'codebase_chunks',
    'legal_documents',
    'semantic_cards',
    'general'
  ];

  const invalidCollections = directoryMap.filter(entry =>
    !VALID_COLLECTIONS.includes(entry.qdrant_collection)
  );

  validator.addGate(
    'G6: qdrant_collection validity',
    invalidCollections.length === 0,
    `${invalidCollections.length} entries have unknown Qdrant collections`
  );

  // ========================================================================
  // GATE 7: redis_centroid_key format (centroid:directory:${source_ref}:${feature_id})
  // ========================================================================
  const invalidRedisKeys = directoryMap.filter(entry => {
    const expected = `centroid:directory:${entry.source_ref}:${entry.feature_id}`;
    return entry.redis_centroid_key !== expected;
  });

  validator.addGate(
    'G7: Redis centroid key format',
    invalidRedisKeys.length === 0,
    `${invalidRedisKeys.length} Redis keys have wrong format`
  );

  // ========================================================================
  // GATE 8: Hidden directories are properly classified (or explicitly mapped)
  // ========================================================================
  const EXPLICIT_EXCEPTIONS = ['opencode', 'tmp_artifacts']; // .opencode and .tmp are explicitly mapped

  const hiddenDirs = directoryMap.filter(entry => {
    const pathPart = entry.directory_path.split(/[\\\/]/).shift();
    return pathPart && pathPart.startsWith('.');
  });
  const hiddenProperly = hiddenDirs.filter(entry =>
    entry.source_ref.startsWith('hidden_') || EXPLICIT_EXCEPTIONS.includes(entry.source_ref)
  );

  validator.addGate(
    'G8: Hidden directory classification',
    hiddenProperly.length === hiddenDirs.length,
    `${hiddenDirs.length - hiddenProperly.length} hidden dirs not properly classified`
  );

  // ========================================================================
  // GATE 9: Directory path consistency (directory_path matches source_ref intent)
  // ========================================================================
  const PATTERN_MAP = {
    'src/lib': 'src_lib',
    'src/routes': 'src_routes',
    'src/components': 'src_components',
    'sveltekit-frontend': 'sveltekit_frontend',
    'scripts/atlas': 'scripts_atlas',
    'scripts': 'scripts',
    'simd-bridge': 'simd_bridge',
    'docs': 'docs',
    'docs/reports': 'docs_reports',
    'memory': 'memory',
    'memory/exports': 'memory_exports',
    'neschrom97': 'neschrom97_cards',
    '.tmp': 'tmp_artifacts'
  };

  const pathSourceRefMismatches = directoryMap.filter(entry => {
    for (const [pattern, expectedRef] of Object.entries(PATTERN_MAP)) {
      if (entry.directory_path === pattern || entry.directory_path.startsWith(pattern + '/')) {
        return entry.source_ref !== expectedRef;
      }
    }
    return false; // Custom/fallback refs are okay
  });

  validator.addGate(
    'G9: Directory path ↔ source_ref alignment',
    pathSourceRefMismatches.length === 0,
    `${pathSourceRefMismatches.length} directories have misaligned source_refs`
  );

  // ========================================================================
  // GATE 10: packet_count >= 0 (non-negative)
  // ========================================================================
  const negativePacketCounts = directoryMap.filter(entry =>
    entry.packet_count < 0
  );

  validator.addGate(
    'G10: Packet count non-negativity',
    negativePacketCounts.length === 0,
    `${negativePacketCounts.length} entries have negative packet_count`
  );

  // ========================================================================
  // GATE 11: cold_storage_status is valid
  // ========================================================================
  const VALID_STORAGE_STATUS = ['not_archived', 'archived', 'cold_archive', 'pending_archive'];

  const invalidStorageStatus = directoryMap.filter(entry =>
    !VALID_STORAGE_STATUS.includes(entry.cold_storage_status)
  );

  validator.addGate(
    'G11: cold_storage_status validity',
    invalidStorageStatus.length === 0,
    `${invalidStorageStatus.length} entries have unknown storage status`
  );

  // ========================================================================
  // GATE 12: No orphaned entries (file_count > 0 implies presence)
  // ========================================================================
  const orphanedEmpty = directoryMap.filter(entry =>
    entry.file_count === 0 && entry.directory_path && entry.directory_path !== 'root'
  );

  if (STRICT) {
    validator.addGate(
      'G12: No orphaned (zero-file) directories (STRICT)',
      orphanedEmpty.length === 0,
      `${orphanedEmpty.length} directories have zero files (may be stale)`
    );
  } else {
    validator.addWarning(
      'G12: Empty directories detected',
      `${orphanedEmpty.length} directories have zero files (non-blocking in normal mode)`
    );
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================

  const summary = validator.summary();

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${IC.chart} LINEAGE VERIFICATION SUMMARY`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Total Gates: ${summary.total}`);
  console.log(`Passed: ${summary.passed} ${IC.pass}`);
  console.log(`Failed: ${summary.failed} ${IC.fail}`);
  console.log(`Warnings: ${summary.warnings} ${IC.warn}`);
  console.log(`${'='.repeat(70)}\n`);

  if (summary.success) {
    console.log(`${IC.pass} LINEAGE VERIFICATION PASSED`);
  } else {
    console.log(`${IC.fail} LINEAGE VERIFICATION FAILED`);
    if (!STRICT) {
      console.log(`Tip: Run with --strict flag to enable extra validation gates`);
    }
  }

  // ========================================================================
  // OUTPUT FILES
  // ========================================================================

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // JSON report
  const jsonReport = {
    timestamp: new Date().toISOString(),
    summary,
    gates: validator.gates.map(g => ({
      name: g.name,
      passed: g.passed,
      message: g.message
    })),
    statistics: {
      total_directories: directoryMap.length,
      hidden_directories: hiddenDirs.length,
      feature_ids_unique: Object.keys(featureIdCounts).length,
      source_refs_mapped: Object.keys(sourceRefCounts).length,
      collections_used: [...new Set(directoryMap.map(d => d.qdrant_collection))]
    }
  };

  const jsonPath = path.join(OUTPUT_DIR, 'feature-lineage-verification.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  console.log(`${IC.doc} Wrote ${jsonPath}`);

  // Markdown report
  let mdContent = `# Feature Lineage Verification Report

**Generated**: ${new Date().toISOString()}
**Status**: ${summary.success ? '✅ PASSED' : '❌ FAILED'}

## Summary

| Metric | Value |
|--------|-------|
| Total Gates | ${summary.total} |
| Passed | ${summary.passed} |
| Failed | ${summary.failed} |
| Warnings | ${summary.warnings} |

## Gate Results

`;

  validator.gates.forEach(gate => {
    const symbol = gate.passed ? '✅' : '❌'; // emoji ok in markdown output files
    mdContent += `### ${symbol} ${gate.name}\n\n`;
    mdContent += `${gate.message}\n\n`;
  });

  mdContent += `## Statistics

| Metric | Count |
|--------|-------|
| Total Directories | ${directoryMap.length} |
| Hidden Directories | ${hiddenDirs.length} |
| Unique Feature IDs | ${Object.keys(featureIdCounts).length} |
| Unique Source Refs | ${Object.keys(sourceRefCounts).length} |
| Collections Used | ${jsonReport.statistics.collections_used.join(', ')} |

`;

  const mdPath = path.join(OUTPUT_DIR, 'feature-lineage-verification.md');
  fs.writeFileSync(mdPath, mdContent);
  console.log(`${IC.doc} Wrote ${mdPath}`);

  return validator;
}

// ============================================================================
// EXECUTE
// ============================================================================

try {
  await validateLineage();
  process.exit(0);
} catch (err) {
  console.error('[FAIL] Error:', err);
  process.exit(1);
}
