#!/usr/bin/env node
/**
 * bootstrap-workspace-tasks.mjs
 *
 * Reads .opencode/recommendations/tasks.ndjson and produces:
 *  - .opencode/tasks/_index.json (workspace-level index)
 *  - .opencode/tasks/active/task_<id>.json (one per todo task)
 *
 * Classification: maps each task to a feature_id from _feature_labels.json
 * using feature labels matched against the task's featureIds + cluster + description.
 *
 * NON-DESTRUCTIVE for the source NDJSON. Output is a fresh workspace layout.
 *
 * Usage:
 *   node scripts/opencode/bootstrap-workspace-tasks.mjs                      # dry-run
 *   node scripts/opencode/bootstrap-workspace-tasks.mjs --apply              # write files
 *   node scripts/opencode/bootstrap-workspace-tasks.mjs --apply --limit 100  # only first 100 tasks
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

const NDJSON_PATH = '.opencode/recommendations/tasks.ndjson';
const TASKS_ROOT = '.opencode/tasks';
const LABELS_PATH = '.opencode/tasks/_feature_labels.json';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT_IDX = args.indexOf('--limit');
const LIMIT = LIMIT_IDX >= 0 ? parseInt(args[LIMIT_IDX + 1] ?? '100', 10) : null;

function classifyTask(task, labels) {
  // Score each feature label against task signals (cluster, featureIds, description text)
  const scores = {};
  const taskFeatureIds = (task.featureIds || []).map(s => s.toLowerCase());
  const taskCluster = (task.cluster || '').toLowerCase();
  const taskDesc = (task.description || task.title || '').toLowerCase();

  for (const [featureKey, label] of Object.entries(labels.labels)) {
    let score = 0;
    const semPath = (label.semantic_path || []).map(s => s.toLowerCase());

    // direct semantic_path mention in cluster
    for (const sp of semPath) {
      if (taskCluster.includes(sp)) score += 3;
    }

    // semantic_path mention in description
    for (const sp of semPath) {
      if (taskDesc.includes(sp)) score += 1;
    }

    // featureId substring match
    for (const fid of taskFeatureIds) {
      for (const sp of semPath) {
        if (fid.includes(sp) || sp.includes(fid)) score += 2;
      }
    }

    // pillar mention in cluster
    if (taskCluster.includes(label.pillar.toLowerCase())) score += 2;

    scores[featureKey] = score;
  }

  // Find highest score
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestKey, bestScore] = sorted[0] || ['platform', 0];
  return { feature_id: bestScore > 0 ? bestKey : 'platform', confidence: Math.min(bestScore / 10, 1.0) };
}

function main() {
  console.log('🚀 Workspace Task Bootstrap');
  console.log('   Mode:', APPLY ? 'APPLY' : 'DRY-RUN');
  console.log('   Limit:', LIMIT ?? 'all');
  console.log();

  if (!existsSync(NDJSON_PATH)) {
    console.error(`ERROR: ${NDJSON_PATH} not found`);
    process.exit(1);
  }

  if (!existsSync(LABELS_PATH)) {
    console.error(`ERROR: ${LABELS_PATH} not found. Create feature labels first.`);
    process.exit(1);
  }

  const labels = JSON.parse(readFileSync(LABELS_PATH, 'utf-8'));
  console.log(`[1/4] Loaded ${Object.keys(labels.labels).length} feature labels`);

  // Stream-load NDJSON (large file)
  const lines = readFileSync(NDJSON_PATH, 'utf-8').split('\n').filter(l => l.trim());
  console.log(`[2/4] Loaded ${lines.length} tasks from NDJSON`);

  const sample = LIMIT ? lines.slice(0, LIMIT) : lines;
  const tasksToWrite = [];
  const stats = {
    by_status: { todo: 0, doing: 0, blocked: 0, done: 0 },
    by_feature: {},
    by_priority: { high: 0, medium: 0, low: 0, critical: 0 },
  };

  for (const line of sample) {
    let task;
    try {
      task = JSON.parse(line);
    } catch (e) {
      continue;
    }

    const { feature_id, confidence } = classifyTask(task, labels);
    const status = task.status || 'todo';
    const priority = task.priority || 'medium';

    stats.by_status[status] = (stats.by_status[status] || 0) + 1;
    stats.by_feature[feature_id] = (stats.by_feature[feature_id] || 0) + 1;
    stats.by_priority[priority] = (stats.by_priority[priority] || 0) + 1;

    tasksToWrite.push({
      id: task.task_id || task.recommendation_id || `task_${Math.random().toString(36).slice(2, 10)}`,
      workspace_id: 'deeds-web-app',
      title: task.title || (task.description || '').split('\n')[0].slice(0, 120),
      description: task.description || '',
      status,
      priority,
      risk: task.risk || 'low',
      feature_id,
      feature_confidence: confidence,
      semantic_path: labels.labels[feature_id]?.semantic_path || [],
      source: 'opencode',
      source_ref: task.recommendation_id || task.task_id,
      related_file_paths: task.sourceRefs || [],
      qdrant_point_id: null,
      summary_llm: null,
      summary_model: null,
      cluster_id: task.cluster || null,
      centroid_id: null,
      agent_pickup_ready: false,
      created_at: task.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      mirror: {
        postgres_id: null,
        qdrant_point_id: null,
        redis_queue_key: null,
        langfuse_trace_id: null,
      },
    });
  }

  console.log(`[3/4] Classified ${tasksToWrite.length} tasks`);

  // Build index
  const tasks_by_status = { todo: [], doing: [], blocked: [], done: [] };
  for (const t of tasksToWrite) {
    const summary = { id: t.id, title: t.title, feature_id: t.feature_id, priority: t.priority };
    if (tasks_by_status[t.status]) tasks_by_status[t.status].push(summary);
  }

  const nextReady = tasksToWrite.find(t => t.status === 'todo' && t.priority === 'high') ||
                    tasksToWrite.find(t => t.status === 'todo');

  const indexDoc = {
    workspace_id: 'deeds-web-app',
    version: 1,
    updated_at: new Date().toISOString(),
    total_tasks: tasksToWrite.length,
    tasks_by_status,
    next_ready_task_id: nextReady?.id || null,
    feature_label_count: Object.keys(labels.labels).length,
    statistics: stats,
  };

  if (APPLY) {
    console.log('[4/4] Writing files...');
    const activeDir = path.join(TASKS_ROOT, 'active');
    if (!existsSync(activeDir)) mkdirSync(activeDir, { recursive: true });

    for (const t of tasksToWrite) {
      writeFileSync(path.join(activeDir, `${t.id}.json`), JSON.stringify(t, null, 2));
    }
    writeFileSync(path.join(TASKS_ROOT, '_index.json'), JSON.stringify(indexDoc, null, 2));

    console.log(`  ✓ Wrote ${tasksToWrite.length} task files to ${activeDir}/`);
    console.log(`  ✓ Wrote ${path.join(TASKS_ROOT, '_index.json')}`);
  } else {
    console.log('[4/4] DRY-RUN — no files written. Use --apply.');
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Statistics:');
  console.log(`  Total tasks:    ${tasksToWrite.length}`);
  console.log(`  By status:      ${JSON.stringify(stats.by_status)}`);
  console.log(`  By priority:    ${JSON.stringify(stats.by_priority)}`);
  console.log('  By feature_id:');
  for (const [fid, count] of Object.entries(stats.by_feature).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${fid.padEnd(24)} ${count}`);
  }
  console.log(`  Next ready:     ${nextReady?.id || '(none)'}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main();
