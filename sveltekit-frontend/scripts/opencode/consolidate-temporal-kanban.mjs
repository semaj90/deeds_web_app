#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const DRY_RUN = process.argv.includes('--dry-run');

const TASK_EVENTS = path.join(APP_ROOT, '.opencode', 'tasks', 'task-events.jsonl');
const TASK_STATE = path.join(APP_ROOT, '.opencode', 'tasks', 'task-state.json');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'temporal-kanban-consolidation.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'temporal-kanban-consolidation.md');

const CLOSURES = [
  ['task_concept_evidence_spine_backfill', 'Concept evidence is live on packet_keys and feature_ids; compatibility evidence_cards no longer block retrieval.', ['docs/reports/concept-evidence-spine-backfill-report.json']],
  ['task_route_runtime_packets_materialization', 'route_runtime_packets materialization and cache-hit coverage are operational.', ['docs/reports/runtime-coverage-audit.json']],
  ['task_feature_parent_join_repair', 'Feature/parent source-ref coverage passed the classified repair gate.', ['docs/reports/atlas-feature-parent-join-gap.json']],
  ['task_higher_hop_coverage_repair', 'Higher-hop identity, topology, glyph, Qdrant-lane, and Neo4j bridge validation are complete.', ['docs/reports/higher-hop-identity-ledger-validation.json', 'docs/reports/glyph-label-coverage-audit.json']],
  ['task_phase_3d_retrieval_telemetry', 'Replay breadth and timing are READY with one detailed packet-RPC timing row per query.', ['docs/reports/replay-telemetry-breadth-audit.json', 'docs/reports/hyperrag-timing-coverage-audit.json']],
].map(([task_id, reason, evidence_refs]) => ({ task_id, reason, evidence_refs }));

const NEW_TASKS = [
  {
    task_id: 'task_artifact_tiering_application',
    source_recommendation_key: 'artifact-tiering-application',
    title: 'Apply artifact tier classifications',
    description: 'Turn artifact-bloat evidence into bounded keep/compress/cold/regenerable/metadata-only decisions without deleting artifacts.',
    priority: 'HIGH',
    command: 'npm --prefix sveltekit-frontend run atlas:audit:artifact-bloat',
    feature_id: 'artifact-storage',
    source_refs: ['docs/reports/artifact-tiering-report.json', 'reports/parent-atlas-open-lanes-todo.md'],
  },
  {
    task_id: 'task_go_retrieval_runtime_recovery',
    source_recommendation_key: 'go-retrieval-runtime-recovery',
    title: 'Recover Go Retrieval runtime',
    description: 'Align the existing Go Retrieval HTTP/gRPC service with the live environment. Do not create a replacement service.',
    priority: 'HIGH',
    command: 'node scripts/atlas/audit-live-service-env.mjs',
    feature_id: 'retrieval',
    source_refs: ['services/go-retrieval-service', 'docs/reports/live-service-env-report.json'],
  },
  {
    task_id: 'task_cold_storage_restore_verification',
    source_recommendation_key: 'cold-storage-restore-verification',
    title: 'Verify cold-storage restore proofs',
    description: 'Validate manifests and sample restores before any artifact move or deletion.',
    priority: 'MEDIUM',
    command: 'npm --prefix sveltekit-frontend run atlas:cold:verify:test',
    feature_id: 'cold-storage',
    source_refs: ['sveltekit-frontend/scripts/atlas/verify-cold-storage-manifest.mjs'],
  },
  {
    task_id: 'task_parent_atlas_package_consolidation',
    source_recommendation_key: 'parent-atlas-package-consolidation',
    title: 'Finish packages/parent-atlas consolidation',
    description: 'Move proven gates, adapters, and pipeline entrypoints into the existing package without duplicating operational scripts.',
    priority: 'MEDIUM',
    command: 'npm --workspace @deeds/parent-atlas run build',
    feature_id: 'parent-atlas',
    source_refs: ['packages/parent-atlas/src', 'packages/parent-atlas/docs/atlas/phase-lanes.md'],
  },
  {
    task_id: 'task_parent_atlas_evaluation_gates',
    source_recommendation_key: 'parent-atlas-evaluation-gates',
    title: 'Run Parent Atlas evaluation and learning gates',
    description: 'Run replay, lineage, and final gates before adapter, PPO, TensorRT, or policy-router expansion.',
    priority: 'MEDIUM',
    command: 'npm --workspace @deeds/parent-atlas run gate:final',
    feature_id: 'evaluation',
    source_refs: ['packages/parent-atlas/src/gates', 'docs/reports/replay-telemetry-breadth-audit.json'],
  },
];

function hashId(...parts) {
  return `task_${createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12)}`;
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function walkMarkdown(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) out.push(fullPath);
    }
  }
  return out;
}

