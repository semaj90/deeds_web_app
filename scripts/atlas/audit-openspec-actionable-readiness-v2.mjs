#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { classifyLaneV2 } from './lib/lane-taxonomy-v2.mjs';

const reportsDir = path.resolve(process.argv[2] ?? 'docs/reports');
const outPath = path.resolve(process.argv[3] ?? path.join(reportsDir, 'openspec-actionable-lane-audit-v2.json'));

function read(name) { try { return JSON.parse(fs.readFileSync(path.join(reportsDir, name), 'utf8')); } catch { return null; } }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
function arr(v) { return Array.isArray(v) ? v : []; }
function str(v) { return typeof v === 'string' && v.trim() ? v.trim() : null; }
function uniq(xs) { return [...new Set(arr(xs).map(String).map(x => x.trim()).filter(Boolean))].sort(); }
function sha(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

function findSummary(v, depth = 0) {
  if (depth > 6) return null;
  const o = obj(v); if (!o) return null;
  if ('actionable' in o && ('total' in o || 'proven' in o || 'waiting' in o)) return o;
  for (const k of ['summary','counts','controller','result']) { const hit = findSummary(o[k], depth + 1); if (hit) return hit; }
  return null;
}

function collectTasks(value, out = [], depth = 0) {
  if (depth > 10 || value == null) return out;
  if (Array.isArray(value)) { for (const x of value) collectTasks(x, out, depth + 1); return out; }
  const o = obj(value); if (!o) return out;
  const taskKey = str(o.taskKey ?? o.task_key ?? o.taskId ?? o.task_id ?? o.id);
  const text = str(o.text ?? o.title ?? o.task ?? o.description);
  const change = str(o.change ?? o.changeId ?? o.change_id);
  if (taskKey && (text || change)) out.push(o);
  for (const [k, v] of Object.entries(o)) {
    if (/tasks|items|entries|members|actionable|waiting|deferred|results|work/i.test(k)) collectTasks(v, out, depth + 1);
  }
  return out;
}

function dependencyInfo(raw) {
  const taskDeps = uniq(raw.dependsOnTaskIds ?? raw.depends_on_task_ids ?? raw.dependsOn ?? raw.dependencies);
  const receipts = uniq(raw.requiresReceipts ?? raw.requires_receipts ?? raw.requiredReceipts ?? raw.required_receipts);
  const blockerKey = str(raw.blockerKey ?? raw.blocker_key);
  const releaseEvent = str(raw.releaseEvent ?? raw.release_event ?? raw.retryWhen ?? raw.retry_when);
  return { taskDeps, receipts, blockerKey, releaseEvent, hasDeclaredDependency: taskDeps.length > 0 || receipts.length > 0 || Boolean(blockerKey) };
}

function looksAuthorityGated(text) {
  return /\b(remain(?:s)? (?:blocked|open|environment-dependent)|after .*binding|after .*authority|live .*readback|current .*authority|candidate population freeze|promotion authorization|not authoritative|requires? admission|once .*proven|after canonical .*binding|admitted .*source[-_ ]?revision|source[-_ ]?revision .*authority|packet writer|packet material(?:ization|izer)|current source cohort|source .*content .*digest)\b/i.test(text);
}

function inferPriority(raw) {
  const direct = num(raw.priority);
  if (direct != null) return direct;
  const s = str(raw.priorityClass ?? raw.priority_class) ?? '';
  const m = /P(\d+)/i.exec(s);
  return m ? Number(m[1]) : 999;
}

const controller = read('openspec-execution-controller-v1.json');
const actionable = read('openspec-actionable-work-v1.json');
const blockerAudit = read('openspec-blocker-audit-v1.json');
if (!actionable) throw new Error('Missing docs/reports/openspec-actionable-work-v1.json');

const controllerSummary = findSummary(controller) ?? {};
const exported = arr(actionable.tasks).length ? actionable.tasks : collectTasks(actionable);
const exportedUnique = [];
const seen = new Set();
for (const raw of exported) {
  const key = str(raw.taskKey ?? raw.task_key ?? raw.taskId ?? raw.task_id ?? raw.id) ?? sha(raw).slice(0, 20);
  if (seen.has(key)) continue; seen.add(key); exportedUnique.push(raw);
}

const fullControllerTasks = Array.isArray(controller?.allTasks)
  ? controller.allTasks
  : collectTasks(controller);
const fullActionable = [];
const fullSeen = new Set();
for (const raw of fullControllerTasks) {
  const executionState = str(raw.controller?.state)
    ?? str(raw.executionState ?? raw.execution_state ?? raw.controllerState ?? raw.controller_state);
  if (executionState !== 'ACTIONABLE') continue;
  const key = str(raw.taskKey ?? raw.task_key ?? raw.taskId ?? raw.task_id ?? raw.id) ?? sha(raw).slice(0,20);
  if (fullSeen.has(key)) continue; fullSeen.add(key); fullActionable.push(raw);
}

const normalized = exportedUnique.map(raw => {
  const taskKey = str(raw.taskKey ?? raw.task_key ?? raw.taskId ?? raw.task_id ?? raw.id) ?? sha(raw).slice(0,20);
  const text = str(raw.text ?? raw.title ?? raw.task ?? raw.description) ?? '';
  const change = str(raw.change ?? raw.changeId ?? raw.change_id) ?? 'unknown-change';
  const ledgerState = str(raw.ledgerState ?? raw.ledger_state ?? raw.state ?? raw.status) ?? 'OPEN';
  const executionState = str(raw.executionState ?? raw.execution_state ?? raw.controllerState ?? raw.controller_state) ?? 'ACTIONABLE';
  const deps = dependencyInfo(raw);
  const lanes = classifyLaneV2({ ...raw, change, taskKey, text });
  const warnings = [];
  if (executionState === 'ACTIONABLE' && looksAuthorityGated(`${text} ${change}`) && !deps.hasDeclaredDependency) {
    warnings.push('ACTIONABLE_TEXT_LOOKS_GATED_BUT_NO_MACHINE_DEPENDENCY');
  }
  if (ledgerState === executionState && executionState === 'OPEN') warnings.push('LEDGER_EXECUTION_STATE_NOT_SEPARATED');
  if (raw.declaredSourceRef || raw.declaredSourceRevision) warnings.push('SOURCE_LINEAGE_FIELDS_ARE_NOT_TASK_DEPENDENCIES');
  return {
    taskKey, change, text, ledgerState, executionState,
    priority: inferPriority(raw),
    originalLane: str(raw.lane) ?? 'UNSPECIFIED',
    lane: lanes.primary,
    secondaryLanes: lanes.secondary,
    dependencies: deps,
    warnings
  };
});

function countBy(items, keyFn) {
  const m = {};
  for (const x of items) { const k = keyFn(x); m[k] = (m[k] ?? 0) + 1; }
  return Object.fromEntries(Object.entries(m).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])));
}

