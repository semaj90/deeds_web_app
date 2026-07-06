#!/usr/bin/env node
/**
 * Phase 106: Export Rejected Semantic Training Rows
 *
 * Transforms rejected envelopes into training dataset for model retraining.
 * Each rejected row becomes a training sample with features + label.
 *
 * Input: .tmp/rejected-semantic-envelopes.ndjson
 * Output:
 *   - .tmp/rejected-semantic-training-rows.ndjson (training format)
 *   - docs/reports/rejected-semantic-training-rows.json (summary)
 *   - docs/reports/rejected-semantic-training-rows.md (human readable)
 *
 * Training sample shape:
 *   packet_key
 *   source_ref
 *   feature_id
 *   domain_class
 *   failure_reason (hard_failures[0])
 *   missing_fields (array)
 *   semantic_lane_status
 *   qdrant_point_id_present
 *   topology_present
 *   tree_node_id_present
 *   suggested_label (StructureError | SemanticError | VectorError | etc.)
 *   training_split (train | val | test)
 *   created_at
 *
 * Usage:
 *   npm run atlas:export:rejected:training:dry --limit=50
 *   npm run atlas:export:rejected:training:apply
 */

import fs from 'fs';
import path from 'path';

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? 'unlimited'
);

const SUGGESTED_LABELS = {
  missing_packet_key: 'IdentityError',
  missing_source_ref: 'IdentityError',
  missing_feature_id: 'IdentityError',
  missing_embedding: 'VectorError',
  missing_qdrant_point_id: 'QdrantBridgeError',
  missing_tree_node_id: 'TreePropagationError',
  missing_title_id: 'IdentityError',
  missing_used_concepts: 'SemanticError'
};

