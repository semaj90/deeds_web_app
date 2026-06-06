#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const OPENCODE_DIR = path.join(ROOT, '.opencode');
const REGISTRY_DIR = path.join(OPENCODE_DIR, 'registry');
const FINDING_PATH = path.join(REGISTRY_DIR, 'finding_registry.jsonl');
const RECOMMENDATION_PATH = path.join(REGISTRY_DIR, 'recommendation_registry.jsonl');
const TASK_PATH = path.join(REGISTRY_DIR, 'task_registry.jsonl');
const HISTORY_PATH = path.join(REGISTRY_DIR, 'task_history_packets.jsonl');
const TASK_STATE_JSON = path.join(REGISTRY_DIR, 'task_state.json');
const TASK_STATE_MD = path.join(REGISTRY_DIR, 'task_state.md');
const OUT_JSON = path.join(ROOT, 'docs', 'reports', 'temporal-task-registry-report.json');
const OUT_MD = path.join(ROOT, 'docs', 'reports', 'temporal-task-registry-report.md');

const DRY_RUN = process.argv.includes('--dry-run');

const RECOMMENDATION_SOURCES = [
  path.join(OPENCODE_DIR, 'recommendations', 'recommendations.json'),
  path.join(ROOT, 'docs', 'graph', 'recommendations.json'),
];

const EVIDENCE_FILES = {
  engram: path.join(ROOT, 'docs', 'reports', 'engram-adapter-decision-report.json'),
  overlay: path.join(ROOT, 'docs', 'reports', 'parent-atlas-overlay-sync-report.json'),
  postgresMirrors: path.join(ROOT, 'docs', 'reports', 'postgres-contract-mirrors-report.json'),
  featureLineage: path.join(ROOT, 'docs', 'reports', 'feature-lineage-report.json'),
  runtimeDensity: path.join(ROOT, 'docs', 'reports', 'runtime-packet-density-report.json'),
  somCoverage: path.join(ROOT, 'docs', 'reports', 'som-coordinate-coverage-report.json'),
  openLanes: path.join(ROOT, 'reports', 'parent-atlas-open-lanes-todo.md'),
  opencode: path.join(ROOT, 'opencode.json'),
};

