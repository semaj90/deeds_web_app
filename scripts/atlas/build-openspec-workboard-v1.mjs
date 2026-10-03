#!/usr/bin/env node
/**
 * Build an evidence-backed OpenSpec workboard.
 *
 * This is a projection only. It never edits task ledgers or infers completion.
 * ETA is emitted only when a receipt-linked duration is available; otherwise
 * it remains UNKNOWN.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockHash, parseWfu, resolveDeclarations, sectionSlug, sha256, stripWfuComment, summarizeDeclared, taskBlock } from './lib/wfu-metadata.mjs';
import { buildArchitectureOverlay, buildProgramGates, buildProgramHierarchy, buildProgramWorkPackages, buildSelectedChainOverlay, classifyArchitectureProgram, classifyGateState, classifyProgramTask, computeCompletionTracking, isValidSchedulerSelection, mutationClass, PROGRAM_MILESTONES, PROGRAM_WAVES, schedulerPermission } from './lib/openspec-program-plan-v1.mjs';

// Repo root is owned by this script's location, not by process.cwd() (running from scripts/atlas wrote to a nonexistent scripts/atlas/docs path).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const changesRoot = join(root, 'openspec', 'changes');
// Optional output overrides allow isolated audits to build a fresh snapshot
// without replacing the shared projection while another session edits it.
const reportPath = process.argv[2]
  ? resolve(root, process.argv[2])
  : join(root, 'docs', 'reports', 'openspec-workboard-v1.json');
const markdownPath = process.argv[3]
  ? resolve(root, process.argv[3])
  : join(root, 'docs', 'OPENSPEC-WORKBOARD.md');
// The prior artifact at the output path is the baseline for completion tracking (read before it is overwritten).
const previousWorkboard = (() => {
  if (!existsSync(reportPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(reportPath, 'utf8'));
    return parsed?.schema === 'atlas.openspec.workboard.v1' && Array.isArray(parsed.taskInventory) ? parsed : null;
  } catch {
    return null;
  }
})();
const controllerArg = process.argv.find((arg) => arg.startsWith('--controller-file='));
const controllerPath = controllerArg
  ? resolve(root, controllerArg.slice('--controller-file='.length))
  : join(root, 'docs', 'reports', 'openspec-execution-controller-v1.json');
const controllerReport = existsSync(controllerPath) ? JSON.parse(readFileSync(controllerPath, 'utf8')) : null;
const controllerByTaskKey = new Map((controllerReport?.allTasks ?? []).map((task) => [task.taskKey, task]));
const selectionArg = process.argv.find((arg) => arg.startsWith('--selection-file='));
const selectionFile = selectionArg ? resolve(root, selectionArg.slice('--selection-file='.length)) : null;
const schedulerSelection = selectionFile && existsSync(selectionFile)
  ? JSON.parse(readFileSync(selectionFile, 'utf8'))
  : null;
if (selectionFile && !isValidSchedulerSelection(schedulerSelection)) {
  throw new Error('INVALID_EXPLICIT_SCHEDULER_SELECTION: expected atlas.openspec-scheduler-selection.v1 with permission=SELECTED and taskKeys[]');
}

const progressBar = (fraction) => {
  if (fraction == null) return '[----------]';
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * 10);
  return `[${'#'.repeat(filled)}${'-'.repeat(10 - filled)}]`;
};

const pathOf = (file) => relative(root, file).split(sep).join('/');
const classifyKind = (text) => (/no canonical identity or source data changes|no projection occurs while model, identity, or parity gates fail/i.test(text) ? 'INVARIANT' : 'WORK_ITEM');
const classifyExecutionState = (text, state, kind) => {
  if (state === 'DONE') return 'DONE';
  if (kind === 'INVARIANT') return 'INVARIANT';
  const value = text.toLowerCase();
  if (/superseded|historical|obsolete|retired|compatibility-only/.test(value)) return 'SUPERSEDED_OR_HISTORICAL';
  if (/promotion-0[12]|promote|freeze the shared candidate population|run som 20x20|only after|ann-03|current source authority|source authority.*not proven|candidate ordinal.*admission|qdrant.*identity.*promotion|current qdrant|exact packet\/chunk identity|candidateordinalmap\/semantic_768\/graph|graph-resolve-06b|graph-06d|registry reconciliation|lsp\/compiler producer|canonical admission|terminal graphify|partial_proven|empty-plan|blocked|not authorized|^do not |requires .* authorization|remains open|pending|unproven|^keep |cannot .* until|safe.?to.?apply\s*[=:]\s*false|before further lifecycle repair|live readback.*pending|readback.*pending/.test(value)) return 'WAITING_ON_DEPENDENCY';
  return 'ACTIONABLE';
};
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

// NS-1/NS-2: optional declared per-task metadata (`wfu:` comment) + task block hashes; see lib/wfu-metadata.mjs.
const sourceFileHashes = {};

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
  const fileText = readFileSync(file, 'utf8');
  sourceFileHashes[pathOf(file)] = sha256(fileText);
  const lines = fileText.split(/\r?\n/);
  let currentSection = '';
  lines.forEach((line, index) => {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) currentSection = sectionSlug(heading[1]);
    const match = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
    if (!match) return;
    const done = match[1].toLowerCase() === 'x';
    const block = taskBlock(lines, index);
    const wfu = parseWfu(block.join('\n'));
    const text = stripWfuComment(match[2].trim());
    const task = {
      taskKey: `${change}:${index + 1}`,
      change,
      source: pathOf(file),
      line: index + 1,
      text,
      state: done ? 'DONE' : 'OPEN',
      kind: classifyKind(text),
      executionState: classifyExecutionState(text, done ? 'DONE' : 'OPEN', classifyKind(text)),
      lane: classifyLane(`${change} ${text}`),
      declaredSourceRef: extractDeclared(text, ['source_ref', 'sourceRef']),
      declaredSourceRevision: extractDeclared(text, ['source_revision', 'sourceRevision']),
      priority: priorityFor(`${change} ${text}`),
      lastUpdatedAt: statSync(file).mtime.toISOString(),
      timestampMethod: 'FILESYSTEM_MTIME',
      blockHash: blockHash(block),
      sectionSlug: currentSection,
      ...(wfu ? { declared: wfu } : {}),
      eta: classifyKind(text) === 'INVARIANT'
        ? { status: 'NOT_APPLICABLE', method: 'PERMANENT_ACCEPTANCE_INVARIANT' }
        : { status: 'UNKNOWN', method: 'NO_RECEIPT_LINKED_THROUGHPUT' },
    };
    const program = classifyProgramTask(task);
    const wave = program.wave;
    const waveDefinition = wave == null ? null : PROGRAM_WAVES.find((item) => item.id === wave);
    const architecture = classifyArchitectureProgram(change);
    task.program = {
      wave,
      waveTitle: waveDefinition?.title ?? null,
      classification: program.classification,
      matchedRule: program.matchedRule,
      architecture,
      milestone: architecture.milestoneId,
      gate: waveDefinition?.exitGate ?? 'UNCLASSIFIED_REVIEW_REQUIRED',
      gateId: wave == null ? null : `GATE-WAVE-${String(wave).padStart(2, '0')}`,
      workPackageKey: null,
    };
    const controllerTask = controllerByTaskKey.get(task.taskKey);
    const controllerCurrent = Boolean(controllerTask && controllerTask.blockHash === task.blockHash);
    task.controllerState = controllerCurrent ? controllerTask.controller?.state : 'STALE_CONTROLLER_RECEIPT';
    task.controllerBlockerKey = controllerCurrent ? controllerTask.controller?.blockerKey ?? null : null;
    task.gateState = classifyGateState(task);
    task.mutationClass = mutationClass(task);
    tasks.push(task);
  });
}

resolveDeclarations(tasks);
for (const task of tasks) {
  task.selectionKey = task.logicalTaskKey ?? task.stableKey;
  task.schedulerPermission = schedulerPermission(task, schedulerSelection);
  task.owner = task.change;
  task.ownerScope = 'OPENSPEC_CHANGE_ONLY_NOT_CANONICAL_RUNTIME_OWNER';
  task.canonicalOwner = null;
  task.dependsOn = task.declared?.dependsOn ?? null;
  task.unlocks = null;
  task.runtimeDependencies = null;
  task.artifactOutputs = null;
  task.proofReceipt = null;
  task.criticalPathRank = null; // Wave is a provisional grouping, not measured dependency rank.
  task.fanoutCount = null;
  task.writeRisk = null;
  task.proofLevel = null;
  task.mutationClassBasis = 'CONSERVATIVE_TEXT_HEURISTIC_REQUIRES_OWNER_REVIEW';
}
const declaredMetadata = summarizeDeclared(tasks);

const openTasks = tasks.filter((task) => task.state === 'OPEN');
if (schedulerSelection) {
  const taskKeys = new Set(tasks.map((task) => task.selectionKey));
  const unknownKeys = schedulerSelection.taskKeys.filter((key) => !taskKeys.has(key));
  if (unknownKeys.length) throw new Error(`UNKNOWN_STABLE_SELECTION_KEY: ${unknownKeys.join(',')}`);
}
const completedTasks = tasks.length - openTasks.length;
const actionableTasks = openTasks.filter((task) => task.executionState === 'ACTIONABLE');
const waitingTasks = openTasks.filter((task) => task.executionState === 'WAITING_ON_DEPENDENCY');
const supersededTasks = openTasks.filter((task) => task.executionState === 'SUPERSEDED_OR_HISTORICAL');
const byPriority = [...actionableTasks].sort((a, b) => a.priority - b.priority || b.lastUpdatedAt.localeCompare(a.lastUpdatedAt) || a.change.localeCompare(b.change) || a.line - b.line);
const openByPriority = [...openTasks].sort((a, b) => a.priority - b.priority || b.lastUpdatedAt.localeCompare(a.lastUpdatedAt) || a.change.localeCompare(b.change) || a.line - b.line);
const frontierTasks = [...byPriority.reduce((frontier, task) => {
  if (!frontier.has(task.change)) frontier.set(task.change, task);
  return frontier;
}, new Map()).values()]
  .sort((a, b) => a.priority - b.priority || b.lastUpdatedAt.localeCompare(a.lastUpdatedAt) || a.change.localeCompare(b.change) || a.line - b.line);
const invariants = tasks.filter((task) => task.kind === 'INVARIANT').map((task) => ({ taskKey: task.taskKey, change: task.change, source: task.source, line: task.line, text: task.text, state: task.state, lastUpdatedAt: task.lastUpdatedAt, timestampMethod: task.timestampMethod, eta: task.eta }));
const waveWorkPackages = PROGRAM_WAVES.map((wave) => {
  const members = tasks.filter((task) => task.state === 'OPEN' && task.program.wave === wave.id);
  return {
    id: `WAVE-${String(wave.id).padStart(2, '0')}`,
    gateId: `GATE-WAVE-${String(wave.id).padStart(2, '0')}`,
    title: wave.title,
    milestone: wave.milestone,
    gates: [wave.exitGate],
    dependsOn: wave.dependsOnWaveIds.map((id) => `WAVE-${String(id).padStart(2, '0')}`),
    dependsOnWaveIds: wave.dependsOnWaveIds,
    prerequisiteExitGates: wave.dependsOnWaveIds.map((id) => PROGRAM_WAVES.find((item) => item.id === id).exitGate),
    taskCount: members.length,
    taskKeys: members.map((task) => task.taskKey),
    actionableCount: members.filter((task) => task.gateState === 'READY').length,
    waitingCount: members.filter((task) => task.gateState !== 'READY').length,
    schedulerPermission: 'NOT_SELECTED',
    state: members.length ? 'PLANNED_NOT_SELECTED' : 'NO_OPEN_TASKS',
  };
});
const reviewQueueTasks = tasks.filter((task) => task.state === 'OPEN' && !task.program.architecture.programId);
const reviewQueue = {
  id: 'UNCLASSIFIED_REVIEW',
  title: 'Unclassified task mapping review',
  milestone: null,
  gates: ['UNCLASSIFIED_REVIEW_REQUIRED'],
  dependsOn: [],
  taskCount: reviewQueueTasks.length,
  taskKeys: reviewQueueTasks.map((task) => task.taskKey),
  actionableCount: 0,
  waitingCount: reviewQueueTasks.length,
  schedulerPermission: 'NOT_SELECTED',
  state: 'REVIEW_REQUIRED',
};
const workPackages = buildProgramWorkPackages(openTasks);
const programGates = buildProgramGates(PROGRAM_WAVES, workPackages);
const hierarchy = buildProgramHierarchy(tasks, workPackages);
const workPackageById = new Map(workPackages.map((workPackage) => [workPackage.id, workPackage]));
for (const task of tasks) {
  const hierarchyMetadata = task.hierarchy;
  const packageId = task.state === 'OPEN' ? task.program?.workPackageKey ?? null : null;
  const workPackage = packageId ? workPackageById.get(packageId) : null;
  const declaredDependencies = hierarchyMetadata?.declaredDependencies ?? [];
  const inheritedDependencies = hierarchyMetadata?.inheritedDependencies ?? [];
  const effectiveDependencies = hierarchyMetadata?.effectiveDependencies ?? [...new Set([...declaredDependencies, ...inheritedDependencies])];
  task.primaryProgramId = hierarchyMetadata?.primaryProgramId ?? null;
  task.secondaryProgramIds = hierarchyMetadata?.secondaryProgramIds ?? [];
  task.milestoneId = task.program?.milestone ?? null;
  task.waveId = task.program?.wave ?? null;
  task.changeGateId = hierarchyMetadata?.changeGateId ?? null;
  task.workPackageId = workPackage?.id ?? null;
  task.declaredDependencies = declaredDependencies;
  task.inheritedDependencies = inheritedDependencies;
  task.effectiveDependencies = effectiveDependencies;
  task.dependsOn = effectiveDependencies;
  task.unlocks = null;
}
const selectedChainOverlay = buildSelectedChainOverlay(hierarchy.changeGates);
const generatedAt = new Date().toISOString();
const completionTracking = computeCompletionTracking({ previous: previousWorkboard, tasks, generatedAt });
const changes = [...new Set(tasks.map((task) => task.change))].sort().map((change) => {
  const rows = tasks.filter((task) => task.change === change);
  const done = rows.filter((task) => task.state === 'DONE').length;
  const openRows = rows.filter((task) => task.state === 'OPEN');
  const actionable = openRows.filter((task) => task.executionState === 'ACTIONABLE').length;
  const waiting = openRows.filter((task) => task.executionState === 'WAITING_ON_DEPENDENCY').length;
  const superseded = openRows.filter((task) => task.executionState === 'SUPERSEDED_OR_HISTORICAL').length;
  const executionState = openRows.length === 0
    ? 'COMPLETE'
    : actionable > 0 && waiting > 0
      ? 'MIXED_ACTIONABLE_AND_WAITING'
      : actionable > 0
      ? 'ADVANCEABLE'
      : waiting > 0 || superseded > 0
        ? 'WAITING_OR_HISTORICAL'
        : 'REVIEW_REQUIRED';
  return {
    change,
    completed: done,
    total: rows.length,
    progressFraction: rows.length ? done / rows.length : null,
    progressBar: progressBar(rows.length ? done / rows.length : null),
    open: rows.length - done,
    actionable,
    waiting,
    superseded,
    executionState,
  };
});
const changeExecutionSummary = {
  complete: changes.filter((change) => change.executionState === 'COMPLETE').length,
  advanceable: changes.filter((change) => change.executionState === 'ADVANCEABLE').length,
  mixed: changes.filter((change) => change.executionState === 'MIXED_ACTIONABLE_AND_WAITING').length,
  waitingOrHistorical: changes.filter((change) => change.executionState === 'WAITING_OR_HISTORICAL').length,
  reviewRequired: changes.filter((change) => change.executionState === 'REVIEW_REQUIRED').length,
};
const changeProgress = new Map(changes.map((change) => [change.change, change]));
const promotionCriticalRank = [
  {
    rank: 1,
    change: 'parent-atlas-retrieval-lineage-dag-convergence',
    dependsOn: [],
    blocker: 'Execution/source producer authority and PacketRevisionOwnerV1 remain unresolved.',
    gate: 'Admitted workspace/source/packet identity and canonical packet revision ownership',
  },
  {
    rank: 2,
    change: 'parent-atlas-gate2-chunk-lineage-convergence',
    dependsOn: ['parent-atlas-retrieval-lineage-dag-convergence'],
    blocker: 'Current workspace to packet to chunk qualification is not proven; historical bridge is not current authority.',
    gate: 'Revision-qualified packet to chunk closure',
  },
  {
    rank: 3,
    change: 'parent-atlas-graph-retrieval-proof',
    dependsOn: ['parent-atlas-retrieval-lineage-dag-convergence', 'parent-atlas-gate2-chunk-lineage-convergence'],
    blocker: 'AST/tree identity and source-span ownership remain provisional.',
    gate: 'Revision-qualified packet to AST/span closure',
  },
  {
    rank: 4,
    change: 'parent-atlas-prefill-routing-residency-convergence',
    dependsOn: ['parent-atlas-retrieval-lineage-dag-convergence', 'parent-atlas-gate2-chunk-lineage-convergence', 'parent-atlas-graph-retrieval-proof'],
    blocker: 'Prefill, routing, residency, Qdrant/cuVS, and GPU work are downstream consumers.',
    gate: 'Planning and executor proofs over an admitted candidate cohort',
  },
  {
    rank: 5,
    change: 'parent-atlas-rpc-packet-registry-fabric',
    dependsOn: ['parent-atlas-retrieval-lineage-dag-convergence', 'parent-atlas-gate2-chunk-lineage-convergence', 'parent-atlas-graph-retrieval-proof'],
    blocker: 'Transport is complete but must remain fail-closed until lineage supplies qualified rows.',
    gate: 'Downstream read surface; no new authority',
  },
].map((item) => ({
  ...item,
  ...(changeProgress.get(item.change) ?? { completed: 0, total: 0, progressFraction: null, progressBar: progressBar(null), open: 0 }),
}));
const criticalChangeNames = new Set(promotionCriticalRank.map((item) => item.change));
const criticalFrontierPatterns = new Map([
  ['parent-atlas-retrieval-lineage-dag-convergence', /PROMOTION-01|PKT-LINEAGE-08|PacketRevisionOwnerV1|CURRENT-SOURCE-COHORT-OWNER|current lineage closure/i],
  ['parent-atlas-gate2-chunk-lineage-convergence', /packet.?chunk|chunk.*lineage|canonical.?chunk|current.*chunk/i],
  ['parent-atlas-graph-retrieval-proof', /ast|tree.?sitter|span|parse_node|symbol.*version|graph identity/i],
  ['parent-atlas-prefill-routing-residency-convergence', /ANN-03|candidateordinal|candidate population|semantic snapshot|prefill routing|residency/i],
  ['parent-atlas-rpc-packet-registry-fabric', /rpc|packet registry|semantic ast packet/i],
]);
const criticalFrontierTasks = promotionCriticalRank.flatMap((rank) => {
  const candidates = openByPriority.filter((task) => task.change === rank.change);
  const pattern = criticalFrontierPatterns.get(rank.change);
  const selected = (pattern ? candidates.find((task) => pattern.test(`${task.taskKey} ${task.text}`)) : null)
    ?? candidates.find((task) => task.executionState === 'ACTIONABLE')
    ?? candidates[0];
  return selected ? [selected] : [];
});
const parallelFrontierTasks = frontierTasks.filter((task) => !criticalChangeNames.has(task.change));
const executionSteps = PROGRAM_WAVES.map((wave, index) => {
  const rows = tasks.filter((task) => task.program.wave === wave.id);
  const done = rows.filter((task) => task.state === 'DONE').length;
  const openRows = rows.filter((task) => task.state === 'OPEN');
  return {
    id: `WAVE-${String(wave.id).padStart(2, '0')}`,
    wave: wave.id,
    milestone: wave.milestone,
    title: wave.title,
    dependsOn: index > 0 ? [`WAVE-${String(index - 1).padStart(2, '0')}`] : [],
    gate: wave.exitGate,
    total: rows.length,
    completed: done,
    open: rows.length - done,
    progressFraction: rows.length ? done / rows.length : null,
    progressBar: progressBar(rows.length ? done / rows.length : null),
    taskKeys: rows.map((task) => task.taskKey),
    schedulerPermission: 'NOT_SELECTED',
    recommendedTasksOnly: openRows.slice(0, 5).map((task) => ({ taskKey: task.taskKey, change: task.change, source: task.source, line: task.line, lane: task.lane, text: task.text, gateState: task.gateState, schedulerPermission: task.schedulerPermission })),
  };
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
  hierarchyContractVersion: 'v2',
  generatedAt,
  source: 'openspec/changes/*/tasks.md',
  summary: { completedTasks, openTasks: openTasks.length, actionableTasks: actionableTasks.length, waitingTasks: waitingTasks.length, supersededTasks: supersededTasks.length, totalTasks: tasks.length, progressFraction: tasks.length ? completedTasks / tasks.length : null, progressBar: progressBar(tasks.length ? completedTasks / tasks.length : null), eta: { status: 'UNKNOWN', method: 'NO_RECEIPT_LINKED_THROUGHPUT' } },
  schedulerPolicy: {
    rule: 'READY_NEVER_IMPLIES_SELECTED; COMPLETION_PERCENTAGE_NEVER_IMPLIES_PRIORITY; ONLY_EXPLICIT_SELECTION_FILE_GRANTS_SELECTION_PERMISSION',
    selectionSource: selectionFile ? pathOf(selectionFile) : null,
    selectedTaskCount: tasks.filter((task) => task.schedulerPermission === 'SELECTED').length,
    recommendedTasksAreAdvisory: true,
  },
  controllerEvidence: {
    path: pathOf(controllerPath),
    generatedAt: controllerReport?.generatedAt ?? null,
    role: 'READINESS_CLASSIFICATION_ONLY_NOT_SELECTION_AUTHORITY',
    matchedCurrentTaskCount: tasks.filter((task) => task.controllerState !== 'STALE_CONTROLLER_RECEIPT').length,
    staleOrMissingTaskCount: tasks.filter((task) => task.controllerState === 'STALE_CONTROLLER_RECEIPT').length,
  },
  ordering: 'PROGRAM_WAVE_THEN_MILESTONE_THEN_WORK_PACKAGE; READINESS_AND_SCHEDULER_PERMISSION_ARE_INDEPENDENT; WORKBOARD_RANKS_ARE_ADVISORY_ONLY; NO_SELECTION_BY_COMPLETION_PERCENTAGE',
  architectureOverlay: buildArchitectureOverlay(),
  implementationProgram: {
    schema: 'atlas.openspec-implementation-program.v1',
    authority: 'ADVISORY_PLAN_ONLY',
    milestones: PROGRAM_MILESTONES,
    waves: waveWorkPackages,
    gates: programGates,
    workPackages,
    reviewQueue,
    programs: hierarchy.programs,
    changeGates: hierarchy.changeGates,
    hierarchyReview: hierarchy.hierarchyReview,
    hierarchyPolicy: hierarchy.hierarchyPolicy,
    selectedChainOverlay,
    leafTaskCount: openTasks.length,
    assignedLeafTaskCount: workPackages.reduce((sum, item) => sum + item.taskCount, 0),
    reviewLeafTaskCount: reviewQueue.taskCount,
    schedulerPermissionDefault: 'NOT_SELECTED',
    dependencies: 'WAVE_EDGES_ARE_DECLARED; LEAF_DEPENDENCIES_ONLY_WHERE_TASK_LEDGER_DECLARES_THEM',
  },
  indexing: {
    sourceRef: buildIndex('declaredSourceRef'),
    sourceRevision: buildIndex('declaredSourceRevision'),
    unclassifiedTasks: tasks.filter((task) => !task.declaredSourceRef && !task.declaredSourceRevision).map((task) => task.taskKey),
    coverage: {
      sourceRefDeclared: tasks.filter((task) => task.declaredSourceRef).length,
      sourceRevisionDeclared: tasks.filter((task) => task.declaredSourceRevision).length,
      taskLedgerSourcePointer: tasks.filter((task) => task.source && Number.isInteger(task.line)).length,
      metadataUnclassified: tasks.filter((task) => !task.declaredSourceRef && !task.declaredSourceRevision).length,
      totalTasks: tasks.length,
    },
  },
  lanes: laneSummary,
  laneDependencies,
  promotionCriticalRank,
  dailyGraphifyKanban: kanbanSnapshot,
  historicalKanbanSnapshots,
  consolidationInput,
  consolidationCandidates,
  workPackages,
  executionSteps,
  invariants,
  changes,
  changeExecutionSummary,
  completionTracking,
  taskInventory: tasks,
  sourceFileHashes,
  declaredMetadata,
  selectedTasks: tasks.filter((task) => task.schedulerPermission === 'SELECTED'),
  recommendedTasks: criticalFrontierTasks.slice(0, 20),
  nextTasks: criticalFrontierTasks.slice(0, 20),
  parallelFrontierTasks: parallelFrontierTasks.slice(0, 50),
  actionableTasks: byPriority.slice(0, 200),
  waitingTasks: waitingTasks.slice(0, 200),
  supersededTasks: supersededTasks.slice(0, 200),
  writes: { taskLedgers: 0, sourceDocuments: 0 },
};

