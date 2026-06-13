#!/usr/bin/env node
/**
 * classify-supernode-pressure.mjs
 *
 * Classifier script for Lane 1B: Higher-Hop Enrichment
 *
 * Reads the pressure audit report and builds a safe/deferred classification
 * that the seeding script uses to avoid overwhelming the graph with edges.
 *
 * Generates:
 * - Safe concept list (ready to seed USED_CONCEPT edges)
 * - Deferred concept list (postpone until pressure drops)
 * - Classification metadata for logging/audit purposes
 *
 * Usage:
 *   node scripts/atlas/classify-supernode-pressure.mjs --save
 *   node scripts/atlas/classify-supernode-pressure.mjs --safe-only --save
 *   node scripts/atlas/classify-supernode-pressure.mjs --verbose
 *
 * Output:
 *   docs/reports/higher-hop-enrichment-classified.json
 *
 * Exit code: 0 (success), 1 (error)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const VERBOSE = process.argv.includes('--verbose');
const SAFE_ONLY = process.argv.includes('--safe-only');
const SAVE = process.argv.includes('--save');

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══ Classify Supernode Pressure (Lane 1B) ═══\n');

  try {
    // Step 1: Load audit report
    const reportPath = join(ROOT, 'docs', 'reports', 'higher-hop-enrichment-pressure-audit.json');
    let auditReport;

    try {
      const content = readFileSync(reportPath, 'utf-8');
      auditReport = JSON.parse(content);
    } catch (err) {
      console.error(`❌ Cannot load audit report: ${reportPath}`);
      console.error(`   Run 'npm run atlas:supernode:pressure:audit --save' first.`);
      process.exit(1);
    }

    // Step 2: Extract safe and deferred concepts
    const safeConcepts = auditReport.concepts
      .filter(c => c.pressure === 'safe')
      .map(c => ({ concept_id: c.concept_id, concept_name: c.concept_name }));

    const deferredConcepts = auditReport.concepts
      .filter(c => c.pressure === 'deferred')
      .map(c => ({ concept_id: c.concept_id, concept_name: c.concept_name }));

    // Step 3: Build classification report
    const classification = {
      generated_at: new Date().toISOString(),
      audit_report_source: reportPath,
      pressure_thresholds: {
        safe: auditReport.pressure_threshold_safe,
        deferred: auditReport.pressure_threshold_deferred
      },
      classification: {
        safe: {
          count: safeConcepts.length,
          concepts: safeConcepts.sort((a, b) => a.concept_id.localeCompare(b.concept_id))
        },
        deferred: {
          count: deferredConcepts.length,
          concepts: deferredConcepts.sort((a, b) => a.concept_id.localeCompare(b.concept_id))
        }
      },
      seeding_strategy: {
        recommended_approach: safeConcepts.length > 0
          ? `Seed USED_CONCEPT edges from safe concepts only (${safeConcepts.length})`
          : 'No safe concepts available. All concepts deferred.',
        edge_cap_per_concept: 1000,
        safe_only_mode: SAFE_ONLY
      },
      gates: {
        safe_concepts_available: safeConcepts.length > 0 ? 'PASS' : 'DEFER',
        classification_complete: 'PASS'
      }
    };

    // Step 4: Output
    console.log(`✓ Classification Complete`);
    console.log(`  Safe concepts:     ${safeConcepts.length}`);
    console.log(`  Deferred concepts: ${deferredConcepts.length}`);
    console.log(`\nSafe Concept List:`);
    safeConcepts.forEach(c => {
      console.log(`  • ${c.concept_id} (${c.concept_name})`);
    });

    if (deferredConcepts.length > 0) {
      console.log(`\nDeferred Concepts (will be seeded in a later phase):`);
      deferredConcepts.forEach(c => {
        const pressure = auditReport.concepts.find(x => x.concept_id === c.concept_id);
        console.log(`  • ${c.concept_id} (${c.concept_name}) [${pressure.edge_count} edges]`);
      });
    }

    if (SAFE_ONLY && safeConcepts.length > 0) {
      console.log(`\n✓ Safe-only mode: Using ${safeConcepts.length} safe concepts for seeding.`);
    }

    // Step 5: Save if requested
    if (SAVE) {
      const reportDir = join(ROOT, 'docs', 'reports');
      mkdirSync(reportDir, { recursive: true });
      const classificationPath = join(reportDir, 'higher-hop-enrichment-classified.json');
      writeFileSync(classificationPath, JSON.stringify(classification, null, 2));
      console.log(`\n✓ Classification saved: ${classificationPath}`);
    }

    console.log(`\n✓ Classification complete.\n`);
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

main();