async function main() {
  console.log(`\n[PHASE 106] Export Rejected Semantic Training Rows [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  try {
    // 1. Read rejected envelopes
    console.log('Step 1: Read rejected semantic envelopes...');

    const rejectedPath = path.join(process.cwd(), '.tmp', 'rejected-semantic-envelopes.ndjson');
    if (!fs.existsSync(rejectedPath)) {
      console.log(`  [WARN] No rejected envelopes found at ${rejectedPath}\n`);
      console.log('[SUCCESS] No training rows to export.\n');
      process.exit(0);
    }

    const rejectedContent = fs.readFileSync(rejectedPath, 'utf-8');
    const rejectedLines = rejectedContent
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map((line, idx) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          console.warn(`  Line ${idx + 1}: parse error, skipping`);
          return null;
        }
      })
      .filter(r => r !== null);

    console.log(`  [OK] Found ${rejectedLines.length} rejected envelopes\n`);

    if (rejectedLines.length === 0) {
      console.log('[SUCCESS] No training rows to export.\n');
      process.exit(0);
    }

    // 2. Transform to training format
    console.log('Step 2: Transform to training dataset format...');

    const trainingRows = [];
    const labelCounts = {};

    for (let i = 0; i < Math.min(rejectedLines.length, limit === 'unlimited' ? Infinity : limit); i++) {
      const rejected = rejectedLines[i];
      const hardFailure = rejected.hard_failures?.[0] || 'unknown_failure';
      const suggestedLabel = SUGGESTED_LABELS[hardFailure] || 'SemanticError';

      // Deterministic train/val/test split (70/15/15)
      const trainingSplit = i % 100 < 70 ? 'train' : i % 100 < 85 ? 'val' : 'test';

      const trainingRow = {
        packet_key: rejected.packet_key,
        source_ref: rejected.source_ref,
        feature_id: rejected.feature_id,
        domain_class: 'unknown', // Will be enriched from Postgres if needed
        failure_reason: hardFailure,
        missing_fields: rejected.hard_failures || [],
        semantic_lane_status: 'incomplete',
        qdrant_point_id_present: false,
        topology_present: false,
        tree_node_id_present: false,
        suggested_label: suggestedLabel,
        training_split: trainingSplit,
        created_at: rejected.timestamp || new Date().toISOString()
      };

      trainingRows.push(trainingRow);

      // Count labels for distribution report
      labelCounts[suggestedLabel] = (labelCounts[suggestedLabel] || 0) + 1;
    }

    console.log(`  [OK] Transformed ${trainingRows.length} rows to training format\n`);

    if (isDryRun) {
      console.log('Sample training rows (first 3):\n');
      trainingRows.slice(0, 3).forEach(row => {
        console.log(`  ${row.packet_key}`);
        console.log(`    Suggested label: ${row.suggested_label}`);
        console.log(`    Failure: ${row.failure_reason}`);
        console.log(`    Split: ${row.training_split}`);
        console.log();
      });

      console.log('Label distribution:');
      Object.entries(labelCounts).forEach(([label, count]) => {
        console.log(`  ${label}: ${count} (${(count / trainingRows.length * 100).toFixed(1)}%)`);
      });
      console.log();

      console.log('[OK] Dry-run complete. Use apply to persist.\n');
      process.exit(0);
    }

    // 3. Write NDJSON training file
    console.log('Step 3: Write training dataset...');

    const reportsDir = path.join(process.cwd(), 'docs', 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const tmpDir = path.join(process.cwd(), '.tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const trainingNdjsonPath = path.join(tmpDir, 'rejected-semantic-training-rows.ndjson');
    const ndjsonContent = trainingRows.map(r => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(trainingNdjsonPath, ndjsonContent);
    console.log(`  [OK] Training rows written to ${trainingNdjsonPath}\n`);

    // 4. Generate JSON summary
    console.log('Step 4: Generate summary report...');

    const trainCount = trainingRows.filter(r => r.training_split === 'train').length;
    const valCount = trainingRows.filter(r => r.training_split === 'val').length;
    const testCount = trainingRows.filter(r => r.training_split === 'test').length;

    const jsonReport = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTrainingRows: trainingRows.length,
        labelDistribution: labelCounts,
        trainingDatasetSplit: {
          train: { count: trainCount, pct: (trainCount / trainingRows.length * 100).toFixed(1) },
          val: { count: valCount, pct: (valCount / trainingRows.length * 100).toFixed(1) },
          test: { count: testCount, pct: (testCount / trainingRows.length * 100).toFixed(1) }
        }
      },
      files: {
        ndjson: trainingNdjsonPath,
        json: path.join(reportsDir, 'rejected-semantic-training-rows.json'),
        markdown: path.join(reportsDir, 'rejected-semantic-training-rows.md')
      },
      samples: trainingRows.slice(0, 10)
    };

    const jsonReportPath = path.join(reportsDir, 'rejected-semantic-training-rows.json');
    fs.writeFileSync(jsonReportPath, JSON.stringify(jsonReport, null, 2));
    console.log(`  [OK] JSON report written to ${jsonReportPath}\n`);

    // 5. Generate Markdown report
    console.log('Step 5: Generate markdown report...');

    const mdReport = `# Rejected Semantic Training Dataset

**Generated:** ${new Date().toISOString()}

## Summary

- **Total training rows:** ${trainingRows.length}
- **Training split:** ${trainCount} train / ${valCount} val / ${testCount} test

## Label Distribution

\`\`\`
${Object.entries(labelCounts)
  .map(([label, count]) => `${label.padEnd(25)}: ${count.toString().padStart(5)} (${(count / trainingRows.length * 100).toFixed(1)}%)`)
  .join('\n')}
\`\`\`

## Files

- NDJSON: \`${trainingNdjsonPath}\`
- JSON: \`${jsonReportPath}\`

## Suggested Labels

These labels are used to categorize failures for model retraining:

- **IdentityError**: Missing packet_key, source_ref, feature_id, or title_id
- **VectorError**: Missing embedding or vector not indexed
- **QdrantBridgeError**: Missing qdrant_point_id (vector indexing failed)
- **TreePropagationError**: Missing tree_node_id (AST propagation failed)
- **SemanticError**: Missing semantic concepts or used_concepts empty
- **StructureError**: Missing AST symbols
- **TopologyError**: Missing SOM or PageRank
- **CachePromotionError**: Failed cache promotion

## Training Usage

Train Naive Bayes with these rows:

\`\`\`bash
python scripts/atlas/train-naive-bayes-packet-features.py \\
  --training-data ${trainingNdjsonPath} \\
  --output-model models/naive-bayes-rejected-errors.json
\`\`\`

## Next Steps

1. Review label distribution
2. Train or retrain Naive Bayes classifier with these examples
3. Apply predictions to current packets
4. Validate prediction accuracy against hard failure gates
`;

    const mdReportPath = path.join(reportsDir, 'rejected-semantic-training-rows.md');
    fs.writeFileSync(mdReportPath, mdReport);
    console.log(`  [OK] Markdown report written to ${mdReportPath}\n`);

    // 6. Summary
    console.log('Export Summary:');
    console.log(`  Total training rows: ${trainingRows.length}`);
    console.log(`  Train split: ${trainCount} (70%)`);
    console.log(`  Val split: ${valCount} (15%)`);
    console.log(`  Test split: ${testCount} (15%)`);
    console.log();

    console.log('[SUCCESS] Rejected Semantic Training Export Complete.\n');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  }
}

main();
