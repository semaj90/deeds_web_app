import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

const reasoningJsonPath = path.join(FRONTEND_ROOT, '.tmp', 'unknown-reasoning-results.json');
const outRecsJsonl = path.join(FRONTEND_ROOT, '.tmp', 'gemma-recommendations.jsonl');
const kanbanTasksPath = path.join(FRONTEND_ROOT, '.tmp', 'kanban_tasks.jsonl');
const hypergraphPath = path.join(REPO_ROOT, '.tmp', 'ingest', 'lanes', 'gemma_recommendation.ndjson');

async function main() {
  console.log('📦 Materializing Gemma recommendations into Kanban tasks and hypergraph records...');

  if (!fs.existsSync(reasoningJsonPath)) {
    console.error(`Reasoning JSON not found at ${reasoningJsonPath}`);
    process.exit(1);
  }

  const reasoningData = JSON.parse(fs.readFileSync(reasoningJsonPath, 'utf8'));
  const anomalies = reasoningData.anomalies || {};

  // Define structured recommendations mapping schema gaps and weak clusters
  const recommendations = [];

  // Schema Drift Recommendations
  if (anomalies.schema_gaps && anomalies.schema_gaps.length > 0) {
    for (const gap of anomalies.schema_gaps) {
      recommendations.push({
        source_ref: gap.source_ref || 'drizzle/manual/unjournaled',
        feature_id: 'database',
        workspace_task_id: gap.workspace_task_id || `TASK-drift-${gap.schema_table}`,
        risk: gap.risk || 'high',
        next_action: `Promote Drizzle schema sidecar for table '${gap.schema_table}' and verify column/type contracts.`,
        record_type: 'gemma_recommendation',
        details: gap
      });
    }
  }

  // Weak Cluster Recommendations
  if (anomalies.weak_clusters && anomalies.weak_clusters.length > 0) {
    for (const cluster of anomalies.weak_clusters) {
      recommendations.push({
        source_ref: cluster.topPaths?.[0]?.path || 'src/lib/server/db/schema-postgres.ts',
        feature_id: 'codebase-structure',
        workspace_task_id: `TASK-cluster-prune-${cluster.id}`,
        risk: 'medium',
        next_action: `Review weak SOM cluster ${cluster.id} (size ${cluster.size}). Prune or merge into larger parent topology components. Inferred topic: ${cluster.inferredTopic}.`,
        record_type: 'gemma_recommendation',
        details: cluster
      });
    }
  }

  // Ensure JSONL recommendations file
  const recsLines = recommendations.map(r => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(outRecsJsonl, recsLines);
  console.log(`✓ Wrote ${recommendations.length} recommendations to ${outRecsJsonl}`);

  // Append to kanban_tasks.jsonl
  const kanbanLines = recommendations.map(r => JSON.stringify({
    title: `Gemma Recommendation: ${r.workspace_task_id}`,
    file: r.source_ref,
    id: r.workspace_task_id,
    feature: r.feature_id,
    workspace_task_id: r.workspace_task_id,
    risk: r.risk,
    notes: r.next_action,
    record_type: 'gemma_recommendation'
  })).join('\n') + '\n';
  fs.appendFileSync(kanbanTasksPath, kanbanLines);
  console.log(`✓ Appended tasks to ${kanbanTasksPath}`);

  // Append to parent-atlas-hypergraph.jsonl
  const hypergraphLines = recommendations.map(r => JSON.stringify({
    node_id: r.workspace_task_id,
    lane: 'gemma_recommendation',
    title: r.workspace_task_id,
    sourceRef: r.source_ref,
    payload_json: JSON.stringify({
      feature_id: r.feature_id,
      workspace_task_id: r.workspace_task_id,
      risk: r.risk,
      next_action: r.next_action
    })
  })).join('\n') + '\n';
  fs.appendFileSync(hypergraphPath, hypergraphLines);
  console.log(`✓ Appended to hypergraph at ${hypergraphPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
