import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  OpenSpecBlockerGroupV1,
  OpenSpecBoardSnapshotV1,
  OpenSpecBoardTaskV1,
  OpenSpecExecutionState,
  OpenSpecReportFileV1
} from './types';
import { classifyTaskTopics } from './clusterer';

const REPORTS = [
  'openspec-execution-controller-v1.json',
  'openspec-actionable-work-v1.json',
  'openspec-waiting-dependencies-v1.json',
  'openspec-deferred-discoveries-v1.json',
  'openspec-blocker-audit-v1.json',
  'openspec-implementation-order-v1.json',
  'openspec-next-actions-v2.json',
  'low-rank-task-recommendation-v2.json',
  'openspec-directory-graph-v1.json',
  'openspec-file-kmeans-v1.json',
  'atlas-runtime-readiness-v1.json',
  'openspec-challenger-tournament-v1.json',
  'openspec-progress-audit-v2.json',
  'atlas-shadow-preference-eval-v1.json',
  'topic-identity-readiness-v1.json',
  'okf-claim-freshness-v1.json',
  'parent-atlas-utility-helper-readiness-v1.json'
] as const;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function hash(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export async function resolveOpenSpecReportDirectory(): Promise<string> {
  const candidates = [
    process.env.ATLAS_REPORTS_DIR,
    path.resolve(process.cwd(), 'docs/reports'),
    path.resolve(process.cwd(), '../docs/reports'),
    path.resolve(process.cwd(), '../../docs/reports')
  ].filter((x): x is string => Boolean(x));

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isDirectory()) continue;
      const hasBoardReport = await Promise.any([
        fs.access(path.join(candidate, 'openspec-execution-controller-v1.json')),
        fs.access(path.join(candidate, 'atlas-runtime-readiness-v1.json'))
      ]).then(() => true).catch(() => false);
      if (hasBoardReport) return candidate;
    } catch { /* next */ }
  }
  throw new Error(`Parent Atlas reports directory not found. Checked: ${candidates.join(', ')}`);
}

async function readReport(reportDirectory: string, name: string) {
  const candidates = [
    path.join(reportDirectory, name),
    path.join(reportDirectory, 'staging', name)
  ];
  try {
    const existing: Array<{ filePath: string; mtimeMs: number }> = [];
    for (const filePath of candidates) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile()) existing.push({ filePath, mtimeMs: stat.mtimeMs });
      } catch { /* try the next report location */ }
    }
    if (!existing.length) throw Object.assign(new Error('report not found'), { code: 'ENOENT' });
    const { filePath } = existing.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    const [content, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
    const parsed = JSON.parse(content) as unknown;
    const meta: OpenSpecReportFileV1 = {
      name,
      path: filePath,
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      sha256: crypto.createHash('sha256').update(content).digest('hex')
    };
    return { parsed, meta };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        parsed: null,
        meta: { name, path: candidates[0], exists: false, size: 0, mtimeMs: 0, sha256: null } satisfies OpenSpecReportFileV1
      };
    }
    throw error;
  }
}

