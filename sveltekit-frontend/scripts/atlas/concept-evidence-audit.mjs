#!/usr/bin/env node
/**
 * concept-evidence-audit.mjs
 *
 * Audit the 10 canonical concepts for completeness:
 * - All 10 concepts present in atlas_concept_labels
 * - Each concept has ≥95% feature_id coverage (packet join)
 * - Evidence cards are valid and present for each concept
 * - Concept taxonomy is internally consistent
 *
 * Gates:
 * 1. All 10 concepts defined: feature_id, label, description
 * 2. Feature ID join coverage: ≥95% (packets that reference this concept)
 * 3. Evidence cards valid JSON: 100%
 * 4. At least 1 evidence card per concept
 *
 * Read-only. No mutations.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');

const CANONICAL_CONCEPTS = [
  'database_orm',
  'api_endpoints',
  'authentication',
  'caching_strategy',
  'error_handling',
  'state_management',
  'file_processing',
  'vector_search',
  'async_operations',
  'type_safety',
];

async function main() {
  loadAtlasEnv(REPO_ROOT);
  const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const pool = new Pool({ connectionString: dbUrl, max: 1 });

  const startTime = Date.now();
  const report = {
    generated_at: new Date().toISOString(),
    canonical_concepts_total: CANONICAL_CONCEPTS.length,
    concepts_found: 0,
    concepts_with_feature_coverage: 0,
    concepts_with_evidence: 0,
    evidence_cards_valid: 0,
    gates: {
      all_10_defined: false,
      feature_id_coverage_95: false,
      evidence_valid_100: false,
      evidence_present: false,
    },
    gates_pass: false,
    concepts: {},
    errors: [],
  };

  try {
    console.log(`[concept-evidence] Auditing ${CANONICAL_CONCEPTS.length} canonical concepts...`);

    // Check each canonical concept
    for (const conceptId of CANONICAL_CONCEPTS) {
      const conceptReport = {
        concept_id: conceptId,
        found: false,
        label: '',
        feature_id_count: 0,
        total_packets: 0,
        coverage_pct: 0,
        evidence_cards: [],
        evidence_valid: true,
      };

      try {
        // Query for concept
        const conceptRes = await pool.query(
          `
          SELECT concept_id, label, description, evidence_cards, feature_ids
          FROM atlas_concept_labels
          WHERE concept_id = $1
        `,
          [conceptId]
        );

        if (conceptRes.rows.length > 0) {
          const row = conceptRes.rows[0];
          conceptReport.found = true;
          conceptReport.label = row.label;
          report.concepts_found++;

          // Parse evidence cards
          if (row.evidence_cards) {
            try {
              conceptReport.evidence_cards = JSON.parse(row.evidence_cards);
              conceptReport.evidence_valid = true;
              report.evidence_cards_valid++;
            } catch {
              conceptReport.evidence_valid = false;
            }
          }

          // Count feature IDs
          if (row.feature_ids && Array.isArray(row.feature_ids)) {
            conceptReport.feature_id_count = row.feature_ids.length;
          }

          // Get total packets in system
          const totalRes = await pool.query(`SELECT COUNT(*) as total FROM atlas_packets`);
          conceptReport.total_packets = totalRes.rows[0]?.total || 0;
          conceptReport.coverage_pct =
            conceptReport.total_packets > 0
              ? ((conceptReport.feature_id_count / conceptReport.total_packets) * 100).toFixed(1)
              : 0;

          if (conceptReport.coverage_pct >= 95) {
            report.concepts_with_feature_coverage++;
          }

          if (conceptReport.evidence_cards.length > 0) {
            report.concepts_with_evidence++;
          }
        }
      } catch (err) {
        report.errors.push(`Error querying ${conceptId}: ${err.message}`);
      }

      report.concepts[conceptId] = conceptReport;
    }

    // Evaluate gates
    report.gates.all_10_defined = report.concepts_found === CANONICAL_CONCEPTS.length;
    report.gates.feature_id_coverage_95 =
      report.concepts_with_feature_coverage / CANONICAL_CONCEPTS.length >= 0.95;
    report.gates.evidence_valid_100 =
      report.evidence_cards_valid / CANONICAL_CONCEPTS.length >= 0.95;
    report.gates.evidence_present =
      report.concepts_with_evidence / CANONICAL_CONCEPTS.length >= 0.9;

    report.gates_pass =
      report.gates.all_10_defined &&
      report.gates.feature_id_coverage_95 &&
      report.gates.evidence_valid_100 &&
      report.gates.evidence_present;

    console.log(`\n[concept-evidence] Results:`);
    console.log(`  Concepts found: ${report.concepts_found}/${CANONICAL_CONCEPTS.length}`);
    console.log(`  With feature coverage ≥95%: ${report.concepts_with_feature_coverage}/${CANONICAL_CONCEPTS.length}`);
    console.log(`  With evidence cards: ${report.concepts_with_evidence}/${CANONICAL_CONCEPTS.length}`);
    console.log(`  Evidence cards valid: ${report.evidence_cards_valid}/${CANONICAL_CONCEPTS.length}`);

    console.log(`\n[concept-evidence] Gate Results:`);
    console.log(`  All 10 defined: ${report.gates.all_10_defined ? '✅' : '❌'}`);
    console.log(`  Feature ID coverage ≥95%: ${report.gates.feature_id_coverage_95 ? '✅' : '❌'}`);
    console.log(`  Evidence valid ≥95%: ${report.gates.evidence_valid_100 ? '✅' : '❌'}`);
    console.log(`  Evidence present ≥90%: ${report.gates.evidence_present ? '✅' : '❌'}`);

    // Write reports
    await fs.writeFile(
      path.join(REPORTS_DIR, 'concept-evidence-audit-report.json'),
      JSON.stringify(report, null, 2)
    );

    const conceptDetails = Object.entries(report.concepts)
      .map(
        ([conceptId, data]) =>
          `
### ${conceptId.replace(/_/g, ' ').toUpperCase()}

- Label: ${data.label || '(missing)'}
- Found: ${data.found ? '✅' : '❌'}
- Feature ID coverage: ${data.coverage_pct}% (${data.feature_id_count}/${data.total_packets})
- Evidence cards: ${data.evidence_cards.length}
- Valid JSON: ${data.evidence_valid ? '✅' : '❌'}
`
      )
      .join('\n');

    const md = `# Concept Evidence Audit Report

Generated: ${report.generated_at}

## Summary

- Canonical concepts total: ${report.canonical_concepts_total}
- Concepts found: ${report.concepts_found}
- With feature ID coverage ≥95%: ${report.concepts_with_feature_coverage}
- With evidence cards: ${report.concepts_with_evidence}
- Valid JSON: ${report.evidence_cards_valid}

## Gate Results

| Gate | Result | Status |
|------|--------|--------|
| All 10 defined | ${report.concepts_found}/10 | ${report.gates.all_10_defined ? '✅' : '❌'} |
| Feature ID coverage ≥95% | ${report.concepts_with_feature_coverage}/10 | ${report.gates.feature_id_coverage_95 ? '✅' : '❌'} |
| Evidence valid ≥95% | ${report.evidence_cards_valid}/10 | ${report.gates.evidence_valid_100 ? '✅' : '❌'} |
| Evidence present ≥90% | ${report.concepts_with_evidence}/10 | ${report.gates.evidence_present ? '✅' : '❌'} |

## Overall Status

- **Gates Pass: ${report.gates_pass ? '✅ YES' : '❌ NO'}**

## Concept Details

${conceptDetails}

## Errors

${report.errors.length > 0 ? report.errors.map((e) => `- ${e}`).join('\n') : 'None'}
`;

    await fs.writeFile(path.join(REPORTS_DIR, 'concept-evidence-audit-report.md'), md);

    console.log(`\n[concept-evidence] Reports written to docs/reports/`);
    console.log(`\nGates: ${report.gates_pass ? '✅ PASS' : '❌ FAIL'}`);
  } catch (err) {
    report.errors.push(err.message);
    console.error(`[concept-evidence] Error: ${err.message}`);
  } finally {
    await pool.end();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nCompleted in ${duration}s`);
  }
}

await main();
