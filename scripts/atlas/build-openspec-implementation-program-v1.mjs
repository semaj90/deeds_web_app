#!/usr/bin/env node
/** Build an achievable, advisory program from the current OpenSpec workboard snapshot. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHITECTURE_GATES, PROGRAM_MILESTONES, analyzeWorkPackageFeasibility, buildProgramMappingReview } from './lib/openspec-program-plan-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const inputPath = path.resolve(root, process.argv[2] ?? 'docs/reports/openspec-workboard-v1.json');
const outputPath = path.resolve(root, process.argv[3] ?? 'docs/reports/openspec-achievable-implementation-program-v1.json');
const markdownPath = path.resolve(root, process.argv[4] ?? 'docs/reports/openspec-achievable-implementation-program-v1.md');
const board = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
if (board.schema !== 'atlas.openspec.workboard.v1' || !Array.isArray(board.taskInventory)) throw new Error('WORKBOARD_SOURCE_INVALID');

const allTasks = board.taskInventory;
const tasks = allTasks.filter((task) => task.state === 'OPEN');
const hierarchy = board.implementationProgram;
if (!hierarchy || !Array.isArray(hierarchy.workPackages) || !Array.isArray(hierarchy.programs)) throw new Error('WORKBOARD_HIERARCHY_MISSING');
const architectureOverlay = board.architectureOverlay;
if (architectureOverlay?.schema !== 'atlas.openspec-program-overlay.v1' || 'taskAssignments' in architectureOverlay) {
  throw new Error('WORKBOARD_ARCHITECTURE_OVERLAY_INVALID_OR_DUPLICATES_LEAF_TASKS');
}
const workPackages = hierarchy.workPackages;
const reviewQueue = hierarchy.reviewQueue;
const taskByKey = new Map(tasks.map((task) => [task.taskKey, task]));
if (taskByKey.size !== tasks.length) throw new Error('OPEN_TASK_KEY_COLLISION');

const packageKeys = workPackages.flatMap((item) => item.taskKeys);
const reviewKeys = reviewQueue?.taskKeys ?? [];
const accountedKeys = [...packageKeys, ...reviewKeys];
const accounted = new Set(accountedKeys);
const duplicateKeys = accountedKeys.filter((key, index) => accountedKeys.indexOf(key) !== index);
const missingKeys = tasks.filter((task) => !accounted.has(task.taskKey)).map((task) => task.taskKey);
const foreignKeys = accountedKeys.filter((key) => !taskByKey.has(key));
if (duplicateKeys.length || missingKeys.length || foreignKeys.length || accountedKeys.length !== tasks.length) {
  throw new Error(`OPEN_TASK_ACCOUNTING_FAILED:duplicates=${duplicateKeys.length}:missing=${missingKeys.length}:foreign=${foreignKeys.length}`);
}

const mutationClasses = [...new Set(tasks.map((task) => task.mutationClass ?? 'UNCLASSIFIED'))].sort();
const gateStates = [...new Set(tasks.map((task) => task.gateState ?? 'REVIEW_REQUIRED'))].sort();
for (const item of workPackages) {
  const members = item.taskKeys.map((key) => taskByKey.get(key));
  if (new Set(members.map((task) => task.mutationClass ?? 'UNCLASSIFIED')).size !== 1) throw new Error(`PACKAGE_MIXED_MUTATION_CLASS:${item.id}`);
  if (new Set(members.map((task) => task.gateState ?? 'REVIEW_REQUIRED')).size !== 1) throw new Error(`PACKAGE_MIXED_GATE_STATE:${item.id}`);
  if (members.some((task) => task.schedulerPermission !== 'NOT_SELECTED')) throw new Error(`PACKAGE_CONTAINS_SELECTED_TASK:${item.id}`);
}

const byMilestone = PROGRAM_MILESTONES.map((milestone) => {
  const members = tasks.filter((task) => task.milestoneId === milestone.id);
  return { ...milestone, openTaskCount: members.length,
    readyCount: members.filter((task) => task.gateState === 'READY').length,
    blockedOrWaitingCount: members.filter((task) => !['READY', 'PROOF_ONLY', 'COMPLETE', 'SUPERSEDED'].includes(task.gateState)).length,
    workPackageCount: workPackages.filter((item) => item.milestoneId === milestone.id).length,
    schedulerPermission: 'NOT_SELECTED' };
});

const currentGateCounts = Object.fromEntries(gateStates.map((state) => [state, tasks.filter((task) => task.gateState === state).length]));
const mutationCounts = Object.fromEntries(mutationClasses.map((kind) => [kind, tasks.filter((task) => task.mutationClass === kind).length]));
const mappingCounts = Object.fromEntries([...new Set(tasks.map((task) => task.hierarchy?.mappingStatus ?? 'UNCLASSIFIED'))].sort()
  .map((status) => [status, tasks.filter((task) => (task.hierarchy?.mappingStatus ?? 'UNCLASSIFIED') === status).length]));
const byProgram = hierarchy.programs.map((program) => ({ ...program,
  workPackageCount: workPackages.filter((item) => item.programId === program.id).length,
  gateStateCounts: Object.fromEntries(gateStates.map((state) => [state, tasks.filter((task) => task.primaryProgramId === program.id && task.gateState === state).length]).filter(([, count]) => count > 0)),
  mutationClassCounts: Object.fromEntries(mutationClasses.map((kind) => [kind, tasks.filter((task) => task.primaryProgramId === program.id && task.mutationClass === kind).length]).filter(([, count]) => count > 0)),
}));
const programMappingReview = buildProgramMappingReview(tasks);
const ambiguousProgramMappings = programMappingReview.filter((row) => row.candidatePrograms.length > 1);
const packageFeasibility = analyzeWorkPackageFeasibility(tasks, {
  currentChunkSize: 10,
  minimumTasksPerPackage: 3,
  maximumTasksPerPackage: 12,
  targetMinimumPackages: 250,
  targetMaximumPackages: 400,
});
if (packageFeasibility.currentPackageCount !== workPackages.length) {
  throw new Error(`PACKAGE_FEASIBILITY_COUNT_MISMATCH:${packageFeasibility.currentPackageCount}:${workPackages.length}`);
}

const plan = {
  schema: 'atlas.openspec-achievable-implementation-program.v1',
  generatedAt: new Date().toISOString(),
  source: { path: path.relative(root, inputPath).replaceAll('\\', '/'), schema: board.schema,
    generatedAt: board.generatedAt, taskCount: allTasks.length, sourceFileHashes: board.sourceFileHashes ?? null },
  authority: 'PROGRAM_OVERLAY_AND_IMPLEMENTATION_INDEX_ONLY_NOT_TASK_LEDGER_OR_RUNTIME_AUTHORITY',
  policy: {
    readyIsNotSelected: true, completionPercentageIsNotPriority: true,
    schedulerPermissionDefault: 'NOT_SELECTED', selectedTaskCount: tasks.filter((task) => task.schedulerPermission === 'SELECTED').length,
    milestonesAndWavesAreMetadataNotImplicitDependencies: true,
    onlyDeclaredTaskDependenciesAndNamedArchitectureGateEdgesAreRetained: true,
    unmappedLeavesRemainInReviewQueue: true,
    ownerMeansOpenSpecChangeOwnerOnly: true,
    canonicalRuntimeOwnerIsNeverInferred: true,
    architectureOverlayIsConstraintsOnly: true,
    noTaskLedgerOrDatastoreMutation: true,
  },
  summary: {
    totalTasks: allTasks.length, completedTasks: allTasks.filter((task) => task.state === 'DONE').length,
    openTasks: tasks.length, ledgerActionableOpenTasks: tasks.filter((task) => task.executionState === 'ACTIONABLE').length,
    currentlyReadyOpenTasks: tasks.filter((task) => task.gateState === 'READY').length,
    proofOnlyOpenTasks: tasks.filter((task) => task.gateState === 'PROOF_ONLY').length,
    waitingOrBlockedOpenTasks: tasks.filter((task) => !['READY', 'PROOF_ONLY', 'COMPLETE', 'SUPERSEDED'].includes(task.gateState)).length,
    schedulerSelectedOpenTasks: tasks.filter((task) => task.schedulerPermission === 'SELECTED').length,
    workPackageCount: workPackages.length, reviewRequiredTaskCount: reviewKeys.length,
    accountedOpenTasks: accountedKeys.length, duplicateTaskAssignments: duplicateKeys.length,
    missingTaskAssignments: missingKeys.length, foreignTaskAssignments: foreignKeys.length,
    workPackagesUnderThreeTasks: workPackages.filter((item) => item.taskCount < 3).length,
    packageBoundary: 'ONE_CHANGE_OWNER + ONE_PROGRAM + ONE_MUTATION_CLASS + ONE_GATE_STATE; small packages remain separate rather than merging unlike work',
    packageFeasibility,
    declaredDependencyTasks: tasks.filter((task) => (task.declaredDependencies ?? []).length > 0).length,
    leavesWithoutDeclaredDependencies: tasks.filter((task) => !(task.declaredDependencies ?? []).length).length,
    dependenciesInvented: 0,
    programMappingStatusCounts: mappingCounts,
    programMappingReviewChangeCount: programMappingReview.length,
    ambiguousProgramMappingChangeCount: ambiguousProgramMappings.length,
    multipleCandidateCorporaChangeCount: programMappingReview.filter((row) => row.multipleCandidateCorpora).length,
    currentControllerEvidence: board.controllerEvidence ?? null,
    gateStateCounts: currentGateCounts, mutationClassCounts: mutationCounts,
  },
  milestones: byMilestone,
  architectureOverlay,
  architectureGates: ARCHITECTURE_GATES.map((gate) => ({ ...gate, proofReceipt: null, proofLevel: null,
    state: 'UNPROVEN_UNSELECTED', schedulerPermission: 'NOT_SELECTED' })),
  programs: byProgram,
  programMappingReview,
  changeGates: hierarchy.changeGates,
  workPackages,
  reviewQueue: { ...reviewQueue, taskKeys: reviewKeys, schedulerPermission: 'NOT_SELECTED' },
  tasks,
};

const markdown = [
  '# OpenSpec achievable implementation program', '',
  '> Advisory planning index over the current task inventory. It does not alter task ledgers, authorize mutations, or select work.', '',
  `- Snapshot: ${plan.source.generatedAt}; ${plan.summary.totalTasks} total tasks, ${plan.summary.openTasks} open, ${plan.summary.currentlyReadyOpenTasks} currently READY, ${plan.summary.workPackageCount} bounded work packages, ${plan.summary.reviewRequiredTaskCount} review-required leaves.`,
  `- Exact accounting: ${plan.summary.accountedOpenTasks}/${plan.summary.openTasks}; duplicate assignments ${plan.summary.duplicateTaskAssignments}; missing ${plan.summary.missingTaskAssignments}; selected ${plan.summary.schedulerSelectedOpenTasks}.`,
  `- Program mapping status: ${Object.entries(mappingCounts).map(([status, count]) => `${status}=${count}`).join(', ')}. PROVISIONAL mappings require owner review before they can be treated as canonical program assignments.`,
  '- Package boundary: one change owner, one program, one mutation class, one gate state. Small packages are retained instead of merging unlike work.',
  `- Package sizing feasibility: ${packageFeasibility.groupCount} owner/program/mutation/readiness groups imply at least ${packageFeasibility.minimumPackageCountAtMaximumSize} packages at a 12-task cap. Even dropping program and readiness partitions, preserving the current per-change owner plus one mutation class requires at least ${packageFeasibility.minimumPackagesPreservingChangeOwnerAndMutation} packages; ${packageFeasibility.ownerMutationGroupsBelowMinimum} such groups contain fewer than ${packageFeasibility.minimumTasksPerPackage} tasks. Target ${packageFeasibility.targetPackageRange.minimum}–${packageFeasibility.targetPackageRange.maximum} is ${packageFeasibility.targetAchievablePreservingChangeOwnerAndMutation ? 'feasible' : 'not achievable'} without changing owner/mutation grouping or the 3–12 size rule. No groups were merged automatically.`,
  '- Milestones and waves organize the plan only. They do not create implicit dependency edges.',
  '- Missing leaf dependencies remain missing; no dependencies were fabricated.', '',
  '## Milestones', '',
  ...byMilestone.map((milestone) => `- **${milestone.id} ${milestone.name}** — ${milestone.openTaskCount} open tasks; ${milestone.readyCount} READY; ${milestone.blockedOrWaitingCount} blocked/waiting; ${milestone.workPackageCount} packages. Exit: ${milestone.exitCondition}`), '',
  '## Programs', '',
  ...byProgram.map((program) => `- **${program.id} ${program.name}** — ${program.openTaskCount} open / ${program.totalTaskCount} total; ${program.workPackageCount} packages; primary lane ${program.primaryLane}; corpus ${program.corpus}; mapping remains ${program.ownerScope}.`), '',
  '## Change-level program mapping review', '',
  `- ${programMappingReview.length} open changes remain provisional; ${ambiguousProgramMappings.length} match multiple domain rules; ${programMappingReview.filter((row) => row.multipleCandidateCorpora).length} have multiple candidate corpus domains requiring review. This review list contains change summaries, not duplicate leaf tasks, and never selects work.`,
  ...programMappingReview.map((row) => `- **${row.change}** — ${row.openTaskCount} open; provisional ${row.provisionalPrimaryProgramId ?? 'UNMAPPED'}; candidates ${row.candidatePrograms.map((candidate) => `${candidate.programId}/${candidate.corpus}`).join(', ') || 'none'}; mutation classes ${Object.entries(row.mutationClassCounts).map(([key, count]) => `${key}=${count}`).join(', ')}; declared-dependency tasks ${row.declaredDependencyTaskCount}; NOT_SELECTED.`), '',
  '## Readiness / mutation census', '',
  ...Object.entries(currentGateCounts).map(([name, count]) => `- ${name}: ${count}`),
  ...Object.entries(mutationCounts).map(([name, count]) => `- Mutation ${name}: ${count}`), '',
  '## Work packages', '',
  ...workPackages.map((item) => `- **${item.id}** — ${item.taskCount} tasks; ${item.gateState}; ${item.mutationClass}; ${item.corpus}; ${item.taskKeys.join(', ')}; NOT_SELECTED.`), '',
  '## Review-required leaves', '',
  ...(reviewKeys.length ? reviewKeys.map((key) => `- ${key}: ${taskByKey.get(key)?.text ?? ''}`) : ['- None in this snapshot.']), '',
  '## Open leaf detail', '',
  ...tasks.map((task) => `- ${task.taskKey} — ${task.gateState}; ${task.mutationClass}; ${task.primaryProgramId ?? 'REVIEW_REQUIRED'}; ${task.milestoneId ?? 'NO_MILESTONE'}; ${task.workPackageId ?? 'NO_PACKAGE'}; NOT_SELECTED — ${task.text}`), '',
].join('\n');

fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
fs.writeFileSync(markdownPath, `${markdown}\n`, 'utf8');
console.log(JSON.stringify({ schema: plan.schema, generatedAt: plan.generatedAt, summary: plan.summary,
  outputPath, markdownPath, localArtifactsWritten: true, taskLedgersEdited: 0, persistentWritesPerformed: false }, null, 2));