function classifyMarkdown(filePath) {
  const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
  if (rel === 'reports/parent-atlas-open-lanes-todo.md') return 'CANONICAL';
  if (rel === 'sveltekit-frontend/.opencode/tasks/task-state.md') return 'CANONICAL_DERIVED';
  if (/\/(archive|completed|session-history|vlm-history|production-history)\//i.test(`/${rel}`)) return 'HISTORICAL';
  if (/\/next_steps\/active\//i.test(`/${rel}`) || /\/docs\/open-lanes\//i.test(`/${rel}`)) return 'SUPPORTING_ACTIVE';
  if (/todo|next.steps|roadmap|plan|kanban|recommendation/i.test(path.basename(rel))) return 'SUPPORTING';
  return 'REFERENCE';
}

const state = readJson(TASK_STATE, { tasks: [] });
const tasksById = new Map((state.tasks ?? []).map((task) => [task.task_id, task]));
const existingEvents = readJsonl(TASK_EVENTS);
const eventIds = new Set(existingEvents.map((event) => event.event_id));
const runId = 'temporal-kanban-consolidation-20260619';
const now = new Date().toISOString();
const appended = [];

for (const closure of CLOSURES) {
  const task = tasksById.get(closure.task_id);
  if (!task || ['DONE', 'ARCHIVED'].includes(String(task.status).toUpperCase())) continue;
  const event = {
    event_id: hashId(runId, closure.task_id, 'DONE'),
    event_type: 'TASK_STATUS_CHANGED',
    created_at: now,
    run_id: runId,
    task_id: closure.task_id,
    previous_state: task.status,
    new_state: 'DONE',
    reason: closure.reason,
    evidence_refs: closure.evidence_refs,
  };
  if (!eventIds.has(event.event_id)) appended.push(event);
}

for (const task of NEW_TASKS) {
  if (tasksById.has(task.task_id)) continue;
  const event = {
    event_id: hashId(runId, task.task_id, 'CREATE'),
    event_type: 'TASK_CREATED',
    created_at: now,
    run_id: runId,
    status: 'TODO',
    parent_task_id: null,
    evidence_refs: task.source_refs,
    ...task,
  };
  if (!eventIds.has(event.event_id)) appended.push(event);
}

const markdownFiles = [
  ...walkMarkdown(path.join(REPO_ROOT, 'next_steps')),
  ...walkMarkdown(path.join(APP_ROOT, 'next_steps')),
  ...walkMarkdown(path.join(REPO_ROOT, 'docs', 'open-lanes')),
  path.join(REPO_ROOT, 'reports', 'parent-atlas-open-lanes-todo.md'),
  path.join(APP_ROOT, '.opencode', 'tasks', 'task-state.md'),
].filter((filePath, index, values) => fs.existsSync(filePath) && values.indexOf(filePath) === index);

const sourceInventory = markdownFiles.map((filePath) => {
  const stats = fs.statSync(filePath);
  const classification = classifyMarkdown(filePath);
  return {
    path: path.relative(REPO_ROOT, filePath).replace(/\\/g, '/'),
    classification,
    updatedAt: stats.mtime.toISOString(),
    bytes: stats.size,
    recommendedAction:
      classification.startsWith('CANONICAL')
        ? 'KEEP_CURRENT'
        : classification === 'HISTORICAL'
          ? 'KEEP_LINKED_HISTORY'
          : 'LINK_AS_EVIDENCE_ONLY',
  };
});
const classificationCounts = sourceInventory.reduce((counts, row) => {
  counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  return counts;
}, {});

if (!DRY_RUN && appended.length) {
  fs.mkdirSync(path.dirname(TASK_EVENTS), { recursive: true });
  fs.appendFileSync(TASK_EVENTS, `${appended.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
}

const report = {
  generatedAt: now,
  dryRun: DRY_RUN,
  canonicalBoard: 'reports/parent-atlas-open-lanes-todo.md',
  derivedTaskBoard: 'sveltekit-frontend/.opencode/tasks/task-state.md',
  existingTasks: state.tasks?.length ?? 0,
  eventsAppended: appended.length,
  closureEvents: appended.filter((event) => event.event_type === 'TASK_STATUS_CHANGED').length,
  taskCreateEvents: appended.filter((event) => event.event_type === 'TASK_CREATED').length,
  appended,
  sourceInventoryCount: sourceInventory.length,
  classificationCounts,
  sourceInventory,
};

if (!DRY_RUN) {
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(REPORT_MD, `# Temporal Kanban Consolidation

- Generated: ${report.generatedAt}
- Events appended: ${report.eventsAppended}
- Tasks closed: ${report.closureEvents}
- Tasks created: ${report.taskCreateEvents}
- Markdown sources inventoried: ${report.sourceInventoryCount}
- Canonical board: \`${report.canonicalBoard}\`
- Derived task state: \`${report.derivedTaskBoard}\`

## Source Classification

${Object.entries(classificationCounts).map(([name, count]) => `- ${name}: ${count}`).join('\n')}

Historical and supporting Markdown remains evidence-only. No source file was
moved or deleted.
`);
}

console.log(JSON.stringify({
  ok: true,
  dryRun: DRY_RUN,
  eventsAppended: appended.length,
  closures: report.closureEvents,
  created: report.taskCreateEvents,
  markdownSources: report.sourceInventoryCount,
  classificationCounts,
}, null, 2));
