#!/usr/bin/env node
/**
 * BURNDOWN-01 — canonical OpenSpec STEP dependency burndown.
 *
 * Projection only. Consumes docs/reports/openspec-workboard-v1.json (taskInventory + executionSteps) and nothing else:
 * it does NOT re-parse tasks.md, re-implement priorityFor()/classifyExecutionState(), parse WFU comments, or resolve
 * dependencies. Missing dependency metadata is reported as missing; it is never read as depends=none.
 * Never edits task ledgers, databases, or projections. Never marks a task complete.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workboardPath = join(root, 'docs', 'reports', 'openspec-workboard-v1.json');
const jsonPath = join(root, 'docs', 'reports', 'openspec-step-burndown-v1.json');
const mdPath = join(root, 'docs', 'reports', 'openspec-step-burndown-v1.md');

export const WORKBOARD_SCHEMA = 'atlas.openspec.workboard.v1';

export function assertWorkboardSchema(workboard) {
  if (workboard?.schema !== WORKBOARD_SCHEMA || !Array.isArray(workboard.taskInventory) || !Array.isArray(workboard.executionSteps)) throw new Error(`WORKBOARD_SCHEMA_UNSUPPORTED expected=${WORKBOARD_SCHEMA} actual=${workboard?.schema ?? null}`);
}

export const DISPOSITIONS = ['READY_DECLARED', 'WAITING_DECLARED', 'UNRESOLVED_DEPENDENCY', 'AMBIGUOUS_DEPENDENCY', 'DEPENDENCY_CYCLE', 'MISSING_DEPENDENCY_METADATA'];
const EXEC_STATES = ['ACTIONABLE', 'WAITING_ON_DEPENDENCY', 'SUPERSEDED_OR_HISTORICAL', 'INVARIANT'];

/** Primary (mutually exclusive) disposition from canonical workboard fields only. Precedence: cycle > unresolved > ambiguous > missing > ready/waiting. */
export function classifyDependencyDisposition(task) {
  const declared = task.declared ?? null;
  if (declared?.dependencyState === 'CYCLE_OR_DOWNSTREAM_OF_CYCLE') return 'DEPENDENCY_CYCLE';
  if ((declared?.unresolvedDepends?.length ?? 0) > 0) return 'UNRESOLVED_DEPENDENCY';
  if ((declared?.ambiguousDepends?.length ?? 0) > 0) return 'AMBIGUOUS_DEPENDENCY';
  if (declared == null || declared.dependsOn == null) return 'MISSING_DEPENDENCY_METADATA';
  if (!Array.isArray(task.dependsOnTaskIds)) return 'MISSING_DEPENDENCY_METADATA';
  return (task.remainingRequiredGates ?? 0) === 0 ? 'READY_DECLARED' : 'WAITING_DECLARED';
}

const zeroed = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));
const bump = (map, key, by = 1) => { map[key] = (map[key] ?? 0) + by; };
const sortedObject = (map) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));

