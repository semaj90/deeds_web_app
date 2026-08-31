#!/usr/bin/env node
/**
 * Build an evidence-backed OpenSpec workboard.
 *
 * This is a projection only. It never edits task ledgers or infers completion.
 * ETA is emitted only when a receipt-linked duration is available; otherwise
 * it remains UNKNOWN.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const changesRoot = join(root, 'openspec', 'changes');
const reportPath = join(root, 'docs', 'reports', 'openspec-workboard-v1.json');
const markdownPath = join(root, 'docs', 'OPENSPEC-WORKBOARD.md');

const progressBar = (fraction) => {
  if (fraction == null) return '[----------]';
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * 10);
  return `[${'#'.repeat(filled)}${'-'.repeat(10 - filled)}]`;
};

const pathOf = (file) => relative(root, file).split(sep).join('/');
const classifyKind = (text) => (/no canonical identity or source data changes|no projection occurs while model, identity, or parity gates fail/i.test(text) ? 'INVARIANT' : 'WORK_ITEM');
const extractDeclared = (text, names) => {
  const pattern = new RegExp('(?:' + names.join('|') + ')\\s*[:=]\\s*["\\\']?([^"\\\'\\s,;]+)', 'i');
  const match = text.match(pattern);
  return match?.[1] || null;
};
const classifyLane = (text) => {
  const value = text.toLowerCase();
  if (/daily.?graphify|graphify.*kanban|kanban.*graphify/.test(value)) return 'DAILY_GRAPHIFY_KANBAN';
  if (/ewin.?tang|quantum.?inspired|low.?rank.*recommend/.test(value)) return 'RESEARCH_CHALLENGER_EWIN_TANG';
  if (/ace|contextmanifest|bitfrost|dense search|retrieval|qdrant|go.?retrieval/.test(value)) return 'RETRIEVAL_ACE';
  return 'GENERAL';
};
const priorityFor = (text) => {
  const value = text.toLowerCase();
  if (/identity|symbol.?version|candidateordinal|source.?revision|graph.?resolve/.test(value)) return 10;
  if (/canonical|eligibility|provenance|readback|lineage/.test(value)) return 20;
  if (/runtime|embedding|llama|8098|qdrant|pgvector|retrieval/.test(value)) return 30;
  if (/feature|contextmanifest|ace|ast|tree.?sitter|lsp|ontology/.test(value)) return 40;
  if (/workflow|jetstream|nats|receipt|agentic|openspec/.test(value)) return 50;
  if (/admin|kanban|document|toc|archive|supersed/.test(value)) return 60;
  if (/benchmark|experiment|challenger|pca|svd|tang|som|leiden/.test(value)) return 80;
  return 70;
};

const taskFiles = [];
if (existsSync(changesRoot)) {
  for (const change of readdirSync(changesRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!change.isDirectory()) continue;
    const file = join(changesRoot, change.name, 'tasks.md');
    if (existsSync(file)) taskFiles.push(file);
  }
}

const tasks = [];
for (const file of taskFiles) {
  const change = relative(changesRoot, file).split(sep)[0];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
    if (!match) return;
    const done = match[1].toLowerCase() === 'x';
    const text = match[2].trim();
    tasks.push({
      taskKey: `${change}:${index + 1}`,
      change,
      source: pathOf(file),
      line: index + 1,
      text,
      state: done ? 'DONE' : 'OPEN',
      kind: classifyKind(text),
      lane: classifyLane(`${change} ${text}`),
      declaredSourceRef: extractDeclared(text, ['source_ref', 'sourceRef']),
      declaredSourceRevision: extractDeclared(text, ['source_revision', 'sourceRevision']),
      priority: priorityFor(`${change} ${text}`),
      lastUpdatedAt: statSync(file).mtime.toISOString(),
      timestampMethod: 'FILESYSTEM_MTIME',
      eta: classifyKind(text) === 'INVARIANT'
        ? { status: 'NOT_APPLICABLE', method: 'PERMANENT_ACCEPTANCE_INVARIANT' }
        : { status: 'UNKNOWN', method: 'NO_RECEIPT_LINKED_THROUGHPUT' },
    });
  });
}

const openTasks = tasks.filter((task) => task.state === 'OPEN');
const completedTasks = tasks.length - openTasks.length;
const byPriority = [...openTasks].filter((task) => task.kind !== 'INVARIANT').sort((a, b) => a.priority - b.priority || b.lastUpdatedAt.localeCompare(a.lastUpdatedAt) || a.change.localeCompare(b.change) || a.line - b.line);
const invariants = tasks.filter((task) => task.kind === 'INVARIANT').map((task) => ({ taskKey: task.taskKey, change: task.change, source: task.source, line: task.line, text: task.text, state: task.state, lastUpdatedAt: task.lastUpdatedAt, timestampMethod: task.timestampMethod, eta: task.eta }));
const workPackages = [
  { id: 'P10-A', title: 'Migration ledger reconciliation', gates: ['migration baseline', 'owner manifest', 'pre-apply guard'], dependsOn: [], state: 'BLOCKED' },
  { id: 'P10-B', title: 'Canonical candidate identity', gates: ['feature identity', 'packet identity', 'CandidateOrdinal'], dependsOn: ['P10-A'], state: 'OPEN' },
  { id: 'P10-C', title: 'Symbol lineage', gates: ['stableSymbolId', 'symbolVersionId', 'treeNodeId'], dependsOn: ['P10-B'], state: 'OPEN' },
  { id: 'P10-D', title: 'Lexical identity', gates: ['source revision', 'FTS identity', 'cross-store lineage'], dependsOn: ['P10-B'], state: 'OPEN' },
  { id: 'P10-E', title: 'Top-K cross-store readback', gates: ['CandidateTopKV1', 'Qdrant parity', 'Go retrieval parity'], dependsOn: ['P10-C', 'P10-D'], state: 'OPEN' },
];
const changes = [...new Set(tasks.map((task) => task.change))].sort().map((change) => {
  const rows = tasks.filter((task) => task.change === change);
  const done = rows.filter((task) => task.state === 'DONE').length;
  return { change, completed: done, total: rows.length, progressFraction: rows.length ? done / rows.length : null, progressBar: progressBar(rows.length ? done / rows.length : null), open: rows.length - done };
});
const buildIndex = (field) => Object.fromEntries(
  [...new Set(tasks.map((task) => task[field]).filter(Boolean))].sort().map((value) => [
    value,
    tasks.filter((task) => task[field] === value).map((task) => task.taskKey),
  ]),
);
const laneSummary = Object.fromEntries([...new Set(tasks.map((task) => task.lane))].sort().map((lane) => {
  const rows = tasks.filter((task) => task.lane === lane);
  return [lane, { total: rows.length, open: rows.filter((task) => task.state === 'OPEN').length, done: rows.filter((task) => task.state === 'DONE').length }];
}));
const laneDependencies = [
  {
    lane: 'RESEARCH_CHALLENGER_EWIN_TANG',
    dependsOn: ['DAILY_GRAPHIFY_KANBAN'],
    policy: 'RECEIPT_BACKED_RECOMMENDATIONS_ONLY',
    note: 'Ewin Tang remains an offline challenger; Daily Graphify may supply reviewed recommendation cards, never automatic canonical promotion.',
  },
  {
    lane: 'RETRIEVAL_ACE',
    dependsOn: ['DAILY_GRAPHIFY_KANBAN'],
    policy: 'EVIDENCE_AND_REVISION_BOUND',
    note: 'ACE may consume Graphify receipts after identity and source-revision eligibility checks.',
  },
];
const kanbanSnapshotPath = join(root, 'docs', 'graph', 'kanban-board.json');
const kanbanSnapshot = (() => {
  if (!existsSync(kanbanSnapshotPath)) return { status: 'MISSING', path: pathOf(kanbanSnapshotPath) };
  try {
    const board = JSON.parse(readFileSync(kanbanSnapshotPath, 'utf8'));
    const rows = Object.values(board.columns ?? {}).flatMap((column) => column?.tasks ?? []);
    const generatedAt = board.generatedAt ?? null;
    const ageDays = generatedAt ? Math.max(0, (Date.now() - Date.parse(generatedAt)) / 86400000) : null;
    return {
      status: ageDays != null && ageDays > 14 ? 'STALE_SNAPSHOT' : 'CURRENT_BOUNDED_SNAPSHOT',
      path: pathOf(kanbanSnapshotPath),
      generatedAt,
      ageDays: ageDays == null ? null : Math.round(ageDays * 10) / 10,
      taskCount: rows.length,
      sourceRefCount: rows.reduce((count, task) => count + (Array.isArray(task.sourceRefs) ? task.sourceRefs.length : 0), 0),
      featureKeyCount: rows.filter((task) => typeof task.featureKey === 'string' && task.featureKey.length > 0).length,
      canonicalAuthority: false,
      role: 'DAILY_GRAPHIFY_KANBAN_REFERENCE_ONLY',
    };
  } catch (error) {
    return { status: 'INVALID_SNAPSHOT', path: pathOf(kanbanSnapshotPath), error: error instanceof Error ? error.message : String(error) };
  }
})();
const historicalKanbanSnapshots = [
  {
    path: join(root, 'memory', 'exports', 'kanban-ranking-report.json'),
    role: 'HISTORICAL_TASK_RANKING_REFERENCE',
    read: (data) => ({ taskCount: data.totalTasks ?? null, needsTesting: data.needsTesting ?? null, generatedAt: data.timestamp ?? null, mergeability: Array.isArray(data.tasks) ? 'FULL_ROWS_AVAILABLE' : 'REFERENCE_ONLY_SUMMARY_NO_FULL_ROWS' }),
  },
  {
    path: join(root, 'docs', 'reports', 'kanban-turbovec-consolidation-latest.json'),
    role: 'CURRENT_CONSOLIDATION_INPUT_REFERENCE',
    read: (data) => ({ taskCount: data.summary?.boardTaskCount ?? null, massInputCount: data.summary?.massInputCount ?? null, uniqueRecordCount: data.summary?.uniqueRecordCount ?? null, generatedAt: data.generatedAt ?? null }),
  },
].map((entry) => {
  if (!existsSync(entry.path)) return { path: pathOf(entry.path), status: 'MISSING', role: entry.role };
  try {
    const data = JSON.parse(readFileSync(entry.path, 'utf8'));
    const details = entry.read(data);
    const timestamp = details.generatedAt ? Date.parse(details.generatedAt) : NaN;
    return {
      path: pathOf(entry.path),
      status: Number.isFinite(timestamp) && Date.now() - timestamp > 14 * 86400000 ? 'HISTORICAL_OR_STALE' : 'CURRENT_BOUNDED',
      ageDays: Number.isFinite(timestamp) ? Math.round(((Date.now() - timestamp) / 86400000) * 10) / 10 : null,
      role: entry.role,
      ...details,
      canonicalAuthority: false,
    };
  } catch (error) {
    return { path: pathOf(entry.path), status: 'INVALID', role: entry.role, error: error instanceof Error ? error.message : String(error) };
  }
});

const consolidationReportPath = join(root, 'docs', 'reports', 'kanban-turbovec-consolidation-latest.json');
const consolidationInput = (() => {
  if (!existsSync(consolidationReportPath)) return { status: 'MISSING', path: pathOf(consolidationReportPath) };
  try {
    const data = JSON.parse(readFileSync(consolidationReportPath, 'utf8'));
    const groups = Array.isArray(data.groups) ? data.groups : [];
    const refs = [...new Set(groups.flatMap((group) => Array.isArray(group.sourceRefs) ? group.sourceRefs : []))];
    const resolveRef = (ref) => {
      const raw = String(ref).replace(/^todo:/i, '').replace(/#line:\d+$/i, '');
      const normalized = raw.replace(/\\/g, '/');
      const rootMarker = '/deeds-web-app/';
      const relativeRef = normalized.includes(rootMarker) ? normalized.slice(normalized.indexOf(rootMarker) + rootMarker.length) : normalized;
      if (existsSync(join(root, relativeRef))) return 'ACTIVE';
      const archiveRef = join(root, 'docs', 'reports', 'sessions', relativeRef.split('/').pop());
      if (existsSync(archiveRef)) return 'ARCHIVED_REFERENCE';
      return 'UNRESOLVED';
    };
    const resolution = refs.map((ref) => ({ ref, status: resolveRef(ref) }));
    return {
      status: 'CURRENT_BOUNDED_REFERENCE',
      path: pathOf(consolidationReportPath),
      generatedAt: data.generatedAt ?? null,
      groupCount: groups.length,
      actionCount: Array.isArray(data.actions) ? data.actions.length : 0,
      sourceRefCount: refs.length,
      sourceRefsResolved: resolution.filter((item) => item.status !== 'UNRESOLVED').length,
      sourceRefsActive: resolution.filter((item) => item.status === 'ACTIVE').length,
      sourceRefsArchived: resolution.filter((item) => item.status === 'ARCHIVED_REFERENCE').length,
      sourceRefsUnresolved: resolution.filter((item) => item.status === 'UNRESOLVED').length,
      sourceRevisionCount: groups.reduce((count, group) => count + (Array.isArray(group.sourceRevisions) ? group.sourceRevisions.length : group.sourceRevision ? 1 : 0), 0),
      featureIdCount: new Set(groups.flatMap((group) => Array.isArray(group.topFeatureIds) ? group.topFeatureIds : [])).size,
      sourceOfTruth: data.inputs?.boardPath ?? null,
      canonicalAuthority: false,
      policy: 'CONSOLIDATION_CANDIDATE_ONLY_NO_AUTOMATIC_MERGE',
    };
  } catch (error) {
    return { status: 'INVALID', path: pathOf(consolidationReportPath), error: error instanceof Error ? error.message : String(error) };
  }
})();
const consolidationCandidates = (() => {
  if (!existsSync(consolidationReportPath)) return [];
  try {
    const data = JSON.parse(readFileSync(consolidationReportPath, 'utf8'));
    return (Array.isArray(data.groups) ? data.groups : [])
      .map((group) => ({
        groupId: group.groupId,
        recordCount: group.recordCount ?? 0,
        openCount: group.openCount ?? 0,
        sourceRefs: Array.isArray(group.sourceRefs) ? group.sourceRefs.slice(0, 10) : [],
        featureIds: Array.isArray(group.topFeatureIds) ? group.topFeatureIds.slice(0, 10) : [],
        recommendation: group.recommendation ?? 'REVIEW_REQUIRED',
        policy: 'REVIEW_ONLY_NO_AUTOMATIC_MERGE',
      }))
      .sort((a, b) => b.openCount - a.openCount || b.recordCount - a.recordCount || String(a.groupId).localeCompare(String(b.groupId)))
      .slice(0, 20);
  } catch {
    return [];
  }
})();

const result = {
  schema: 'atlas.openspec.workboard.v1',
  generatedAt: new Date().toISOString(),
  source: 'openspec/changes/*/tasks.md',
  summary: { completedTasks, openTasks: openTasks.length, totalTasks: tasks.length, progressFraction: tasks.length ? completedTasks / tasks.length : null, progressBar: progressBar(tasks.length ? completedTasks / tasks.length : null), eta: { status: 'UNKNOWN', method: 'NO_RECEIPT_LINKED_THROUGHPUT' } },
  ordering: 'WORK_PACKAGES_THEN_WORK_ITEMS; PRIORITY_THEN_LAST_UPDATED_DESC; INVARIANTS_SEPARATE; ETA_SORT_WHEN_RECEIPT_THROUGHPUT_EXISTS; SOURCE_REF_AND_REVISION_INDEXED_WHEN_DECLARED',
  indexing: {
    sourceRef: buildIndex('declaredSourceRef'),
    sourceRevision: buildIndex('declaredSourceRevision'),
    unclassifiedTasks: tasks.filter((task) => !task.declaredSourceRef && !task.declaredSourceRevision).map((task) => task.taskKey),
    coverage: {
      sourceRefDeclared: tasks.filter((task) => task.declaredSourceRef).length,
      sourceRevisionDeclared: tasks.filter((task) => task.declaredSourceRevision).length,
      totalTasks: tasks.length,
    },
  },
  lanes: laneSummary,
  laneDependencies,
  dailyGraphifyKanban: kanbanSnapshot,
  historicalKanbanSnapshots,
  consolidationInput,
  consolidationCandidates,
  workPackages,
  invariants,
  changes,
  nextTasks: byPriority.slice(0, 100),
  writes: { taskLedgers: 0, sourceDocuments: 0 },
};