const expectedActionable = num(controllerSummary.actionable) ?? num(actionable.summary?.actionable) ?? num(actionable.totalActionable) ?? null;
const exportCount = normalized.length;
const fullControllerActionableCount = fullActionable.length || null;
const truncationDetected = expectedActionable != null && exportCount < expectedActionable;
const warnings = [];
if (truncationDetected) warnings.push(`ACTIONABLE_EXPORT_TRUNCATED:${exportCount}/${expectedActionable}`);
if (fullControllerActionableCount && expectedActionable && fullControllerActionableCount !== expectedActionable) warnings.push(`CONTROLLER_TASK_ARRAY_COUNT_MISMATCH:${fullControllerActionableCount}/${expectedActionable}`);
if (normalized.some(t => t.executionState === 'ACTIONABLE' && t.ledgerState === 'OPEN')) warnings.push('EXPECTED_LEDGER_OPEN_WITH_EXECUTION_ACTIONABLE:KEEP_FIELDS_SEPARATE');

const report = {
  schema: 'atlas.openspec-actionable-lane-audit.v2',
  generatedAt: new Date().toISOString(),
  source: {
    actionable: 'openspec-actionable-work-v1.json',
    controller: controller ? 'openspec-execution-controller-v1.json' : null,
    blockerAudit: blockerAudit ? 'openspec-blocker-audit-v1.json' : null
  },
  policy: 'READ_ONLY_LANE_AND_DEPENDENCY_INTEGRITY_AUDIT',
  summary: {
    controllerActionable: expectedActionable,
    exportedActionableTasks: exportCount,
    controllerActionableObjectsFound: fullControllerActionableCount,
    exportTruncationDetected: truncationDetected,
    machineDependencyDeclared: normalized.filter(t => t.dependencies.hasDeclaredDependency).length,
    noMachineDependencyDeclared: normalized.filter(t => !t.dependencies.hasDeclaredDependency).length,
    metadataWarnings: normalized.reduce((n,t)=>n+t.warnings.length,0),
    writesPerformed: false
  },
  laneCounts: countBy(normalized, t => t.lane),
  originalLaneCounts: countBy(normalized, t => t.originalLane),
  priorityCounts: countBy(normalized, t => String(t.priority)),
  dependencyKinds: {
    taskDependencies: normalized.filter(t => t.dependencies.taskDeps.length > 0).length,
    receiptDependencies: normalized.filter(t => t.dependencies.receipts.length > 0).length,
    blockerKeyDependencies: normalized.filter(t => Boolean(t.dependencies.blockerKey)).length,
    releaseEvents: normalized.filter(t => Boolean(t.dependencies.releaseEvent)).length
  },
  warnings,
  suspiciousActionable: normalized.filter(t => t.warnings.includes('ACTIONABLE_TEXT_LOOKS_GATED_BUT_NO_MACHINE_DEPENDENCY')).slice(0,200),
  tasks: normalized,
  blockerGroups: arr(blockerAudit?.groups).map(g => ({
    blockerKey: g.blockerKey,
    state: g.state,
    owner: g.owner,
    releaseEvent: g.releaseEvent ?? g.release_event ?? null,
    retryPolicy: g.retryPolicy ?? g.retry_policy ?? null,
    count: g.count ?? g.taskCount ?? arr(g.tasks ?? g.members).length
  })),
  invariants: [
    'declaredSourceRef/sourceRevision are lineage metadata, not task dependency declarations.',
    'ledgerState records checkbox/open status; executionState records scheduler eligibility.',
    'lane classification may prioritize navigation but must never authorize execution.',
    'text heuristics only emit warnings; they never demote or promote tasks.',
    'the ranker should consume the full ACTIONABLE set or an explicitly paged stream, not an implicit top-200 sample.'
  ]
};
report.semanticChecksum = sha({ ...report, generatedAt: undefined });
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ outputPath: outPath, summary: report.summary, laneCounts: report.laneCounts, warnings: report.warnings, semanticChecksum: report.semanticChecksum }, null, 2));