export function buildBurndown(workboard) {
  assertWorkboardSchema(workboard);
  const tasks = workboard.taskInventory;
  const byKey = new Map(tasks.map((task) => [task.taskKey, task]));
  const stepOf = new Map();
  const membershipErrors = [];
  for (const step of workboard.executionSteps) {
    for (const key of step.taskKeys) {
      if (stepOf.has(key)) membershipErrors.push(`DUPLICATE_STEP_MEMBERSHIP ${key} in ${stepOf.get(key)} and ${step.id}`);
      stepOf.set(key, step.id);
      if (!byKey.has(key)) membershipErrors.push(`STEP_TASKKEY_NOT_IN_INVENTORY ${key}`);
    }
  }
  for (const task of tasks) if (!stepOf.has(task.taskKey)) membershipErrors.push(`TASK_WITHOUT_STEP ${task.taskKey}`);

  const cycleFieldPresent = tasks.some((task) => task.declared && 'dependencyState' in task.declared);
  const steps = workboard.executionSteps.map((step) => {
    const members = step.taskKeys.map((key) => byKey.get(key)).filter(Boolean);
    const open = members.filter((task) => task.state === 'OPEN');
    const completed = members.filter((task) => task.state === 'DONE').length;
    const byExecutionState = zeroed(EXEC_STATES);
    const byLane = {};
    const byDisposition = zeroed(DISPOSITIONS);
    const changes = new Map();
    let classifierActionableMissingMetadata = 0;
    for (const task of open) {
      const disposition = classifyDependencyDisposition(task);
      bump(byExecutionState, task.executionState);
      bump(byLane, task.lane);
      bump(byDisposition, disposition);
      if (task.executionState === 'ACTIONABLE' && disposition === 'MISSING_DEPENDENCY_METADATA') classifierActionableMissingMetadata += 1;
      const row = changes.get(task.change) ?? { change: task.change, open: 0, ACTIONABLE: 0, WAITING_ON_DEPENDENCY: 0, SUPERSEDED_OR_HISTORICAL: 0, INVARIANT: 0, READY_DECLARED: 0, WAITING_DECLARED: 0, MISSING_DEPENDENCY_METADATA: 0, lanes: {} };
      row.open += 1;
      bump(row, task.executionState);
      if (disposition === 'READY_DECLARED' || disposition === 'WAITING_DECLARED' || disposition === 'MISSING_DEPENDENCY_METADATA') bump(row, disposition);
      bump(row.lanes, task.lane);
      changes.set(task.change, row);
    }
    const changeRows = [...changes.values()];
    const rank = (compare) => [...changeRows].sort(compare).slice(0, 15).map((row, index) => ({ rank: index + 1, ...row }));
    const frontier = open
      .map((task) => ({ task, disposition: classifyDependencyDisposition(task) }))
      .filter(({ disposition }) => disposition === 'READY_DECLARED' || disposition === 'WAITING_DECLARED')
      .sort((a, b) => (a.task.remainingRequiredGates ?? 0) - (b.task.remainingRequiredGates ?? 0)
        || (b.task.unblocksGateCount ?? 0) - (a.task.unblocksGateCount ?? 0)
        || (a.task.priority ?? 0) - (b.task.priority ?? 0)
        || String(a.task.logicalTaskKey).localeCompare(String(b.task.logicalTaskKey)))
      .slice(0, 25)
      .map(({ task, disposition }) => ({
        logicalTaskKey: task.logicalTaskKey, taskRevision: task.taskIdentity?.taskRevision ?? null, change: task.change, line: task.line, executionState: task.executionState,
        disposition, dependsOnTaskIds: task.dependsOnTaskIds ?? [], remainingRequiredGates: task.remainingRequiredGates ?? 0, unblocksGateCount: task.unblocksGateCount ?? 0, priority: task.priority,
      }));
    return {
      id: step.id, title: step.title, gate: step.gate,
      total: members.length, completed, open: open.length, progressFraction: members.length ? completed / members.length : null,
      openByExecutionState: byExecutionState,
      openByLane: sortedObject(byLane),
      openByDependencyDisposition: byDisposition,
      // Classifier-actionable is a text heuristic. Dependency-ready needs declared metadata; the two are not the same.
      classifierActionable: byExecutionState.ACTIONABLE,
      dependencyReadyDeclared: byDisposition.READY_DECLARED,
      classifierActionableWithoutDependencyMetadata: classifierActionableMissingMetadata,
      topChangesByOpenCount: rank((a, b) => b.open - a.open || a.change.localeCompare(b.change)),
      topChangesByActionableCount: rank((a, b) => b.ACTIONABLE - a.ACTIONABLE || b.open - a.open || a.change.localeCompare(b.change)),
      highLeverageFrontier: { advisory: true, basis: 'Only tasks with a declared, resolved dependency list are ranked; undeclared tasks have no dependency evidence to rank on.', tasks: frontier },
      changes: changeRows.sort((a, b) => a.change.localeCompare(b.change)),
    };
  });

  const sum = (pick) => steps.reduce((acc, step) => acc + pick(step), 0);
  const summary = workboard.summary;
  const checks = {
    schemaGuard: workboard.schema === WORKBOARD_SCHEMA,
    stepTotalMatchesWorkboard: sum((s) => s.total) === summary.totalTasks,
    stepCompletedMatchesWorkboard: sum((s) => s.completed) === summary.completedTasks,
    stepOpenMatchesWorkboard: sum((s) => s.open) === summary.openTasks,
    everyTaskKeyInExactlyOneStep: membershipErrors.length === 0 && stepOf.size === tasks.length,
    executionStateBucketsSumToStepOpen: steps.every((s) => Object.values(s.openByExecutionState).reduce((a, b) => a + b, 0) === s.open),
    changeOpenSumsToStepOpen: steps.every((s) => s.changes.reduce((a, c) => a + c.open, 0) === s.open),
    dependencyBucketsMutuallyExclusiveAndExhaustive: steps.every((s) => Object.values(s.openByDependencyDisposition).reduce((a, b) => a + b, 0) === s.open),
    stepCountsMatchWorkboardStepRecords: workboard.executionSteps.every((ws, i) => ws.total === steps[i].total && ws.completed === steps[i].completed && ws.open === steps[i].open),
  };
  const writes = { taskLedgers: 0, databases: 0, projections: 0, reportFilesOnly: ['docs/reports/openspec-step-burndown-v1.json', 'docs/reports/openspec-step-burndown-v1.md'] };
  const declaredCount = tasks.filter((task) => task.declared?.dependsOn != null).length;
  return {
    schema: 'atlas.openspec-step-burndown.v1',
    generatedAt: new Date().toISOString(),
    source: { schema: workboard.schema, workboard: 'docs/reports/openspec-workboard-v1.json', workboardGeneratedAt: workboard.generatedAt },
    summary: { totalTasks: summary.totalTasks, completedTasks: summary.completedTasks, openTasks: summary.openTasks },
    metadataCoverage: {
      tasksWithDeclaredDependencies: declaredCount,
      tasksWithoutDeclaredDependencies: tasks.length - declaredCount,
      cycleFieldPresentInWorkboard: cycleFieldPresent,
      note: cycleFieldPresent ? null : 'Workboard carries no declared.dependencyState, so DEPENDENCY_CYCLE cannot be measured from it; the count is 0 by absence of the field, not by proof of no cycles.',
    },
    interpretation: 'ACTIONABLE is a task-text classifier. It is not dependency-ready. Dependency-ready requires declared metadata (READY_DECLARED); missing metadata is never treated as depends=none.',
    steps,
    membershipErrors,
    validation: { ...checks, allPass: Object.values(checks).every(Boolean) },
    writes,
  };
}

