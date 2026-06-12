#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT = path.resolve(__dirname, '..', '..');

export const PATHS = {
  opencodeDir: path.join(ROOT, '.opencode'),
  recommendationsDir: path.join(ROOT, '.opencode', 'recommendations'),
  tasksDir: path.join(ROOT, '.opencode', 'tasks'),
  recommendationSnapshotJson: path.join(ROOT, '.opencode', 'recommendations', 'recommendations.json'),
  recommendationSnapshotMd: path.join(ROOT, '.opencode', 'recommendations', 'recommendations.md'),
  recommendationEvents: path.join(ROOT, '.opencode', 'recommendations', 'recommendation-events.jsonl'),
  taskEvents: path.join(ROOT, '.opencode', 'tasks', 'task-events.jsonl'),
  taskStateJson: path.join(ROOT, '.opencode', 'tasks', 'task-state.json'),
  taskStateMd: path.join(ROOT, '.opencode', 'tasks', 'task-state.md'),
  startupContext: path.join(ROOT, '.opencode', 'startup-context.json'),
  graphRecommendationsJson: path.join(ROOT, 'docs', 'graph', 'recommendations.json'),
  graphRecommendationsMd: path.join(ROOT, 'docs', 'graph', 'recommendations.md'),
  temporalReportJson: path.join(ROOT, 'docs', 'reports', 'temporal-task-registry-report.json'),
  temporalReportMd: path.join(ROOT, 'docs', 'reports', 'temporal-task-registry-report.md'),
  agentEnvironmentJson: path.join(ROOT, 'docs', 'reports', 'opencode-agent-environment-report.json'),
  agentEnvironmentMd: path.join(ROOT, 'docs', 'reports', 'opencode-agent-environment-report.md'),
};

const ACTIVE_LANE_RECOMMENDATION_KEY = '27_api_route_handlers_lack_auth_guards';

function removeDiacritics(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function nowIso() {
  return new Date().toISOString();
}

export function hashId(prefix, ...parts) {
  const digest = crypto
    .createHash('sha1')
    .update(parts.filter(Boolean).join('|'))
    .digest('hex')
    .slice(0, 12);
  return `${prefix}_${digest}`;
}

export function normalizeText(value) {
  return removeDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(value) {
  return normalizeText(value).replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

export function priorityFromSeverity(severity) {
  const sev = normalizeText(severity);
  if (sev.includes('high')) return 'HIGH';
  if (sev.includes('medium')) return 'MEDIUM';
  if (sev.includes('low')) return 'LOW';
  return 'MEDIUM';
}

export async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function readText(filePath) {
  if (!existsSync(filePath)) return null;
  return fs.readFile(filePath, 'utf8');
}

export async function writeJson(filePath, value) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function writeText(filePath, text) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, text, 'utf8');
}

export async function appendJsonl(filePath, rows) {
  const items = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!items.length) return 0;
  await ensureDir(filePath);
  const payload = items.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await fs.appendFile(filePath, payload, 'utf8');
  return items.length;
}

export async function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const text = await fs.readFile(filePath, 'utf8');
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch (err) {
      rows.push({ __parse_error__: true, __line__: index + 1, __raw__: trimmed, __error__: String(err?.message ?? err) });
    }
  }
  return rows;
}

function collectSnapshotRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.recommendations)) return payload.recommendations;
  if (Array.isArray(payload.top10)) return payload.top10;
  if (payload.clusters && typeof payload.clusters === 'object') {
    return Object.values(payload.clusters).flatMap((cluster) => (Array.isArray(cluster) ? cluster : []));
  }
  return [];
}