function hashId(prefix, ...parts) {
  const digest = crypto.createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 12);
  return `${prefix}-${digest}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableSlug(value) {
  return normalizeText(value).replace(/\s+/g, '_');
}

function stableFeatureSegment(value) {
  return String(value ?? 'general')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function deriveFeatureId(title, type) {
  const text = normalizeText(`${type ?? ''} ${title ?? ''}`);
  if (/graph missing neighborhood/.test(text)) return 'graphify';
  if (/retrieval low context density/.test(text)) return 'retrieval';
  if (/feature registry reconciliation|overlay sync/.test(text)) return 'feature-registry';
  if (/task semantic packets|postgres contract|sql mirror/.test(text)) return 'postgres-contract';
  if (/command mapping|mcp allowlist/.test(text)) return 'mcp';
  if (/synthetic evidence/.test(text)) return 'evidence';
  if (/cluster visualization|4d manifold/.test(text)) return 'graphify';
  if (/trust tier/.test(text)) return 'retrieval';
  if (/som coordinate/.test(text)) return 'som';
  if (/engram/.test(text)) return 'engram';
  if (/parent atlas/.test(text)) return 'parent-atlas';
  return 'general';
}

function deriveStableKey(item) {
  const explicit = item?.stable_key ?? item?.stableKey;
  if (explicit) return explicit;
  const feature = stableFeatureSegment(item?.feature_id ?? item?.featureId ?? deriveFeatureId(item?.title, item?.source));
  const title = stableSlug(item?.title ?? item?.description ?? item?.source_recommendation_id ?? item?.task_id ?? 'untitled');
  return `${feature}:${title}`;
}

function priorityFromSeverity(severity) {
  const sev = String(severity ?? '').toLowerCase();
  if (sev.includes('high')) return 'P1';
  if (sev.includes('medium')) return 'P2';
  if (sev.includes('low')) return 'P3';
  return 'P2';
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(require('node:fs').readFileSync(filePath, 'utf8'));
}

async function readJsonAsync(filePath) {
  if (!existsSync(filePath)) return null;
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

async function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const text = await fs.readFile(filePath, 'utf8');
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readText(filePath) {
  if (!existsSync(filePath)) return '';
  return fs.readFile(filePath, 'utf8');
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function keyBy(obj, fields) {
  return fields.map((field) => obj?.[field]).filter(Boolean).join('|');
}

function uniqByKey(items, fields) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyBy(item, fields);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function appendIfMissing(existing, incoming, keyFields) {
  const seen = new Set(existing.map((item) => keyBy(item, keyFields)));
  return incoming.filter((item) => {
    const key = keyBy(item, keyFields);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function taskIdentity(task) {
  return task?.stable_key ?? task?.stableKey ?? deriveStableKey(task) ?? task?.task_id ?? task?.id ?? '';
}

function appendTasksIfMissing(existing, incoming) {
  const seen = new Set(existing.map((item) => taskIdentity(item)));
  return incoming.filter((item) => {
    const key = taskIdentity(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadFindingsFromRecommendations(recPayload, sourceLabel) {
  const items = [];
  const runId = recPayload?.generatedAt ?? nowIso();
  const clusters = recPayload?.clusters ?? {};
  const top10 = recPayload?.top10 ?? [];
  const recs = Array.isArray(top10) && top10.length > 0
    ? top10
    : Object.values(clusters).flat();

  for (const rec of recs) {
    items.push({
      id: hashId('FIND', sourceLabel, rec.type ?? rec.category ?? 'recommendation', rec.title ?? ''),
      created_at: nowIso(),
      run_id: runId,
      source: sourceLabel,
      finding_kind: 'recommendation',
      title: rec.title ?? rec.type ?? 'untitled recommendation',
      description: rec.why ?? rec.description ?? '',
      severity: String(rec.priority ?? rec.severity ?? 'medium').toUpperCase(),
      evidence_refs: rec.sourceRefs ?? rec.files ?? [],
      status: 'NEW',
      related_recommendation_id: null,
      related_task_id: null,
      stable_key: deriveStableKey({
        title: rec.title ?? rec.type ?? 'untitled recommendation',
        feature_id: deriveFeatureId(rec.title ?? rec.type ?? 'untitled recommendation', rec.type ?? rec.category ?? 'recommendation'),
        source: sourceLabel,
      }),
    });
  }
  return items;
}

function manualSeedFindings() {
  const seeds = [
    {
      source: 'report:postgres-contract-mirrors',
      finding_kind: 'audit',
      title: 'task_semantic_packets manual SQL mirror drift',
      description: 'Manual SQL mirror drift should stay in sync with the live Postgres contract mirror.',
      severity: 'MEDIUM',
      evidence_refs: [EVIDENCE_FILES.postgresMirrors],
      feature_id: 'postgres-contract',
      stable_key: 'postgres-contract:task_semantic_packets_manual_sql_mirror_drift',
    },
    {
      source: 'report:feature-registry-overlay',
      finding_kind: 'audit',
      title: 'Feature Registry reconciliation',
      description: 'Root overlay and app registry are not semantically aligned and need an explicit reconcile lane.',
      severity: 'MEDIUM',
      evidence_refs: [EVIDENCE_FILES.overlay],
      feature_id: 'feature-registry',
      stable_key: 'feature-registry:feature_registry_reconciliation',
    },
    {
      source: 'opencode-config',
      finding_kind: 'config',
      title: 'Command Mapping → MCP allowlist',
      description: 'The OpenCode routing layer still needs a durable allowlist contract for command mapping.',
      severity: 'MEDIUM',
      evidence_refs: [EVIDENCE_FILES.opencode],
      feature_id: 'mcp',
      stable_key: 'mcp:command_mapping_mcp_allowlist',
    },
    {
      source: 'report:som-coordinate-coverage',
      finding_kind: 'audit',
      title: 'Cluster Visualization (4D manifold aliases)',
      description: 'SOM coordinate coverage is recoverable from cluster IDs; visualization aliases should stay separate from recompute.',
      severity: 'LOW',
      evidence_refs: [EVIDENCE_FILES.somCoverage],
      feature_id: 'som',
      stable_key: 'som:cluster_visualization_4d_manifold_aliases',
    },
    {
      source: 'report:runtime-packet-density',
      finding_kind: 'audit',
      title: 'Trust-tier promotion/demotion UI',
      description: 'Runtime packet density still needs a visible promotion/demotion surface for unfinished work.',
      severity: 'LOW',
      evidence_refs: [EVIDENCE_FILES.runtimeDensity, EVIDENCE_FILES.featureLineage],
      feature_id: 'retrieval',
      stable_key: 'retrieval:trust_tier_promotion_demotion_ui',
    },
    {
      source: 'report:open-lanes',
      finding_kind: 'todo',
      title: 'Synthetic Evidence concept cards',
      description: 'Generate concept cards from current reports so the evidence trail stays searchable over time.',
      severity: 'MEDIUM',
      evidence_refs: [EVIDENCE_FILES.openLanes],
      feature_id: 'evidence',
      stable_key: 'evidence:synthetic_evidence_concept_cards',
    },
  ];

  return seeds.map((seed) => ({
    id: hashId('FIND', seed.source, seed.title),
    created_at: nowIso(),
    run_id: nowIso(),
    source: seed.source,
    finding_kind: seed.finding_kind,
    title: seed.title,
    description: seed.description,
    severity: seed.severity,
    evidence_refs: seed.evidence_refs,
    status: 'NEW',
    related_recommendation_id: null,
    related_task_id: null,
    feature_id: seed.feature_id,
    stable_key: seed.stable_key ?? deriveStableKey(seed),
  }));
}

function promoteToRecommendation(finding) {
  const recommendationId = hashId('REC', finding.source, finding.title);
  const stableKey = deriveStableKey(finding);
  return {
    id: recommendationId,
    created_at: finding.created_at,
    source: finding.source,
    run_id: finding.run_id,
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    evidence_refs: finding.evidence_refs ?? [],
    status: 'NEW',
    converted_to_task_id: null,
    embedding_id: null,
    feature_id: finding.feature_id ?? deriveFeatureId(finding.title, finding.source),
    stable_key: stableKey,
  };
}

function shouldPromoteToTask(rec) {
  const t = normalizeText(rec.title);
  return (
    /graph missing neighborhood/.test(t) ||
    /retrieval low context density/.test(t) ||
    /feature registry reconciliation/.test(t) ||
    /task semantic packets manual sql mirror drift/.test(t) ||
    /command mapping mcp allowlist/.test(t) ||
    /synthetic evidence concept cards/.test(t) ||
    /cluster visualization 4d manifold aliases/.test(t) ||
    /trust tier promotion demotion ui/.test(t) ||
    /engram/.test(t)
  );
}

function promoteToTask(rec) {
  const taskId = hashId('TASK', rec.id, rec.title);
  const stableKey = deriveStableKey(rec);
  return {
    task_id: taskId,
    created_at: nowIso(),
    updated_at: nowIso(),
    source_recommendation_id: rec.id,
    title: rec.title,
    description: rec.description,
    priority: priorityFromSeverity(rec.severity),
    status: 'TODO',
    parent_task_id: null,
    feature_id: rec.feature_id ?? deriveFeatureId(rec.title, rec.source),
    source_refs: rec.evidence_refs ?? [],
    stable_key: stableKey,
  };
}

function buildHistoryPacket(task, action, previousState, newState, runId, evidenceRefs, stableKey) {
  return {
    id: hashId('HIST', task.task_id, action, runId, task.title),
    task_id: task.task_id,
    stable_key: stableKey ?? task.stable_key ?? deriveStableKey(task),
    timestamp: nowIso(),
    action,
    previous_state: previousState,
    new_state: newState,
    operator: 'temporal-task-registry-sync',
    run_id: runId,
    evidence_refs: evidenceRefs ?? [],
  };
}

function renderMarkdown(summary) {
  const lines = [];
  lines.push('# Temporal Task Registry');
  lines.push('');
  lines.push('## Layers');
  lines.push('');
  lines.push('- Recommendation inbox: append-only, never overwritten.');
  lines.push('- Task registry: persistent snapshots of promoted work.');
  lines.push('- Task history packets: every transition becomes a packet.');
  lines.push('');
  lines.push('## Run');
  lines.push('');
  lines.push(`- **runId**: ${summary.runId}`);
  lines.push(`- **findingsAppended**: ${summary.findingsAppended}`);
  lines.push(`- **recommendationsAppended**: ${summary.recommendationsAppended}`);
  lines.push(`- **tasksAppended**: ${summary.tasksAppended}`);
  lines.push(`- **historyPacketsAppended**: ${summary.historyPacketsAppended}`);
  lines.push(`- **stateVisibleTasks**: ${summary.stateVisibleTasks}`);
  lines.push(`- **stateArchivedTasks**: ${summary.stateArchivedTasks}`);
  lines.push(`- **promotedRecommendations**: ${summary.promotedRecommendations}`);
  lines.push('');
  lines.push('## Immediate Todo Seeds');
  lines.push('');
  for (const seed of summary.taskSamples) {
    lines.push(`- [${seed.priority}] ${seed.title} (${seed.status})`);
  }
  lines.push('');
  lines.push('## Task State');
  lines.push('');
  lines.push(`- **dedupe key**: stable_key`);
  lines.push(`- **visible tasks**: ${summary.stateVisibleTasks}`);
  lines.push(`- **archived tasks**: ${summary.stateArchivedTasks}`);
  lines.push('');
  lines.push('| stable_key | status | priority | seen_count | title |');
  lines.push('| --- | --- | --- | ---: | --- |');
  for (const row of summary.visibleTaskSamples) {
    lines.push(`| \`${row.stable_key}\` | ${row.status} | ${row.priority} | ${row.seen_count} | ${row.title.replace(/\|/g, '\\|')} |`);
  }
  if (summary.visibleTaskSamples.length === 0) {
    lines.push('| _none_ | _none_ | _none_ | 0 | No visible tasks |');
  }
  lines.push('');
  lines.push('## Registry Paths');
  lines.push('');
  lines.push(`- findings: \`${path.relative(ROOT, FINDING_PATH)}\``);
  lines.push(`- recommendations: \`${path.relative(ROOT, RECOMMENDATION_PATH)}\``);
  lines.push(`- tasks: \`${path.relative(ROOT, TASK_PATH)}\``);
  lines.push(`- history: \`${path.relative(ROOT, HISTORY_PATH)}\``);
  lines.push(`- task_state: \`${path.relative(ROOT, TASK_STATE_JSON)}\``);
  return lines.join('\n');
}