const markdown = [
  '# OpenSpec Workboard', '',
  '> Generated from OpenSpec task ledgers. This is a navigation/progress projection, not task authority.', '',
  `Overall progress: ${result.summary.progressBar} ${completedTasks}/${tasks.length} tasks`,
  'ETA: UNKNOWN — no receipt-linked throughput supports a defensible estimate.', '',
  '## P10 dependency work packages', '',
  ...workPackages.map((item) => `- **${item.id}** ${item.title} — ${item.state}; depends on ${item.dependsOn.join(', ') || 'none'}; gates: ${item.gates.join(', ')}`), '',
  '## Permanent acceptance invariants', '',
  ...invariants.map((item) => `- **INVARIANT** [${item.change}](${item.source}#L${item.line}) ${item.text} — last updated ${item.lastUpdatedAt} (${item.timestampMethod}); ETA N/A`), '',
  '## Highest-priority open tasks', '',
  ...byPriority.slice(0, 100).map((task) => `- [ ] **P${task.priority}** [${task.change}](${task.source}#L${task.line}) ${task.text} — lane ${task.lane}; last updated ${task.lastUpdatedAt} (${task.timestampMethod}); ETA UNKNOWN`), '',
  '## Task indexing coverage', '',
  `- Declared source_ref: ${result.indexing.coverage.sourceRefDeclared}/${tasks.length}`,
  `- Declared source_revision: ${result.indexing.coverage.sourceRevisionDeclared}/${tasks.length}`,
  `- Unclassified task rows remain linked to their OpenSpec file and line; no source identity was inferred.`, '',
  '## Execution lanes', '',
  ...Object.entries(laneSummary).map(([lane, stats]) => `- **${lane}** ${stats.open} open / ${stats.total} total`), '',
  '## Lane dependencies', '',
  ...laneDependencies.map((item) => `- **${item.lane}** depends on ${item.dependsOn.join(', ')} — ${item.policy}; ${item.note}`), '',
  '## Daily Graphify Kanban reference', '',
  `- Status: **${kanbanSnapshot.status}**; source: ${kanbanSnapshot.path}`,
  `- Snapshot age: ${kanbanSnapshot.ageDays ?? 'unknown'} days; tasks: ${kanbanSnapshot.taskCount ?? 0}; sourceRefs: ${kanbanSnapshot.sourceRefCount ?? 0}`,
  '- This snapshot is a reference/input surface only; it is not canonical identity or task authority.', '',
  '## Historical and consolidation task sources', '',
  ...historicalKanbanSnapshots.map((item) => `- **${item.role}** ${item.status}: ${item.path}; task/board records ${item.taskCount ?? 'unknown'}; age ${item.ageDays ?? 'unknown'} days`),
  '- Historical ranking reports and consolidation inputs are evidence sources only; they are not merged into the OpenSpec task count automatically.', '',
  '## Current consolidation reference', '',
  `- Status: **${consolidationInput.status}**; groups: ${consolidationInput.groupCount ?? 0}; actions: ${consolidationInput.actionCount ?? 0}; sourceRefs: ${consolidationInput.sourceRefCount ?? 0}; feature IDs: ${consolidationInput.featureIdCount ?? 0}`,
  '- Consolidation groups remain candidate merges. They do not automatically close, rewrite, or merge OpenSpec tasks.', '',
  '## Highest-volume consolidation candidates', '',
  ...consolidationCandidates.slice(0, 10).map((item) => `- **${item.groupId}** ${item.openCount}/${item.recordCount} open; ${item.featureIds.length} feature IDs; review only`), '',
  '## Change progress', '',
  ...changes.map((change) => `- [${change.change}](openspec/changes/${change.change}/) ${change.progressBar} ${change.completed}/${change.total} complete; ${change.open} open`), '',
].join('\n');

writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
writeFileSync(markdownPath, `${markdown}\n`, 'utf8');
console.log(`OPENSPEC_WORKBOARD_BUILT changes=${changes.length} tasks=${tasks.length} open=${openTasks.length}`);
console.log(`report=${reportPath}`);