function itemToRecommendationRow(item, sourceLabel, sourceFile) {
  const recommendationKey = item.recommendation_key ?? item.type ?? item.key ?? slugify(item.title ?? item.name ?? 'recommendation');
  const severity = priorityFromSeverity(item.severity ?? item.priority ?? item.rank ?? 'medium');
  const title = item.title ?? item.name ?? recommendationKey;
  const command = item.command ?? item.next_command ?? item.nextCommand ?? null;
  const description = item.description ?? item.why ?? item.reason ?? item.summary ?? '';
  const sourceRefs = Array.isArray(item.sourceRefs)
    ? item.sourceRefs
    : Array.isArray(item.source_refs)
      ? item.source_refs
      : Array.isArray(item.files)
        ? item.files
        : [];
  const evidenceRefs = Array.isArray(item.evidence_refs)
    ? item.evidence_refs
    : sourceFile
      ? [path.relative(ROOT, sourceFile)]
      : sourceRefs;
  return {
    recommendation_key: recommendationKey,
    severity,
    title,
    description,
    command,
    source: item.source ?? sourceLabel,
    cluster: item.cluster ?? null,
    feature_id: item.feature_id ?? deriveFeatureId(title, recommendationKey),
    source_refs: sourceRefs,
    evidence_refs: evidenceRefs,
    status: item.status ?? 'NEW',
  };
}

export async function loadRecommendationSnapshot() {
  const candidates = [PATHS.recommendationSnapshotJson, PATHS.graphRecommendationsJson];
  const scored = [];
  for (const sourceFile of candidates) {
    if (!existsSync(sourceFile)) continue;
    const payload = await readJson(sourceFile);
    if (!payload || typeof payload !== 'object') continue;
    const stat = await fs.stat(sourceFile);
    const sourceMd = sourceFile.endsWith('.json') ? sourceFile.replace(/\.json$/, '.md') : null;
    scored.push({
      sourceFile,
      sourceMd: sourceMd && existsSync(sourceMd) ? sourceMd : null,
      payload,
      mtimeMs: stat.mtimeMs,
    });
  }
  if (scored.length) {
    scored.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return scored[0];
  }
  return { sourceFile: null, sourceMd: null, payload: null };
}

export function deriveFeatureId(title, type) {
  const text = normalizeText(`${type ?? ''} ${title ?? ''}`);
  if (/graph missing neighborhood/.test(text)) return 'graphify';
  if (/retrieval low context density/.test(text)) return 'retrieval';
  if (/feature registry reconciliation|overlay mismatch|overlay sync/.test(text)) return 'feature-registry';
  if (/task semantic packets|postgres contract|sql mirror/.test(text)) return 'postgres-contract';
  if (/command mapping|mcp allowlist/.test(text)) return 'mcp';
  if (/synthetic evidence/.test(text)) return 'evidence';
  if (/cluster visualization|4d manifold/.test(text)) return 'graphify';
  if (/trust tier/.test(text)) return 'retrieval';
  if (/som coordinate/.test(text)) return 'som';
  if (/engram/.test(text)) return 'engram';
  if (/parent atlas/.test(text)) return 'parent-atlas';
  if (/feature id derivation/.test(text)) return 'feature-lineage';
  return 'general';
}

export function normalizeSnapshotRecommendations(payload, sourceFile) {
  const rows = collectSnapshotRows(payload).map((item) => itemToRecommendationRow(item, path.relative(ROOT, sourceFile ?? PATHS.graphRecommendationsJson), sourceFile));
  return uniqRecommendations([...rows, ...seedRecommendations()]);
}