function findSummary(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4) return null;
  const o = object(value);
  if (!o) return null;
  const keys = new Set(Object.keys(o).map((x) => x.toLowerCase()));
  if ((keys.has('total') || keys.has('totaltasks')) && (keys.has('actionable') || keys.has('waiting') || keys.has('proven'))) return o;
  for (const key of ['summary', 'counts', 'controller', 'result']) {
    if (o[key]) {
      const found = findSummary(o[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function stateFromSource(source: string, raw: Record<string, unknown>): OpenSpecExecutionState {
  const direct = str(raw.executionState) ?? str(raw.state) ?? str(raw.status);
  if (direct) {
    const normalized = direct.toUpperCase().replace(/[- ]/g, '_');
    const allowed: OpenSpecExecutionState[] = [
      'PROVEN','ACTIONABLE','WAITING_ON_DEPENDENCY','WAITING_ON_AUTHORITY','DEFERRED','SUPERSEDED','CANCELLED','UNKNOWN'
    ];
    if (allowed.includes(normalized as OpenSpecExecutionState)) return normalized as OpenSpecExecutionState;
    if (normalized === 'DONE' || normalized === 'COMPLETE') return 'PROVEN';
    if (normalized === 'WAITING' || normalized === 'BLOCKED') return 'WAITING_ON_DEPENDENCY';
  }
  if (source.includes('actionable')) return 'ACTIONABLE';
  if (source.includes('waiting')) return 'WAITING_ON_DEPENDENCY';
  if (source.includes('deferred')) return 'DEFERRED';
  return 'UNKNOWN';
}

function looksTaskLike(o: Record<string, unknown>) {
  return Boolean(
    str(o.taskId) || str(o.task_id) || str(o.id) || str(o.task) || str(o.title) || str(o.text) ||
    str(o.changeId) || str(o.change_id) || str(o.openspecChange)
  );
}

function collectObjects(value: unknown, out: Record<string, unknown>[], depth = 0) {
  if (depth > 7 || value == null) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      const o = object(item);
      if (o && looksTaskLike(o)) out.push(o);
      else collectObjects(item, out, depth + 1);
    }
    return;
  }
  const o = object(value);
  if (!o) return;
  for (const [key, child] of Object.entries(o)) {
    if (/^(tasks|items|entries|members|work|actionable|waiting|deferred|superseded|results|ranked)$/i.test(key)) {
      collectObjects(child, out, depth + 1);
    }
  }
}

function extractFileRefs(raw: Record<string, unknown>, text: string): string[] {
  const refs = new Set<string>();
  for (const key of ['path', 'file', 'taskFile', 'sourceFile', 'reportPath']) {
    const value = str(raw[key]);
    if (value) refs.add(value);
  }
  for (const match of text.matchAll(/(?:[A-Za-z]:[\\/])?[\w.@+()\-\[\]/\\]+\.(?:ts|mts|js|mjs|svelte|json|md|sql|py)\b/g)) {
    refs.add(match[0]);
  }
  return [...refs].sort();
}

function normalizeTask(raw: Record<string, unknown>, sourceReport: string, index: number): OpenSpecBoardTaskV1 {
  const title = str(raw.title) ?? str(raw.text) ?? str(raw.task) ?? str(raw.description) ?? `Task ${index + 1}`;
  const changeId = str(raw.changeId) ?? str(raw.change_id) ?? str(raw.openspecChange) ?? str(raw.change) ?? 'unknown-change';
  const state = stateFromSource(sourceReport, raw);
  const blockerKey = str(raw.blockerKey) ?? str(raw.blocker_key) ?? str(raw.blocker) ?? str(raw.reason);
  const priority = str(raw.priority) ?? str(raw.priorityClass) ?? str(raw.priority_class);
  const text = [title, changeId, blockerKey, priority].filter(Boolean).join(' ');
  const topics = classifyTaskTopics(text);
  const directId = str(raw.taskId) ?? str(raw.task_id) ?? str(raw.id) ?? str(raw.key);
  const id = directId ?? `derived:${hash({ sourceReport, changeId, title }).slice(0, 20)}`;
  return {
    id,
    changeId,
    title,
    state,
    blockerKey,
    topic: topics.primary,
    secondaryTopics: topics.secondary,
    priority,
    sourceReport,
    fileRefs: extractFileRefs(raw, text),
    raw
  };
}

function blockersFromAudit(value: unknown): OpenSpecBlockerGroupV1[] {
  const o = object(value);
  if (!o) return [];
  const candidate = o.groups ?? o.blockerGroups ?? o.blockers ?? o.items;
  const rows = Array.isArray(candidate) ? candidate : object(candidate) ? Object.entries(candidate as Record<string, unknown>).map(([key, val]) => ({ key, ...(object(val) ?? {}) })) : [];
  return rows.map((row, i) => {
    const r = object(row) ?? {};
    return {
      key: str(r.key) ?? str(r.blockerKey) ?? str(r.id) ?? `blocker-${i + 1}`,
      count: num(r.count) ?? num(r.taskCount) ?? (Array.isArray(r.tasks) ? r.tasks.length : 0),
      owner: str(r.owner),
      meaning: str(r.meaning) ?? str(r.description),
      releaseEvent: str(r.releaseEvent) ?? str(r.release_event) ?? str(r.unblockWhen),
      retryPolicy: str(r.retryPolicy) ?? str(r.retry_policy)
    };
  }).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export async function computeOpenSpecReportFingerprint(): Promise<string> {
  const reportDirectory = await resolveOpenSpecReportDirectory();
  const metas = await Promise.all(REPORTS.map(async (name) => (await readReport(reportDirectory, name)).meta));
  return hash(metas.map(({ name, exists, size, mtimeMs, sha256 }) => ({ name, exists, size, mtimeMs, sha256 })));
}

export async function readOpenSpecBoardSnapshot(): Promise<OpenSpecBoardSnapshotV1> {
  const reportDirectory = await resolveOpenSpecReportDirectory();
  const loaded = await Promise.all(REPORTS.map((name) => readReport(reportDirectory, name)));
  const byName = new Map(loaded.map((x) => [x.meta.name, x]));
  const taskReports = [
    'openspec-actionable-work-v1.json',
    'openspec-waiting-dependencies-v1.json',
    'openspec-deferred-discoveries-v1.json'
  ];

  const seen = new Set<string>();
  const tasks: OpenSpecBoardTaskV1[] = [];
  for (const name of taskReports) {
    const value = byName.get(name)?.parsed;
    if (!value) continue;
    const objects: Record<string, unknown>[] = [];
    collectObjects(value, objects);
    for (let i = 0; i < objects.length; i += 1) {
      const task = normalizeTask(objects[i], name, i);
      const dedupe = `${task.state}:${task.id}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      tasks.push(task);
    }
  }

  const controller = byName.get('openspec-execution-controller-v1.json')?.parsed;
  const summaryRaw = findSummary(controller) ?? {};
  const stateCounts = {
    proven: tasks.filter((t) => t.state === 'PROVEN').length,
    actionable: tasks.filter((t) => t.state === 'ACTIONABLE').length,
    waiting: tasks.filter((t) => t.state.startsWith('WAITING_')).length,
    deferred: tasks.filter((t) => t.state === 'DEFERRED').length,
    superseded: tasks.filter((t) => t.state === 'SUPERSEDED').length,
    unknown: tasks.filter((t) => t.state === 'UNKNOWN').length
  };
  const total = num(summaryRaw.total) ?? num(summaryRaw.totalTasks) ?? tasks.length;
  const proven = num(summaryRaw.proven) ?? num(summaryRaw.done) ?? num(summaryRaw.completed) ?? stateCounts.proven;
  const actionable = num(summaryRaw.actionable) ?? stateCounts.actionable;
  const waiting = num(summaryRaw.waiting) ?? num(summaryRaw.blocked) ?? stateCounts.waiting;
  const deferred = num(summaryRaw.deferred) ?? stateCounts.deferred;
  const superseded = num(summaryRaw.superseded) ?? stateCounts.superseded;
  const writesPerformed = bool((object(controller) ?? {}).writesPerformed) ?? bool(summaryRaw.writesPerformed) ?? false;

  const blockers = blockersFromAudit(byName.get('openspec-blocker-audit-v1.json')?.parsed);
  const reports = loaded.map((x) => x.meta);
  const newest = reports.filter((r) => r.exists).sort((a, b) => b.mtimeMs - a.mtimeMs)[0] ?? null;
  const semanticChecksum = hash({
    reports: reports.map(({ name, exists, size, sha256 }) => ({ name, exists, size, sha256 })),
    summary: { total, proven, actionable, waiting, deferred, superseded, writesPerformed },
    blockers
  });

  return {
    schema: 'atlas.openspec-board.v1',
    reportDirectory,
    semanticChecksum,
    generatedAt: new Date().toISOString(),
    reports,
    summary: {
      total,
      proven,
      actionable,
      waiting,
      deferred,
      superseded,
      unknown: Math.max(0, total - proven - actionable - waiting - deferred - superseded),
      writesPerformed
    },
    tasks,
    blockers,
    freshness: {
      newestMtimeMs: newest?.mtimeMs ?? 0,
      newestReport: newest?.name ?? null,
      stale: newest ? Date.now() - newest.mtimeMs > 15 * 60_000 : true
    },
    invariants: [
      'REPORT_FILES_ARE_CURRENT_READ_AUTHORITY',
      'POSTGRES_HISTORY_IS_OPTIONAL_PROJECTION_NOT_AUTHORITY',
      'ONLY_ACTIONABLE_TASKS_ARE_CANDIDATES_FOR_RANKING',
      'WAITING_TASKS_REQUIRE_CHANGED_RELEASE_EVIDENCE_BEFORE_RETRY',
      'UI_DOES_NOT_MUTATE_OPENSPEC_TASK_CHECKBOXES'
    ]
  };
}
