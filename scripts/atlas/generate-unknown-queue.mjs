import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

const featureLabelsPath = path.join(FRONTEND_ROOT, '.tmp', 'feature_labels.jsonl');
const temporalAuditPath = path.join(FRONTEND_ROOT, '.tmp', 'drizzle-temporal-audit.latest.json');
const clustersPath = path.join(FRONTEND_ROOT, 'docs', 'graph', 'hypergraph-clusters.json');
const outputPath = path.join(FRONTEND_ROOT, '.tmp', 'unknown-queue.json');

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function main() {
  console.log('🔍 Identifying unknowns, ambiguous feature mappings, and orphan schema gaps...');
  const queue = {
    low_confidence_features: [],
    orphan_schema_gaps: [],
    weak_som_clusters: []
  };

  // 1. Parse Feature Labels
  if (fs.existsSync(featureLabelsPath)) {
    const records = readJsonl(featureLabelsPath);
    for (const record of records) {
      if (record.topFeature === 'other' || !record.features || record.features.length === 0) {
        queue.low_confidence_features.push({
          file: record.file,
          features: record.features || [],
          topFeature: record.topFeature || 'other'
        });
      }
      if (record.schema_gap) {
        queue.orphan_schema_gaps.push(record.schema_gap);
      }
    }
  }

  // 2. Parse Drizzle Temporal Audit
  if (fs.existsSync(temporalAuditPath)) {
    try {
      const audit = JSON.parse(fs.readFileSync(temporalAuditPath, 'utf8'));
      for (const classification of audit.classifications || []) {
        if (['LIVE_UNDECLARED_ACTIVE', 'UNKNOWN_NEEDS_OPERATOR'].includes(classification.classification)) {
          // Check if already in orphan_schema_gaps
          const exists = queue.orphan_schema_gaps.some(g => g.schema_table === classification.tableName);
          if (!exists) {
            queue.orphan_schema_gaps.push({
              feature_id: `schema.drift.${classification.tableName}`,
              workspace_task_id: `TASK-drift-${classification.tableName}`,
              source_ref: classification.file || 'drizzle/manual/unjournaled',
              schema_table: classification.tableName,
              schema_column: '*',
              drift_status: classification.classification,
              risk: 'high'
            });
          }
        }
      }
    } catch (e) {
      console.warn('  Could not parse drizzle-temporal-audit.latest.json:', e.message);
    }
  }

  // 3. Parse Weak SOM Clusters
  if (fs.existsSync(clustersPath)) {
    try {
      const clusters = JSON.parse(fs.readFileSync(clustersPath, 'utf8'));
      for (const c of clusters) {
        if (c.size <= 2 || c.inferredTopic.toLowerCase().includes('unknown')) {
          queue.weak_som_clusters.push({
            id: c.id,
            size: c.size,
            inferredTopic: c.inferredTopic,
            topPaths: c.topPaths || [],
            somRow: c.somRow,
            somCol: c.somCol
          });
        }
      }
    } catch (e) {
      console.warn('  Could not parse hypergraph-clusters.json:', e.message);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(queue, null, 2));
  console.log(`\n==================================================`);
  console.log(`✓ Unknown Queue Generated: ${outputPath}`);
  console.log(`  Low Confidence Features : ${queue.low_confidence_features.length}`);
  console.log(`  Orphan Schema Gaps     : ${queue.orphan_schema_gaps.length}`);
  console.log(`  Weak SOM Clusters      : ${queue.weak_som_clusters.length}`);
  console.log(`==================================================`);
}

main();