function readOptionalJson(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function pctNumber(value) {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function seedGates() {
  const runtimeDensity = readOptionalJson(path.join('docs', 'reports', 'runtime-packet-density-report.json'));
  const featureLineage = readOptionalJson(path.join('docs', 'reports', 'feature-lineage-report.json'));
  const somCoverage = readOptionalJson(path.join('docs', 'reports', 'som-coordinate-coverage-report.json'));
  const productionNoSom = readOptionalJson(path.join('..', 'docs', 'reports', 'production-qdrant-no-som-report.json'));
  const postgresMirrors = readOptionalJson(path.join('docs', 'reports', 'postgres-contract-mirrors-report.json'));
  const overlayCrosswalk = readOptionalJson(path.join('docs', 'reports', 'parent-atlas-overlay-crosswalk-report.json'));
  const graphStats = readOptionalJson(path.join('memory', 'graphify', 'deep', 'graph-stats.json'));
  const codeRelations = readOptionalJson(path.join('logs', 'task-output', 'code-relations-latest.json'));

  const runtimeSummary = runtimeDensity?.summary ?? {};
  const lineageSummary = featureLineage?.summary ?? {};
  const lineageHigher = lineageSummary.higherHopCoverage ?? {};
  const somSummary = somCoverage?.summary ?? {};
  const productionNoSomSummary = productionNoSom?.active_production ?? productionNoSom?.coverage ?? {};
  const mirrorCounts = postgresMirrors?.summary?.classificationCounts ?? {};
  const overlayCounts = overlayCrosswalk?.summary?.byRootClassification ?? {};

  const featureSpineReady =
    pctNumber(lineageSummary.sourceRefCoveragePct) >= 95 &&
    pctNumber(lineageSummary.featureIdCoveragePct) >= 95 &&
    pctNumber(lineageSummary.featureLabelCoveragePct) >= 95;

  const graphReady =
    Number(graphStats?.neighborhoodsComputed ?? 0) > 0 &&
    Number(graphStats?.nodeCount ?? 0) > 0 &&
    Array.isArray(codeRelations?.errors) &&
    codeRelations.errors.length === 0 &&
    Number(codeRelations?.totalEdges ?? 0) > 0;

  return {
    graphMissingNeighborhood: !graphReady,
    retrievalLowContextDensity: Number(runtimeSummary.lowDensityCount ?? 0) > 0,
    featureIdDerivation: !featureSpineReady,
    somCoordinateCoverage: Number(somSummary.missingCoordinatePoints ?? 0) > 0,
    activeProductionTopology: Number(productionNoSomSummary.qdrant_no_som ?? productionNoSomSummary.production_qdrant_no_som ?? 0) > 0,
    taskSemanticPacketsDrift: Number(mirrorCounts.LIVE_DB_ALIGNED ?? 0) < Number(postgresMirrors?.summary?.tables ?? 0),
    parentAtlasOverlayMismatch: Number(overlayCounts.MISSING_APP_OVERLAY ?? 0) > 0,
  };
}

export function seedRecommendations() {
  const gates = seedGates();
  return [
    {
      recommendation_key: 'graph:missing-neighborhood',
      severity: 'HIGH',
      title: 'Disconnected graph neighborhood',
      description: 'Neo4j traversal is missing neighborhood coverage for current seeds.',
      command: 'npm run graph:refresh',
      source: 'report:open-lanes',
      cluster: 'Self-Healing Retrieval',
      feature_id: 'graphify',
      source_refs: ['reports/parent-atlas-open-lanes-todo.md', 'docs/graph/recommendations.md'],
      evidence_refs: ['reports/parent-atlas-open-lanes-todo.md', 'docs/graph/recommendations.md'],
      status: 'NEW',
    },
    {
      recommendation_key: 'retrieval:low-context-density',
      severity: 'MEDIUM',
      title: 'Low context density retrieved',
      description: 'Queries are assembling too few codebase references for stable retrieval.',
      command: 'npm run graphify:semantic',
      source: 'report:open-lanes',
      cluster: 'Self-Healing Retrieval',
      feature_id: 'retrieval',
      source_refs: ['reports/parent-atlas-open-lanes-todo.md', 'docs/graph/recommendations.md'],
      evidence_refs: ['reports/parent-atlas-open-lanes-todo.md', 'docs/graph/recommendations.md'],
      status: 'NEW',
    },
    {
      recommendation_key: 'feature-id-derivation',
      severity: 'MEDIUM',
      title: 'Feature ID derivation',
      description: 'Canonical feature IDs should derive from the sourceRef spine and overlay crosswalk.',
      command: 'npm run atlas:feature-lineage:fast',
      source: 'report:feature-lineage',
      cluster: 'Feature Lineage',
      feature_id: 'feature-lineage',
      source_refs: ['docs/reports/feature-lineage-report.json'],
      evidence_refs: ['docs/reports/feature-lineage-report.json'],
      status: 'NEW',
    },
    {
      recommendation_key: 'som-coordinate-coverage',
      severity: 'MEDIUM',
      title: 'SOM coordinate coverage',
      description: 'Older Qdrant points are missing SOM row/col coordinates but still have cluster anchors.',
      command: 'npm run atlas:som-coordinate:coverage',
      source: 'report:som-coordinate-coverage',
      cluster: 'SOM Materialization',
      feature_id: 'som',
      source_refs: ['docs/reports/som-coordinate-coverage-report.json'],
      evidence_refs: ['docs/reports/som-coordinate-coverage-report.json'],
      status: 'NEW',
    },
    {
      recommendation_key: 'active-production-topology-mirror',
      severity: 'MEDIUM',
      title: 'Active production topology mirror',
      description: 'Active Postgres rows have Qdrant point IDs but no mirrored som_cluster value.',
      command: 'npm run atlas:coverage:qdrant-no-som',
      source: 'report:production-qdrant-no-som',
      cluster: 'SOM Materialization',
      feature_id: 'som',
      source_refs: ['../docs/reports/production-qdrant-no-som-report.json'],
      evidence_refs: ['../docs/reports/production-qdrant-no-som-report.json'],
      status: 'NEW',
    },
    {
      recommendation_key: 'task-semantic-packets-drift',
      severity: 'MEDIUM',
      title: 'task_semantic_packets manual SQL mirror drift',
      description: 'Manual SQL mirror drift should stay in sync with the live Postgres contract mirror.',
      command: 'npm run atlas:postgres-contract-mirrors',
      source: 'report:postgres-contract-mirrors',
      cluster: 'Postgres Contract',
      feature_id: 'postgres-contract',
      source_refs: ['docs/reports/postgres-contract-mirrors-report.json'],
      evidence_refs: ['docs/reports/postgres-contract-mirrors-report.json'],
      status: 'NEW',
    },
    {
      recommendation_key: 'parent-atlas-overlay-mismatch',
      severity: 'MEDIUM',
      title: 'Parent Atlas overlay mismatch',
      description: 'Root registry and app overlay are taxonomy-mismatched and need an explicit crosswalk.',
      command: 'npm run atlas:parent-atlas:overlay-crosswalk',
      source: 'report:parent-atlas-overlay',
      cluster: 'Parent Atlas',
      feature_id: 'parent-atlas',
      source_refs: ['docs/reports/parent-atlas-overlay-sync-report.json'],
      evidence_refs: ['docs/reports/parent-atlas-overlay-sync-report.json'],
      status: 'NEW',
    },
    {
      recommendation_key: 'command-mapping-mcp-allowlist',
      severity: 'MEDIUM',
      title: 'Command Mapping -> MCP allowlist',
      description: 'OpenCode routing still needs a durable allowlist contract for command mapping.',
      command: 'npm run opencode:tasks:refresh',
      source: 'report:opencode-routing',
      cluster: 'OpenCode Routing',
      feature_id: 'mcp',
      source_refs: ['reports/parent-atlas-open-lanes-todo.md', 'opencode.json'],
      evidence_refs: ['reports/parent-atlas-open-lanes-todo.md', 'opencode.json'],
      status: 'NEW',
    },
    {
      recommendation_key: 'synthetic-evidence-concept-cards',
      severity: 'LOW',
      title: 'Synthetic Evidence concept cards',
      description: 'Turn the open reports into durable concept cards so the evidence trail stays searchable.',
      command: 'npm run opencode:tasks:refresh',
      source: 'report:open-lanes',
      cluster: 'Evidence',
      feature_id: 'evidence',
      source_refs: ['reports/parent-atlas-open-lanes-todo.md', 'docs/reports/temporal-task-registry-report.md'],
      evidence_refs: ['reports/parent-atlas-open-lanes-todo.md', 'docs/reports/temporal-task-registry-report.md'],
      status: 'NEW',
    },
  ].filter((row) => {
    if (row.recommendation_key === 'graph:missing-neighborhood') return gates.graphMissingNeighborhood;
    if (row.recommendation_key === 'retrieval:low-context-density') return gates.retrievalLowContextDensity;
    if (row.recommendation_key === 'feature-id-derivation') return gates.featureIdDerivation;
    if (row.recommendation_key === 'som-coordinate-coverage') return gates.somCoordinateCoverage;
    if (row.recommendation_key === 'active-production-topology-mirror') return gates.activeProductionTopology;
    if (row.recommendation_key === 'task-semantic-packets-drift') return gates.taskSemanticPacketsDrift;
    if (row.recommendation_key === 'parent-atlas-overlay-mismatch') return gates.parentAtlasOverlayMismatch;
    return true;
  });
}

export function uniqRecommendations(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = [
      row.recommendation_key ?? '',
      row.title ?? '',
      row.command ?? '',
      row.source ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function recommendationEventFromRow(row, runId, index, sourceFile) {
  return {
    event_id: hashId('rec', runId, index, row.recommendation_key ?? row.title ?? ''),
    event_type: 'RECOMMENDATION_SEEN',
    created_at: nowIso(),
    run_id: runId,
    source: row.source ?? (sourceFile ? path.relative(ROOT, sourceFile) : 'opencode'),
    source_snapshot: sourceFile ? path.relative(ROOT, sourceFile) : null,
    recommendation_key: row.recommendation_key ?? slugify(row.title ?? 'recommendation'),
    severity: row.severity ?? 'MEDIUM',
    title: row.title ?? row.recommendation_key ?? 'untitled recommendation',
    description: row.description ?? '',
    command: row.command ?? null,
    evidence_refs: row.evidence_refs ?? [],
    source_refs: row.source_refs ?? [],
    status: row.status ?? 'NEW',
    cluster: row.cluster ?? null,
    feature_id: row.feature_id ?? deriveFeatureId(row.title ?? '', row.recommendation_key ?? ''),
  };
}

export function shouldPromoteRecommendation(rec) {
  const t = normalizeText(`${rec.recommendation_key ?? ''} ${rec.title ?? ''} ${rec.description ?? ''}`);
  return (
    rec.severity === 'HIGH' ||
    /graph missing neighborhood/.test(t) ||
    /retrieval low context density/.test(t) ||
    /feature id derivation/.test(t) ||
    /som coordinate coverage/.test(t) ||
    /active production topology mirror/.test(t) ||
    /task semantic packets/.test(t) ||
    /parent atlas overlay mismatch/.test(t) ||
    /command mapping mcp allowlist/.test(t) ||
    /synthetic evidence concept cards/.test(t) ||
    /engram/.test(t)
  );
}

export function taskIdFromRecommendation(rec) {
  const title = rec.title ?? rec.recommendation_key ?? 'task';
  return `task_${slugify(rec.recommendation_key ?? title) || hashId('task', title)}`;
}

export function taskCreateEventFromRecommendation(rec, runId) {
  return {
    event_id: hashId('task', runId, rec.recommendation_key ?? rec.title ?? '', 'CREATE'),
    event_type: 'TASK_CREATED',
    created_at: nowIso(),
    run_id: runId,
    task_id: taskIdFromRecommendation(rec),
    source_recommendation_key: rec.recommendation_key ?? slugify(rec.title ?? 'recommendation'),
    title: rec.title ?? rec.recommendation_key ?? 'untitled task',
    description: rec.description ?? '',
    priority: rec.severity ?? 'MEDIUM',
    status: 'TODO',
    parent_task_id: null,
    command: rec.command ?? null,
    feature_id: rec.feature_id ?? deriveFeatureId(rec.title ?? '', rec.recommendation_key ?? ''),
    source_refs: rec.source_refs ?? [],
    evidence_refs: rec.evidence_refs ?? [],
  };
}

export function statusChangeEvent(taskId, previousState, newState, reason, runId) {
  return {
    event_id: hashId('task', runId, taskId, 'STATUS_CHANGED', previousState ?? '', newState ?? ''),
    event_type: 'TASK_STATUS_CHANGED',
    created_at: nowIso(),
    run_id: runId,
    task_id: taskId,
    previous_state: previousState,
    new_state: newState,
    reason: reason ?? null,
  };
}

export function archiveEvent(taskId, previousState, reason, runId) {
  return {
    event_id: hashId('task', runId, taskId, 'ARCHIVED'),
    event_type: 'TASK_ARCHIVED',
    created_at: nowIso(),
    run_id: runId,
    task_id: taskId,
    previous_state: previousState,
    new_state: 'ARCHIVED',
    reason: reason ?? null,
  };
}

export function summarizeTaskState(state) {
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const openTasks = tasks.filter((task) => !['DONE', 'ARCHIVED'].includes(String(task.status ?? '').toUpperCase()));
  const archivedTasks = tasks.filter((task) => String(task.status ?? '').toUpperCase() === 'ARCHIVED');
  const activeLane =
    openTasks.find((task) => task.source_recommendation_key === ACTIVE_LANE_RECOMMENDATION_KEY) ??
    openTasks[0] ??
    null;
  return {
    taskCount: tasks.length,
    openTaskCount: openTasks.length,
    archivedTaskCount: archivedTasks.length,
    activeLane,
    topTasks: [...openTasks]
      .sort((a, b) => {
        const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const pa = priorityWeight[String(a.priority ?? '').toUpperCase()] ?? 0;
        const pb = priorityWeight[String(b.priority ?? '').toUpperCase()] ?? 0;
        if (pa !== pb) return pb - pa;
        return String(b.last_seen ?? b.updated_at ?? '').localeCompare(String(a.last_seen ?? a.updated_at ?? ''));
      })
      .slice(0, 8),
  };
}

export function renderTaskStateMarkdown(state) {
  const summary = summarizeTaskState(state);
  const openTasks = [...(state.tasks ?? [])]
    .filter((task) => !['DONE', 'ARCHIVED'].includes(String(task.status ?? '').toUpperCase()))
    .sort((a, b) => {
      const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const pa = priorityWeight[String(a.priority ?? '').toUpperCase()] ?? 0;
      const pb = priorityWeight[String(b.priority ?? '').toUpperCase()] ?? 0;
      if (pa !== pb) return pb - pa;
      return String(b.last_seen ?? b.updated_at ?? '').localeCompare(String(a.last_seen ?? a.updated_at ?? ''));
    });
  const lines = [];
  lines.push('# OpenCode Task State');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- generatedAt: ${state.generatedAt ?? nowIso()}`);
  lines.push(`- recommendationEvents: ${state.recommendationEventsCount ?? 0}`);
  lines.push(`- taskEvents: ${state.taskEventsCount ?? 0}`);
  lines.push(`- taskCount: ${summary.taskCount}`);
  lines.push(`- openTaskCount: ${summary.openTaskCount}`);
  lines.push(`- archivedTaskCount: ${summary.archivedTaskCount}`);
  lines.push('');
  lines.push('## Active Lane');
  lines.push('');
  if (summary.activeLane) {
    lines.push(`- [${String(summary.activeLane.priority ?? 'MEDIUM').toUpperCase()}] ${summary.activeLane.title} (${summary.activeLane.status})`);
    if (summary.activeLane.command) lines.push(`  - command: \`${summary.activeLane.command}\``);
    if (summary.activeLane.source_recommendation_key) lines.push(`  - source: \`${summary.activeLane.source_recommendation_key}\``);
  } else {
    lines.push('- none');
  }
  lines.push('');
  lines.push('## Open Tasks');
  lines.push('');
  for (const task of openTasks) {
    lines.push(`- [${String(task.priority ?? 'MEDIUM').toUpperCase()}] ${task.title} (${task.status})`);
    if (task.command) lines.push(`  - command: \`${task.command}\``);
    if (task.source_recommendation_key) lines.push(`  - source: \`${task.source_recommendation_key}\``);
    if (task.seen_count != null) lines.push(`  - seen_count: ${task.seen_count}`);
  }
  lines.push('');
  lines.push('## Paths');
  lines.push('');
  lines.push(`- recommendation events: \`${path.relative(ROOT, PATHS.recommendationEvents)}\``);
  lines.push(`- task events: \`${path.relative(ROOT, PATHS.taskEvents)}\``);
  lines.push(`- task state: \`${path.relative(ROOT, PATHS.taskStateJson)}\``);
  lines.push(`- startup context: \`${path.relative(ROOT, PATHS.startupContext)}\``);
  return lines.join('\n');
}

export async function writeTemporalTaskRegistryReport(state, extra = {}) {
  const summary = summarizeTaskState(state);
  const report = {
    generatedAt: state.generatedAt ?? nowIso(),
    sourceFiles: extra.sourceFiles ?? {},
    counts: {
      findings: extra.findingCount ?? 0,
      recommendations: state.recommendationEventsCount ?? 0,
      tasks: summary.taskCount,
      historyPackets: state.taskEventsCount ?? 0,
    },
    summary: {
      runId: state.generatedAt ?? nowIso(),
      findingCount: extra.findingCount ?? 0,
      recommendationCount: state.recommendationEventsCount ?? 0,
      taskCount: summary.taskCount,
      historyCount: state.taskEventsCount ?? 0,
      promotedRecommendations: state.promotedRecommendationsCount ?? 0,
      activeLane: summary.activeLane ? {
        taskId: summary.activeLane.task_id,
        title: summary.activeLane.title,
        priority: summary.activeLane.priority,
        status: summary.activeLane.status,
        command: summary.activeLane.command,
        sourceRecommendationKey: summary.activeLane.source_recommendation_key,
      } : null,
    },
    taskState: state,
  };
  await writeJson(PATHS.temporalReportJson, report);
  await writeText(PATHS.temporalReportMd, [
    '# Temporal Task Registry',
    '',
    `- recommendationEvents: ${state.recommendationEventsCount ?? 0}`,
    `- taskEvents: ${state.taskEventsCount ?? 0}`,
    `- taskCount: ${summary.taskCount}`,
    `- openTaskCount: ${summary.openTaskCount}`,
    `- promotedRecommendations: ${state.promotedRecommendationsCount ?? 0}`,
    '',
    '## Top Tasks',
    '',
    ...(summary.activeLane ? [
      `- activeLane: [${String(summary.activeLane.priority ?? 'MEDIUM').toUpperCase()}] ${summary.activeLane.title} (${summary.activeLane.status})`,
      summary.activeLane.command ? `  - command: \`${summary.activeLane.command}\`` : null,
      '',
    ].filter(Boolean) : []),
    ...summary.topTasks.map((task) => `- [${String(task.priority ?? 'MEDIUM').toUpperCase()}] ${task.title} (${task.status})`),
    '',
  ].join('\n'));
  return report;
}

export async function writeStartupContext(state, extra = {}) {
  const startupContext = {
    generatedAt: state.generatedAt ?? nowIso(),
    repo: 'sveltekit-frontend',
    evidenceFirst: true,
    roles: {
      kanban: 'persistent repo task registry',
      recommendations: 'append-only recommendation inbox',
      gemma4: 'local repo-audit orchestration after evidence retrieval',
      parentAtlas: 'semantic index and provenance ledger',
      graphify: 'graph traversal and codebase neighborhood utility',
    },
    recommendations: {
      snapshotJson: path.relative(ROOT, PATHS.recommendationSnapshotJson),
      snapshotMd: path.relative(ROOT, PATHS.recommendationSnapshotMd),
      eventsJsonl: path.relative(ROOT, PATHS.recommendationEvents),
      currentCount: state.recommendationEventsCount ?? 0,
    },
    tasks: {
      stateJson: path.relative(ROOT, PATHS.taskStateJson),
      stateMd: path.relative(ROOT, PATHS.taskStateMd),
      eventsJsonl: path.relative(ROOT, PATHS.taskEvents),
      currentCount: state.tasks?.length ?? 0,
      openCount: state.tasks?.filter((task) => !['DONE', 'ARCHIVED'].includes(String(task.status ?? '').toUpperCase())).length ?? 0,
    },
    activeLane: summarizeTaskState(state).activeLane ? {
      taskId: summarizeTaskState(state).activeLane.task_id,
      title: summarizeTaskState(state).activeLane.title,
      priority: summarizeTaskState(state).activeLane.priority,
      status: summarizeTaskState(state).activeLane.status,
      command: summarizeTaskState(state).activeLane.command,
      sourceRecommendationKey: summarizeTaskState(state).activeLane.source_recommendation_key,
    } : null,
    openLanesTodo: path.relative(ROOT, extra.openLanesTodo ?? path.join(ROOT, 'reports', 'parent-atlas-open-lanes-todo.md')),
    reports: {
      temporalTaskRegistry: path.relative(ROOT, PATHS.temporalReportMd),
      agentEnvironment: path.relative(ROOT, PATHS.agentEnvironmentMd),
      engramAdapterDecision: 'docs/reports/engram-adapter-decision-report.md',
      parentAtlasOverlay: 'docs/reports/parent-atlas-overlay-sync-report.md',
    },
  };
  await writeJson(PATHS.startupContext, startupContext);
  return startupContext;
}