async function loadCurrentRecommendations() {
  for (const file of RECOMMENDATION_SOURCES) {
    if (!existsSync(file)) continue;
    const parsed = await readJsonAsync(file);
    if (parsed && typeof parsed === 'object') return { sourceFile: file, payload: parsed };
  }
  return { sourceFile: null, payload: null };
}

function buildTaskState(taskRows, historyRows) {
  const states = new Map();
  const taskById = new Map();
  const taskByStableKey = new Map();

  for (const task of taskRows) {
    const stableKey = deriveStableKey(task);
    const baseStatus = String(task.status ?? 'TODO').toUpperCase();
    const current = states.get(stableKey) ?? {
      stable_key: stableKey,
      task_ids: [],
      source_recommendation_id: task.source_recommendation_id ?? null,
      title: task.title ?? 'untitled task',
      description: task.description ?? '',
      priority: task.priority ?? 'P2',
      status: baseStatus,
      feature_id: task.feature_id ?? deriveFeatureId(task.title, task.source ?? 'task'),
      source_refs: task.source_refs ?? [],
      created_at: task.created_at ?? null,
      updated_at: task.updated_at ?? null,
      last_seen_at: null,
      seen_count: 0,
      event_count: 0,
      last_action: null,
      last_run_id: null,
      last_event_at: null,
      archived_at: null,
      done_at: null,
      latest_task_id: task.task_id ?? null,
      latest_task_status: baseStatus,
      latest_task_updated_at: task.updated_at ?? task.created_at ?? null,
      seen_runs: new Set(),
    };

    if (task.task_id && !current.task_ids.includes(task.task_id)) {
      current.task_ids.push(task.task_id);
    }
    current.latest_task_id = task.task_id ?? current.latest_task_id;
    current.latest_task_status = baseStatus;
    current.latest_task_updated_at = task.updated_at ?? task.created_at ?? current.latest_task_updated_at;
    current.title = task.title ?? current.title;
    current.description = task.description ?? current.description;
    current.priority = task.priority ?? current.priority;
    current.feature_id = task.feature_id ?? current.feature_id;
    current.source_recommendation_id = task.source_recommendation_id ?? current.source_recommendation_id;
    current.source_refs = task.source_refs ?? current.source_refs;
    current.status = baseStatus === 'ARCHIVED' ? 'ARCHIVED' : current.status;
    states.set(stableKey, current);
    if (task.task_id) taskById.set(task.task_id, task);
    taskByStableKey.set(stableKey, task);
  }

  for (const packet of historyRows) {
    const task = taskById.get(packet.task_id) ?? null;
    const stableKey = deriveStableKey(packet.stable_key ? packet : task ?? packet);
    const state = states.get(stableKey) ?? {
      stable_key: stableKey,
      task_ids: task?.task_id ? [task.task_id] : [],
      source_recommendation_id: task?.source_recommendation_id ?? null,
      title: task?.title ?? packet?.title ?? 'untitled task',
      description: task?.description ?? packet?.description ?? '',
      priority: task?.priority ?? 'P2',
      status: String(task?.status ?? packet?.new_state?.status ?? 'TODO').toUpperCase(),
      feature_id: task?.feature_id ?? deriveFeatureId(task?.title ?? packet?.task_id, task?.source ?? packet?.operator ?? 'task'),
      source_refs: task?.source_refs ?? packet?.evidence_refs ?? [],
      created_at: task?.created_at ?? null,
      updated_at: task?.updated_at ?? null,
      last_seen_at: null,
      seen_count: 0,
      event_count: 0,
      last_action: null,
      last_run_id: null,
      last_event_at: null,
      archived_at: null,
      done_at: null,
      latest_task_id: task?.task_id ?? null,
      latest_task_status: String(task?.status ?? 'TODO').toUpperCase(),
      latest_task_updated_at: task?.updated_at ?? task?.created_at ?? null,
      seen_runs: new Set(),
    };

    state.event_count += 1;
    state.last_event_at = packet.timestamp ?? state.last_event_at;
    state.last_action = packet.action ?? state.last_action;
    state.last_run_id = packet.run_id ?? state.last_run_id;
    state.last_seen_at = packet.timestamp ?? state.last_seen_at;
    if (packet.run_id && !state.seen_runs.has(packet.run_id)) {
      state.seen_runs.add(packet.run_id);
      state.seen_count += 1;
    }
    if (packet.new_state?.status) {
      const status = String(packet.new_state.status).toUpperCase();
      state.status = status;
      state.latest_task_status = status;
      if (status === 'DONE') state.done_at = packet.timestamp ?? state.done_at;
      if (status === 'ARCHIVED') state.archived_at = packet.timestamp ?? state.archived_at;
    } else if (packet.action === 'DONE') {
      state.status = 'DONE';
      state.latest_task_status = 'DONE';
      state.done_at = packet.timestamp ?? state.done_at;
    } else if (packet.action === 'ARCHIVE') {
      state.status = 'ARCHIVED';
      state.latest_task_status = 'ARCHIVED';
      state.archived_at = packet.timestamp ?? state.archived_at;
    }
    if (task?.task_id && !state.task_ids.includes(task.task_id)) {
      state.task_ids.push(task.task_id);
      state.latest_task_id = task.task_id;
    }
    if (task) {
      state.title = task.title ?? state.title;
      state.description = task.description ?? state.description;
      state.priority = task.priority ?? state.priority;
      state.feature_id = task.feature_id ?? state.feature_id;
      state.source_recommendation_id = task.source_recommendation_id ?? state.source_recommendation_id;
      state.source_refs = task.source_refs ?? state.source_refs;
    }
    states.set(stableKey, state);
  }

  const flattened = [...states.values()].map((state) => {
    const visible = String(state.status ?? 'TODO').toUpperCase() !== 'ARCHIVED';
    return {
      stable_key: state.stable_key,
      task_ids: state.task_ids.filter(Boolean),
      latest_task_id: state.latest_task_id,
      source_recommendation_id: state.source_recommendation_id,
      title: state.title,
      description: state.description,
      priority: state.priority,
      status: String(state.status ?? 'TODO').toUpperCase(),
      feature_id: state.feature_id,
      source_refs: state.source_refs ?? [],
      created_at: state.created_at,
      updated_at: state.updated_at,
      last_seen_at: state.last_seen_at,
      seen_count: state.seen_count,
      event_count: state.event_count,
      last_action: state.last_action,
      last_run_id: state.last_run_id,
      last_event_at: state.last_event_at,
      archived_at: state.archived_at,
      done_at: state.done_at,
      visible,
    };
  });

  const visibleTasks = flattened.filter((row) => row.visible).sort((a, b) => {
    if (a.priority !== b.priority) return String(a.priority).localeCompare(String(b.priority));
    return String(a.title).localeCompare(String(b.title));
  });
  const archivedTasks = flattened.filter((row) => !row.visible).sort((a, b) => String(a.title).localeCompare(String(b.title)));

  return {
    visibleTasks,
    archivedTasks,
    byStableKey: flattened,
  };
}