const markdown = [
  '# OpenSpec Workboard', '',
  '> Generated from OpenSpec task ledgers. This is a navigation/progress projection, not task authority.', '',
  '## Memory/agent ownership reconciliation', '',
  '- [2026-09-05 bounded owner reconciliation](reports/memory-agent-openspec-ownership-reconciliation-v1.json): capability-to-owner mapping, current-tree evidence, pending gates and validation results.',
  '- Existing owning tasks.md files remain implementation authority; this report creates no new change or portfolio authority.',
  '- SearchRuntime owns fusion; query features feed the existing ACE/ContextManifest bridge; exact caches and server prefix state retain separate owners.',
  '- The nested wire-agentic-workflows-e2e-test ledger is reference-only. WorkflowActionEventV1 and WorkflowExecutionCoordinatesV1 retain run/backend boundaries.',
  '- Planning reconciliation does not prove runtime convergence, authorize cache/datastore writes, or advance current source/cohort admission.', '',
  `Overall progress: ${result.summary.progressBar} ${completedTasks}/${tasks.length} tasks`,
  `Execution states: ${actionableTasks.length} actionable; ${waitingTasks.length} waiting on dependencies; ${supersededTasks.length} superseded/historical; ${invariants.length} invariants.`,
  `Scheduler permission: ${result.schedulerPolicy.selectedTaskCount} explicitly selected; READY/actionable rows are not selected automatically.`,
  `Change states: ${changeExecutionSummary.complete} complete; ${changeExecutionSummary.advanceable} advanceable; ${changeExecutionSummary.mixed} mixed actionable/waiting; ${changeExecutionSummary.waitingOrHistorical} waiting/historical; ${changeExecutionSummary.reviewRequired} review required.`,
  'ETA: UNKNOWN — no receipt-linked throughput supports a defensible estimate.', '',
  '## Execution program waves', '',
  ...waveWorkPackages.map((item) => `- **${item.id}** ${item.title} — ${item.state}; depends on ${item.dependsOn.join(', ') || 'none'}; gates: ${item.gates.join(', ')}; leaves: ${item.taskCount}`),
  `- **${reviewQueue.id}** ${reviewQueue.title} — ${reviewQueue.state}; leaves: ${reviewQueue.taskCount}.`,
  `- Provisional bounded work packages: ${workPackages.length}; assigned open leaf tasks: ${workPackages.reduce((sum, item) => sum + item.taskCount, 0)}; unclassified leaves are review-only.`, '',
  '## Promotion-critical dependency rank', '',
  '- This rank identifies the authority gates that actually unblock promotion; task counts remain navigation metrics only.',
  ...promotionCriticalRank.map((item) => `- **${item.rank}.** [${item.change}](openspec/changes/${item.change}/) ${item.progressBar} ${item.completed}/${item.total} complete; ${item.open} open — depends on ${item.dependsOn.join(', ') || 'none'}; gate: ${item.gate}; blocker: ${item.blocker}`), '',
  '## Dependency-ordered execution steps', '',
  ...executionSteps.map((item) => `- **${item.id}** ${item.progressBar} ${item.completed}/${item.total} complete; ${item.open} open — ${item.title}; depends on ${item.dependsOn.join(', ') || 'none'}; gate: ${item.gate}`), '',
  '### Advisory task samples by wave (not selected for execution)', '',
  ...executionSteps.flatMap((item) => [
    `**${item.id}**`,
    ...item.recommendedTasksOnly.map((task) => `- ${task.taskKey} — ${task.gateState}; NOT_SELECTED; ${task.lane}; ${task.text} (${task.source}:${task.line})`),
    '',
  ]),
  '## Permanent acceptance invariants', '',
  ...invariants.map((item) => `- **INVARIANT** [${item.change}](${item.source}#L${item.line}) ${item.text} — last updated ${item.lastUpdatedAt} (${item.timestampMethod}); ETA N/A`), '',
  '## Critical-path change frontiers', '',
  '- Frontier rows are advisory recommendations only. `schedulerPermission=SELECTED` is granted only from an explicit selection file; READY/ADVANCEABLE never selects work.',
  ...criticalFrontierTasks.slice(0, 20).map((task) => `- [ ] **P${task.priority}** [${task.change}](${task.source}#L${task.line}) ${task.text} — lane ${task.lane}; last updated ${task.lastUpdatedAt} (${task.timestampMethod}); ETA UNKNOWN`), '',
  '## Parallel proof frontiers', '',
  ...parallelFrontierTasks.slice(0, 50).map((task) => `- [ ] **P${task.priority}** [${task.change}](${task.source}#L${task.line}) ${task.text} — lane ${task.lane}; last updated ${task.lastUpdatedAt} (${task.timestampMethod}); ETA UNKNOWN`), '',
  '## Change execution states', '',
  ...changes.map((change) => `- [${change.change}](openspec/changes/${change.change}/) — **${change.executionState}**; ${change.actionable} actionable, ${change.waiting} waiting, ${change.superseded} superseded/historical; raw progress ${change.progressBar} ${change.completed}/${change.total}`), '',
  '## Task indexing coverage', '',
  `- Declared source_ref: ${result.indexing.coverage.sourceRefDeclared}/${tasks.length}`,
  `- Declared source_revision: ${result.indexing.coverage.sourceRevisionDeclared}/${tasks.length}`,
  `- Task ledger source pointer: ${result.indexing.coverage.taskLedgerSourcePointer}/${tasks.length} (OpenSpec file + line)`,
  `- Metadata-unclassified rows: ${result.indexing.coverage.metadataUnclassified}/${tasks.length}; no source identity was inferred.`,
  `- Declared source fields are optional task metadata, not a measure of repository evidence coverage.`, '',
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
