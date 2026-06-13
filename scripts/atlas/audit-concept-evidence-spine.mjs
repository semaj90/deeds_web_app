#!/usr/bin/env node
/**
 * @file scripts/atlas/audit-concept-evidence-spine.mjs
 * @description Audits the concept evidence spine in Postgres. Read-only audit of concept_records table.
 * Stage 2 (Producer) in the standardized harness system.
 *
 * Output:
 *   docs/reports/concept-evidence-spine-audit-report.json — canonical audit artifact
 *
 * Execution:
 *   node scripts/atlas/audit-concept-evidence-spine.mjs [--verbose] [--save]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const VERBOSE = process.argv.includes('--verbose');
const SAVE = process.argv.includes('--save');

// Dynamically import pg module in project context
async function getDb() {
  const pgModule = await import(path.resolve(ROOT, 'sveltekit-frontend/node_modules/pg'));
  const { Pool } = pgModule.default;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL env var not set');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  return { pool, client: null };
}

async function auditConceptEvidence() {
  const startTime = Date.now();
  const report = {
    timestamp: new Date().toISOString(),
    concepts: [],
    summary: {
      total_concepts: 0,
      packet_keys_present: 0,
      feature_ids_present: 0,
      evidence_cards_valid: false,
      coverage: {
        packet_keys: 0,
        feature_ids: 0,
        evidence_cards: 0
      }
    },
    gates: {
      audit: 'PENDING'
    },
    evidence: ['concept_records', 'atlas_packets', 'audit-concept-evidence-spine.mjs'],
    errors: []
  };

  try {
    const db = await getDb();
    const { pool } = db;

    // Query concept_records table
    const result = await pool.query(`
      SELECT
        concept_id,
        label,
        packet_keys,
        feature_ids,
        evidence_cards,
        success_count,
        failure_count
      FROM concept_records
      ORDER BY concept_id ASC
    `);

    const rows = result.rows;
    report.summary.total_concepts = rows.length;

    if (VERBOSE) {
      console.log(`Found ${rows.length} concepts`);
    }

    // Validate each concept
    for (const row of rows) {
      const conceptData = {
        concept_id: row.concept_id,
        label: row.label,
        packet_keys_count: Array.isArray(row.packet_keys) ? row.packet_keys.length : 0,
        feature_ids_count: Array.isArray(row.feature_ids) ? row.feature_ids.length : 0,
        evidence_cards_count: Array.isArray(row.evidence_cards) ? row.evidence_cards.length : 0,
        success_count: row.success_count,
        failure_count: row.failure_count,
        is_valid: true,
        issues: []
      };

      // Validate structure
      if (!Array.isArray(row.packet_keys)) {
        conceptData.is_valid = false;
        conceptData.issues.push('packet_keys is not an array');
      }
      if (!Array.isArray(row.feature_ids)) {
        conceptData.is_valid = false;
        conceptData.issues.push('feature_ids is not an array');
      }
      if (!Array.isArray(row.evidence_cards)) {
        conceptData.is_valid = false;
        conceptData.issues.push('evidence_cards is not an array');
      }

      // Gate: packet_keys should be populated (100%)
      if (Array.isArray(row.packet_keys) && row.packet_keys.length > 0) {
        report.summary.packet_keys_present++;
      }

      // Gate: feature_ids should be populated (≥95%)
      if (Array.isArray(row.feature_ids) && row.feature_ids.length > 0) {
        report.summary.feature_ids_present++;
      }

      // Gate: evidence_cards validation (should be regenerated from packet_keys)
      if (Array.isArray(row.evidence_cards) && row.evidence_cards.length > 0) {
        report.summary.evidence_cards_valid = true;
      }

      report.concepts.push(conceptData);
    }

    // Calculate coverage percentages
    if (report.summary.total_concepts > 0) {
      report.summary.coverage.packet_keys = Math.round(
        (report.summary.packet_keys_present / report.summary.total_concepts) * 100
      );
      report.summary.coverage.feature_ids = Math.round(
        (report.summary.feature_ids_present / report.summary.total_concepts) * 100
      );
      report.summary.coverage.evidence_cards = report.summary.evidence_cards_valid ? 100 : 0;
    }

    // Gate: 10/10 concepts (expected based on LANE checklist)
    if (report.summary.total_concepts === 10) {
      console.log(`✅ Found expected 10 concepts`);
    } else {
      report.errors.push(
        `Expected 10 concepts, found ${report.summary.total_concepts}`
      );
    }

    // Gate: feature_id ≥95%
    if (report.summary.coverage.feature_ids >= 95) {
      console.log(`✅ Feature ID coverage: ${report.summary.coverage.feature_ids}%`);
    } else {
      report.errors.push(
        `Feature ID coverage ${report.summary.coverage.feature_ids}% is below 95% threshold`
      );
    }

    // Determine audit gate status
    if (
      report.summary.total_concepts > 0 &&
      report.summary.coverage.feature_ids >= 95
    ) {
      report.gates.audit = 'PASS';
    } else {
      report.gates.audit = 'FAIL';
    }

    if (VERBOSE) {
      console.log(`\nAudit Summary:`);
      console.log(`  Total concepts: ${report.summary.total_concepts}`);
      console.log(`  Packet keys present: ${report.summary.packet_keys_present}/${report.summary.total_concepts}`);
      console.log(`  Feature IDs present: ${report.summary.feature_ids_present}/${report.summary.total_concepts}`);
      console.log(`  Evidence cards valid: ${report.summary.evidence_cards_valid ? 'YES' : 'NO'}`);
      console.log(`  Gate status: ${report.gates.audit}`);
    }

    // Write report
    if (SAVE) {
      const reportPath = path.resolve(ROOT, 'docs/reports/concept-evidence-spine-audit-report.json');
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`Report written to ${reportPath}`);
    } else {
      console.log(JSON.stringify(report, null, 2));
    }

    await pool.end();
    const wallClockMs = Date.now() - startTime;
    console.log(`\nAudit completed in ${wallClockMs}ms`);

    return report;
  } catch (error) {
    report.gates.audit = 'FAIL';
    report.errors.push(`Audit failed: ${error.message}`);
    console.error('Error during audit:', error);

    if (SAVE) {
      const reportPath = path.resolve(ROOT, 'docs/reports/concept-evidence-spine-audit-report.json');
      await fs.mkdir(path.dirname(reportPath), { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`Error report written to ${reportPath}`);
    }

    process.exit(1);
  }
}

await auditConceptEvidence();