async function main() {
  const runId = nowIso();
  const currentRec = await loadCurrentRecommendations();
  const recommendationFindings = currentRec.payload
    ? loadFindingsFromRecommendations(currentRec.payload, path.relative(ROOT, currentRec.sourceFile))
    : [];
  const manualFindings = manualSeedFindings();
  const allFindings = uniqByKey([...recommendationFindings, ...manualFindings], ['title', 'source']);
  const recommendationEntries = allFindings.map((finding) => promoteToRecommendation(finding));
  const promotedRecommendations = recommendationEntries.filter(shouldPromoteToTask);

  const existingFindings = await readJsonl(FINDING_PATH);
  const existingRecs = await readJsonl(RECOMMENDATION_PATH);
  const existingTasks = await readJsonl(TASK_PATH);
  const existingHistory = await readJsonl(HISTORY_PATH);

  const newFindings = appendIfMissing(existingFindings, allFindings, ['id']);
  const newRecommendations = appendIfMissing(existingRecs, recommendationEntries, ['id']);
  const existingTasksByStableKey = new Map(existingTasks.map((task) => [deriveStableKey(task), task]));
  const taskEntries = [];
  const historyPackets = [];

  for (const rec of promotedRecommendations) {
    const stableKey = deriveStableKey(rec);
    const existingTask = existingTasksByStableKey.get(stableKey) ?? null;
    if (existingTask) {
      historyPackets.push(
        buildHistoryPacket(
          existingTask,
          'SEEN',
          { status: String(existingTask.status ?? 'TODO').toUpperCase() },
          { status: String(existingTask.status ?? 'TODO').toUpperCase() },
          runId,
          existingTask.source_refs,
          stableKey,
        ),
      );
      continue;
    }

    const task = promoteToTask(rec);
    taskEntries.push(task);
    historyPackets.push(
      buildHistoryPacket(task, 'CREATE', null, { status: task.status }, runId, task.source_refs, stableKey),
      buildHistoryPacket(task, 'PROMOTE', { status: 'NEW' }, { status: task.status }, runId, task.source_refs, stableKey),
    );
  }

  const newTasks = appendTasksIfMissing(existingTasks, taskEntries);
  const newHistory = appendIfMissing(existingHistory, historyPackets, ['id']);
  const taskState = buildTaskState([...existingTasks, ...newTasks], [...existingHistory, ...newHistory]);

  const summary = {
    runId,
    sourceRecommendationFile: currentRec.sourceFile,
    findingsAppended: newFindings.length,
    recommendationsAppended: newRecommendations.length,
    tasksAppended: newTasks.length,
    historyPacketsAppended: newHistory.length,
    promotedRecommendations: promotedRecommendations.length,
    taskSamples: newTasks.slice(0, 8),
    stateVisibleTasks: taskState.visibleTasks.length,
    stateArchivedTasks: taskState.archivedTasks.length,
    visibleTaskSamples: taskState.visibleTasks.slice(0, 12),
    findingCount: existingFindings.length + newFindings.length,
    recommendationCount: existingRecs.length + newRecommendations.length,
    taskCount: existingTasks.length + newTasks.length,
    historyCount: existingHistory.length + newHistory.length,
  };

  const report = {
    generatedAt: runId,
    sourceRecommendationFile: currentRec.sourceFile,
    registryPaths: {
      findings: path.relative(ROOT, FINDING_PATH),
      recommendations: path.relative(ROOT, RECOMMENDATION_PATH),
      tasks: path.relative(ROOT, TASK_PATH),
      history: path.relative(ROOT, HISTORY_PATH),
    },
    counts: {
      findings: summary.findingCount,
      recommendations: summary.recommendationCount,
      tasks: summary.taskCount,
      historyPackets: summary.historyCount,
      visibleTasks: summary.stateVisibleTasks,
      archivedTasks: summary.stateArchivedTasks,
    },
    appended: {
      findings: newFindings.length,
      recommendations: newRecommendations.length,
      tasks: newTasks.length,
      historyPackets: newHistory.length,
    },
    summary,
    taskState,
  };

  await ensureDir(OUT_JSON);
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUT_MD, renderMarkdown(summary), 'utf8');
  await ensureDir(TASK_STATE_JSON);
  await fs.writeFile(TASK_STATE_JSON, JSON.stringify({
    generatedAt: runId,
    dedupeKey: 'stable_key',
    sourceFiles: {
      findings: path.relative(ROOT, FINDING_PATH),
      recommendations: path.relative(ROOT, RECOMMENDATION_PATH),
      tasks: path.relative(ROOT, TASK_PATH),
      history: path.relative(ROOT, HISTORY_PATH),
    },
    counts: {
      visibleTasks: taskState.visibleTasks.length,
      archivedTasks: taskState.archivedTasks.length,
      totalTasks: taskState.byStableKey.length,
    },
    visibleTasks: taskState.visibleTasks,
    archivedTasks: taskState.archivedTasks,
  }, null, 2) + '\n', 'utf8');
  await fs.writeFile(TASK_STATE_MD, [
    '# Temporal Task State',
    '',
    `- **generatedAt**: ${runId}`,
    `- **dedupeKey**: stable_key`,
    `- **visibleTasks**: ${taskState.visibleTasks.length}`,
    `- **archivedTasks**: ${taskState.archivedTasks.length}`,
    '',
    '## Visible Tasks',
    '',
    '| stable_key | status | priority | seen_count | last_seen_at | title |',
    '| --- | --- | --- | ---: | --- | --- |',
    ...(taskState.visibleTasks.length > 0
      ? taskState.visibleTasks.map((row) => `| \`${row.stable_key}\` | ${row.status} | ${row.priority} | ${row.seen_count} | ${row.last_seen_at ?? ''} | ${String(row.title).replace(/\|/g, '\\|')} |`)
      : ['| _none_ | _none_ | _none_ | 0 |  | No visible tasks |']),
    '',
    '## Archived Tasks',
    '',
    taskState.archivedTasks.length > 0
      ? taskState.archivedTasks.map((row) => `- \`${row.stable_key}\` (${row.status}) ${row.title}`).join('\n')
      : '_none_',
    '',
  ].join('\n'), 'utf8');

  if (!DRY_RUN) {
    await ensureDir(FINDING_PATH);
    if (newFindings.length > 0) await fs.appendFile(FINDING_PATH, newFindings.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
    if (newRecommendations.length > 0) await fs.appendFile(RECOMMENDATION_PATH, newRecommendations.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
    if (newTasks.length > 0) await fs.appendFile(TASK_PATH, newTasks.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
    if (newHistory.length > 0) await fs.appendFile(HISTORY_PATH, newHistory.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  }

  console.log(JSON.stringify({ ok: true, dryRun: DRY_RUN, ...summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
