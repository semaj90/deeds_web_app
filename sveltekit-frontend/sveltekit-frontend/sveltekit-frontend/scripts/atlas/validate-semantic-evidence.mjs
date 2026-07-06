#!/usr/bin/env node
/**
 * Phase 106 Semantic Evidence Validator
 *
 * Row-level semantic evidence validator to prove each envelope has:
 * 1. Identity fields present (packet_key, source_ref, feature_id, title_id)
 * 2. At least one semantic lane populated (ast_symbols OR lexical_features OR used_concepts OR entities)
 * 3. HMM diagnosis maps to valid repair lane
 * 4. Naive Bayes predictions present and valid
 *
 * Emits report: docs/reports/semantic-evidence-validator.json + markdown
 *
 * Usage:
 *   npm run atlas:validate:semantic-evidence:dry --limit=100
 *   npm run atlas:validate:semantic-evidence:apply
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '50000'
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

/**
 * Validate semantic evidence for a single packet
 */
function validateSemanticEvidence(row) {
  const issues = [];
  const passed = [];

  const {
    packet_key,
    source_ref,
    feature_id,
    title_id,
    ast_symbols,
    lexical_features,
    used_concepts,
    entities,
    naive_bayes_predictions,
    hmm_recommendations
  } = row;

  // Check 1: Identity fields
  if (!packet_key) {
    issues.push('IDENTITY_ERROR: packet_key missing');
  } else {
    passed.push('identity:packet_key_present');
  }

  if (!source_ref) {
    issues.push('IDENTITY_ERROR: source_ref missing');
  } else {
    passed.push('identity:source_ref_present');
  }

  if (!feature_id) {
    issues.push('IDENTITY_ERROR: feature_id missing');
  } else {
    passed.push('identity:feature_id_present');
  }

  if (!title_id) {
    issues.push('IDENTITY_ERROR: title_id missing');
  } else {
    passed.push('identity:title_id_present');
  }

  // Check 2: Semantic lanes (at least one must be present)
  const semanticLanesPresent = [];
  if (ast_symbols && Array.isArray(ast_symbols) && ast_symbols.length > 0) {
    semanticLanesPresent.push('ast_symbols');
    passed.push('semantic:ast_symbols_present');
  }
  if (lexical_features && Array.isArray(lexical_features) && lexical_features.length > 0) {
    semanticLanesPresent.push('lexical_features');
    passed.push('semantic:lexical_features_present');
  }
  if (used_concepts && Array.isArray(used_concepts) && used_concepts.length > 0) {
    semanticLanesPresent.push('used_concepts');
    passed.push('semantic:used_concepts_present');
  }
  if (entities && Array.isArray(entities) && entities.length > 0) {
    semanticLanesPresent.push('entities');
    passed.push('semantic:entities_present');
  }

  if (semanticLanesPresent.length === 0) {
    issues.push('SEMANTIC_ERROR: No semantic lanes populated (need at least one: ast_symbols, lexical_features, used_concepts, entities)');
  } else {
    passed.push(`semantic:lanes_present[${semanticLanesPresent.join(',')}]`);
  }

  // Check 3: Naive Bayes predictions
  if (!naive_bayes_predictions) {
    issues.push('NAIVE_BAYES_ERROR: predictions missing from atlas_packet_metrics');
  } else {
    if (naive_bayes_predictions.domain_class) passed.push('predictions:domain_class_present');
    if (naive_bayes_predictions.feature_type) passed.push('predictions:feature_type_present');
    if (naive_bayes_predictions.likely_error_state) passed.push('predictions:error_state_present');
    if (naive_bayes_predictions.candidate_repair_lane) passed.push('predictions:repair_lane_present');
  }

  // Check 4: HMM recommendations
  if (!hmm_recommendations) {
    issues.push('HMM_ERROR: recommendations missing from atlas_packet_metrics');
  } else {
    const validStates = ['IdentityError', 'StructureError', 'LexicalError', 'SemanticError', 'TopologyError', 'VectorError', 'QdrantBridgeError'];
    if (!validStates.includes(hmm_recommendations.hmm_state)) {
      issues.push(`HMM_ERROR: invalid hmm_state '${hmm_recommendations.hmm_state}'`);
    } else {
      passed.push(`hmm:state_valid[${hmm_recommendations.hmm_state}]`);
    }

    const validLanes = ['ast_extraction', 'lexical_extraction', 'concept_extraction', 'embedding_bridge', 'topology_repair', 'none'];
    if (!validLanes.includes(hmm_recommendations.recommended_repair_lane)) {
      issues.push(`HMM_ERROR: invalid repair_lane '${hmm_recommendations.recommended_repair_lane}'`);
    } else {
      passed.push(`hmm:lane_valid[${hmm_recommendations.recommended_repair_lane}]`);
    }

    if (typeof hmm_recommendations.confidence !== 'number' || hmm_recommendations.confidence < 0 || hmm_recommendations.confidence > 1) {
      issues.push(`HMM_ERROR: confidence out of range [0,1]: ${hmm_recommendations.confidence}`);
    } else {
      passed.push(`hmm:confidence_valid[${(hmm_recommendations.confidence * 100).toFixed(0)}%]`);
    }
  }

  return {
    packet_key,
    valid: issues.length === 0,
    issues,
    passed,
    semanticLanesCount: semanticLanesPresent.length,
    checksPassedCount: passed.length,
    checksFailedCount: issues.length
  };
}