export function renderMarkdown(report) {
  const lines = [
    '# OpenSpec STEP Burndown (BURNDOWN-01)', '',
    `**Source**: \`${report.source.workboard}\` | **Total**: ${report.summary.totalTasks} | **Completed**: ${report.summary.completedTasks} | **Open**: ${report.summary.openTasks} | **Validation**: ${report.validation.allPass ? 'PASS' : 'FAIL'}`, '',
    `> ${report.interpretation}`, '',
    `Dependency metadata declared on ${report.metadataCoverage.tasksWithDeclaredDependencies} of ${report.summary.totalTasks} tasks.${report.metadataCoverage.note ? ` ${report.metadataCoverage.note}` : ''}`, '',
    '| STEP | Done/Total | Open | Classifier-ACTIONABLE | Dependency-ready (declared) | ACTIONABLE w/o dep metadata | WAITING | SUPERSEDED |', '|---|---|---|---|---|---|---|---|',
    ...report.steps.map((s) => `| ${s.id} | ${s.completed}/${s.total} | ${s.open} | ${s.classifierActionable} | ${s.dependencyReadyDeclared} | ${s.classifierActionableWithoutDependencyMetadata} | ${s.openByExecutionState.WAITING_ON_DEPENDENCY} | ${s.openByExecutionState.SUPERSEDED_OR_HISTORICAL} |`), '',
  ];
  for (const s of report.steps) {
    lines.push(`## ${s.id} — ${s.title}`, '', `Dependency disposition: ${Object.entries(s.openByDependencyDisposition).map(([k, v]) => `${k}=${v}`).join(', ')}`, '');
    lines.push('**Top changes by open count**', '', '| # | Change | Open | ACTIONABLE | WAITING | SUPERSEDED |', '|---|---|---|---|---|---|', ...s.topChangesByOpenCount.slice(0, 8).map((c) => `| ${c.rank} | ${c.change} | ${c.open} | ${c.ACTIONABLE} | ${c.WAITING_ON_DEPENDENCY} | ${c.SUPERSEDED_OR_HISTORICAL} |`), '');
    lines.push('**Top changes by actionable count**', '', '| # | Change | ACTIONABLE | Open |', '|---|---|---|---|', ...s.topChangesByActionableCount.slice(0, 8).map((c) => `| ${c.rank} | ${c.change} | ${c.ACTIONABLE} | ${c.open} |`), '');
    lines.push(`**Frontier (advisory)**: ${s.highLeverageFrontier.tasks.length} task(s) with declared dependencies`, '');
    for (const t of s.highLeverageFrontier.tasks.slice(0, 5)) lines.push(`- ${t.logicalTaskKey} — ${t.disposition}, gates=${t.remainingRequiredGates}, unblocks=${t.unblocksGateCount}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!existsSync(workboardPath)) throw new Error(`WORKBOARD_MISSING: ${workboardPath} — run: node scripts/atlas/build-openspec-workboard-v1.mjs`);
  const report = buildBurndown(JSON.parse(readFileSync(workboardPath, 'utf8')));
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, renderMarkdown(report));
  console.log(`STEP_BURNDOWN_BUILT validation=${report.validation.allPass ? 'PASS' : 'FAIL'} open=${report.summary.openTasks}`);
  console.log(JSON.stringify(report.validation));
  if (!report.validation.allPass) process.exitCode = 1;
}
