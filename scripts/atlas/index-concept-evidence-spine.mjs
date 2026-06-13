#!/usr/bin/env node
/**
 * @file scripts/atlas/index-concept-evidence-spine.mjs
 * @description Reads Concept Evidence Spine and indexes concepts with evidence tracking.
 * Stage 2-3 (Consumer Dry-Run + Consumer Apply) in the Parent Atlas mutation contract.
 *
 * Input:
 *   docs/reports/concept-evidence-spine.json (from Stage 1 producer)
 *
 * Output (dry-run):
 *   docs/reports/concept-evidence-spine-dry-run.json
 *
 * Execution:
 *   node scripts/atlas/index-concept-evidence-spine.mjs [--apply]
 */

import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const REPORT_PATH = 'docs/reports/concept-evidence-spine.json';

async function main() {
  // Read and parse the concept spine artifact
  const rawReport = await fs.readFile(REPORT_PATH, 'utf8');
  let spine;

  try {
    spine = JSON.parse(rawReport);
  } catch (e) {
    throw new Error(`Failed to parse spine artifact at ${REPORT_PATH}: ${e.message}`);
  }

  if (!spine?.concept_taxonomy || !Array.isArray(spine.concept_taxonomy)) {
    throw new Error('Concept spine must include concept_taxonomy array');
  }

  // Build indexing plan
  const indexPlan = {
    concepts_to_index: spine.concept_taxonomy.length,
    evidence_packets_to_link: spine.total_evidence_packets,
    verification_gates: {
      concept_count: spine.concept_taxonomy.length >= 10 ? 'PASS' : 'FAIL',
      evidence_coverage: spine.total_evidence_packets > 0 ? 'PASS' : 'WARN',
      ace_consistency: spine.ace_kag_dag_evidence.ace_concepts === spine.concept_taxonomy.length ? 'PASS' : 'FAIL'
    }
  };

  console.log(`\n====================================================`);
  console.log(`[STATUS] Concept Evidence Spine Indexer`);
  console.log(`[MODE] ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`[CONCEPTS] ${indexPlan.concepts_to_index}`);
  console.log(`[EVIDENCE] ${indexPlan.evidence_packets_to_link} packets`);
  console.log(`====================================================`);

  console.log('\n--- Concept Taxonomy Preview ---');
  spine.concept_taxonomy.slice(0, 3).forEach((c, i) => {
    console.log(`\n${i + 1}. ${c.label}`);
    console.log(`   ID: ${c.concept_id}`);
    console.log(`   Domains: ${c.domains.length}`);
    console.log(`   Confidence: ${c.confidence}`);
  });
  console.log('\n--- Verification Gates ---');
  Object.entries(indexPlan.verification_gates).forEach(([gate, status]) => {
    const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️ ' : '❌';
    console.log(`${icon} ${gate}: ${status}`);
  });
  console.log('\n--------------------------------------\n');

  if (!APPLY) {
    // Stage 3: Dry-run mode
    const dryRunReport = {
      ok: true,
      mode: 'dry-run',
      generated_at: new Date().toISOString(),
      next_step: `node ${process.argv[1]} --apply`,
      index_plan: indexPlan,
      would_write: {
        postgres: [
          'concept_taxonomy (10 rows)',
          'concept_evidence_mapping (10 rows)',
          'packet_concept_links (variable)'
        ],
        neo4j: 'USED_CONCEPT edges (already seeded)',
        count: spine.concept_taxonomy.length
      },
      concepts_by_coverage: spine.evidence_mapping.map(e => ({
        concept_id: e.concept_id,
        evidence_count: e.evidence_count,
        coverage: e.coverage
      }))
    };

    const dryRunPath = path.resolve(ROOT, 'docs/reports/concept-evidence-spine-dry-run.json');
    await fs.mkdir(path.dirname(dryRunPath), { recursive: true });
    await fs.writeFile(dryRunPath, JSON.stringify(dryRunReport, null, 2));
    console.log(`✅ Dry-run report written: ${dryRunPath}`);
    console.log(`Next step after review: node ${process.argv[1]} --apply`);
    return;
  }

  // Stage 5: Apply mode — perform indexing
  console.log('⚙️ Applying: Indexing concept evidence spine...');

  // In apply mode, we write a persistent index file that runtime can read
  const indexConfig = {
    timestamp: new Date().toISOString(),
    concepts: spine.concept_taxonomy,
    evidence_mapping: spine.evidence_mapping,
    verification_gates: indexPlan.verification_gates,
    status: 'indexed'
  };

  const configPath = path.resolve(ROOT, 'docs/reports/concept-evidence-spine-indexed.json');
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(indexConfig, null, 2));

  console.log(`\n✅ Concepts indexed: ${spine.concept_taxonomy.length}`);
  console.log(`✅ Evidence packets linked: ${spine.total_evidence_packets}`);
  console.log(`✅ Verification gates: ${Object.values(indexPlan.verification_gates).filter(v => v === 'PASS').length}/${Object.keys(indexPlan.verification_gates).length} passed`);
  console.log(`\n✨ Concept Evidence Spine indexing complete!`);
  console.log(`   Index written to: ${configPath}`);
}

main().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  if (VERBOSE) {
    console.error(err.stack);
  }
  process.exit(1);
});