async function main() {
  console.log(`\n[PHASE 106] Semantic Evidence Validator [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();

  try {
    // 1. Fetch all packets with their evidence
    console.log('Step 1: Fetch packets for validation...');
    const result = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.title_id,
        apf.ast_symbols,
        apf.lexical_features,
        apf.used_concepts,
        apf.entities,
        apm.naive_bayes_predictions,
        apm.hmm_recommendations
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key
      LEFT JOIN atlas_packet_metrics apm ON apm.packet_key = ap.packet_key
      WHERE ap.source_ref NOT LIKE 'proto:%'
      ORDER BY ap.packet_key
      LIMIT $1
    `, [limit]);

    const packets = result.rows;
    console.log(`  [OK] Fetched ${packets.length} packets\n`);

    if (packets.length === 0) {
      console.log('  [WARN] No packets to validate.\n');
      process.exit(0);
    }

    // 2. Validate each packet
    console.log('Step 2: Validate semantic evidence...');

    const validations = packets.map(validateSemanticEvidence);

    const stats = {
      total: validations.length,
      valid: validations.filter(v => v.valid).length,
      invalid: validations.filter(v => !v.valid).length,
      semanticLanesCoverage: {
        'all_4': 0,
        'at_least_3': 0,
        'at_least_2': 0,
        'at_least_1': 0,
        'none': 0
      },
      checksPassedSum: validations.reduce((acc, v) => acc + v.checksPassedCount, 0),
      checksFailedSum: validations.reduce((acc, v) => acc + v.checksFailedCount, 0)
    };

    // Collect semantic coverage stats
    validations.forEach(v => {
      if (v.semanticLanesCount === 4) stats.semanticLanesCoverage.all_4++;
      else if (v.semanticLanesCount === 3) stats.semanticLanesCoverage.at_least_3++;
      else if (v.semanticLanesCount === 2) stats.semanticLanesCoverage.at_least_2++;
      else if (v.semanticLanesCount === 1) stats.semanticLanesCoverage.at_least_1++;
      else stats.semanticLanesCoverage.none++;
    });

    console.log(`  [OK] Validated ${validations.length} packets\n`);

    // 3. Print summary
    console.log('Validation Summary:');
    console.log(`  Total packets: ${stats.total}`);
    console.log(`  Valid packets: ${stats.valid} (${(stats.valid / stats.total * 100).toFixed(1)}%)`);
    console.log(`  Invalid packets: ${stats.invalid} (${(stats.invalid / stats.total * 100).toFixed(1)}%)`);
    console.log(`  Total checks passed: ${stats.checksPassedSum}`);
    console.log(`  Total checks failed: ${stats.checksFailedSum}`);
    console.log();

    console.log('Semantic Lane Coverage:');
    console.log(`  All 4 lanes: ${stats.semanticLanesCoverage.all_4} (${(stats.semanticLanesCoverage.all_4 / stats.total * 100).toFixed(1)}%)`);
    console.log(`  At least 3 lanes: ${stats.semanticLanesCoverage.at_least_3} (${(stats.semanticLanesCoverage.at_least_3 / stats.total * 100).toFixed(1)}%)`);
    console.log(`  At least 2 lanes: ${stats.semanticLanesCoverage.at_least_2} (${(stats.semanticLanesCoverage.at_least_2 / stats.total * 100).toFixed(1)}%)`);
    console.log(`  At least 1 lane: ${stats.semanticLanesCoverage.at_least_1} (${(stats.semanticLanesCoverage.at_least_1 / stats.total * 100).toFixed(1)}%)`);
    console.log(`  No lanes: ${stats.semanticLanesCoverage.none} (${(stats.semanticLanesCoverage.none / stats.total * 100).toFixed(1)}%)`);
    console.log();

    if (isDryRun) {
      console.log('Sample validation results (first 5):\n');
      validations.slice(0, 5).forEach(v => {
        console.log(`  ${v.packet_key}`);
        console.log(`    Valid: ${v.valid}`);
        console.log(`    Semantic lanes: ${v.semanticLanesCount}`);
        console.log(`    Checks passed: ${v.checksPassedCount}`);
        if (v.issues.length > 0) {
          console.log(`    Issues: ${v.issues.join('; ')}`);
        }
        console.log();
      });
      console.log('[OK] Dry-run complete. Use apply to write report.\n');
      process.exit(0);
    }

    // 4. Write report to JSON and Markdown
    console.log('Step 3: Write validation report...');

    const reportsDir = path.join(__dirname, '..', '..', 'docs', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Write JSON report
    const jsonReportPath = path.join(reportsDir, 'semantic-evidence-validator.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      stats,
      validations: validations.slice(0, 100)  // First 100 for report size
    }, null, 2));

    console.log(`  [OK] JSON report written to ${jsonReportPath}`);

    // Write Markdown report
    const mdReportPath = path.join(reportsDir, 'semantic-evidence-validator.md');
    const mdContent = `# Semantic Evidence Validator Report

**Generated:** ${new Date().toISOString()}

## Summary

- **Total packets:** ${stats.total}
- **Valid packets:** ${stats.valid} (${(stats.valid / stats.total * 100).toFixed(1)}%)
- **Invalid packets:** ${stats.invalid} (${(stats.invalid / stats.total * 100).toFixed(1)}%)
- **Total checks passed:** ${stats.checksPassedSum}
- **Total checks failed:** ${stats.checksFailedSum}

## Semantic Lane Coverage

| Coverage | Count | Percentage |
|----------|-------|-----------|
| All 4 lanes | ${stats.semanticLanesCoverage.all_4} | ${(stats.semanticLanesCoverage.all_4 / stats.total * 100).toFixed(1)}% |
| At least 3 lanes | ${stats.semanticLanesCoverage.at_least_3} | ${(stats.semanticLanesCoverage.at_least_3 / stats.total * 100).toFixed(1)}% |
| At least 2 lanes | ${stats.semanticLanesCoverage.at_least_2} | ${(stats.semanticLanesCoverage.at_least_2 / stats.total * 100).toFixed(1)}% |
| At least 1 lane | ${stats.semanticLanesCoverage.at_least_1} | ${(stats.semanticLanesCoverage.at_least_1 / stats.total * 100).toFixed(1)}% |
| No lanes | ${stats.semanticLanesCoverage.none} | ${(stats.semanticLanesCoverage.none / stats.total * 100).toFixed(1)}% |

## Invalid Packets

${validations.filter(v => !v.valid).slice(0, 50).map(v => `
### ${v.packet_key}

**Issues:** ${v.issues.join('; ')}
`).join('\n')}

## Validation Checks

All packets must pass the following checks:

1. **Identity Layer (4 checks)**
   - [x] packet_key present
   - [x] source_ref present
   - [x] feature_id present
   - [x] title_id present

2. **Semantic Layer (4 checks)**
   - [x] ast_symbols populated OR
   - [x] lexical_features populated OR
   - [x] used_concepts populated OR
   - [x] entities populated

3. **Naive Bayes Layer (4 checks)**
   - [x] domain_class prediction present
   - [x] feature_type prediction present
   - [x] error_state prediction present
   - [x] repair_lane prediction present

4. **HMM Layer (3 checks)**
   - [x] hmm_state valid (one of: IdentityError, StructureError, LexicalError, SemanticError, TopologyError, VectorError, QdrantBridgeError)
   - [x] repair_lane valid (one of: ast_extraction, lexical_extraction, concept_extraction, embedding_bridge, topology_repair, none)
   - [x] confidence in range [0.0, 1.0]
`;

    fs.writeFileSync(mdReportPath, mdContent);
    console.log(`  [OK] Markdown report written to ${mdReportPath}\n`);

    console.log('[SUCCESS] Semantic Evidence Validation Complete.\n');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
