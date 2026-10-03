import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWorkPackageFeasibility, buildArchitectureOverlay, buildProgramHierarchy, buildProgramMappingReview, buildSelectedChainOverlay, computeCompletionTracking, buildProgramGates, buildProgramWorkPackages, classifyArchitectureProgram, classifyGateState, classifyProgramTask, isValidSchedulerSelection, mutationClass, PROGRAM_WAVES, schedulerPermission, validateArchitectureOverlay, validateOwnershipBoundaries } from './openspec-program-plan-v1.mjs';

const task = (change, text, extra = {}) => ({ taskKey: `${change}:K-1`, change, text, state: 'OPEN', executionState: 'ACTIONABLE', ...extra });

test('source authority and Gate 2 sort into the lineage wave ahead of downstream lanes', () => {
  assert.equal(classifyProgramTask(task('parent-atlas-retrieval-lineage-dag-convergence', 'qualify packet revision')).wave, 2);
  assert.equal(classifyProgramTask(task('parent-atlas-gate2-chunk-lineage-convergence', 'prove current chunk lineage')).wave, 2);
  assert.equal(classifyProgramTask(task('parent-atlas-candidate-feature-execution-fabric', 'freeze feature matrix')).wave, 5);
});

test('architectural milestone assignment is independent from legacy wave heuristics', () => {
  const change = 'agent-branch-review-fanout-ace-centroid-aug22';
  assert.equal(classifyProgramTask(task(change, 'ACE memory')).wave, 7);
  assert.equal(classifyArchitectureProgram(change).programId, 'ACE_MEMORY');
  assert.equal(classifyArchitectureProgram(change).milestoneId, 'M2');
});

test('program waves encode prerequisite gates without selecting leaf tasks', () => {
  // No synthetic sequential-wave edges: presentation order must not imply dependency.
  assert.ok(PROGRAM_WAVES.every((wave) => wave.dependsOnWaveIds.length === 0));
  assert.ok(PROGRAM_WAVES.every((wave) => Array.isArray(wave.dependsOnWaveIds)));
});

test('machine-readable overlay validates ownership roles and refuses owner/executor collisions', () => {
  assert.equal(validateArchitectureOverlay(), true);
  assert.throws(() => validateOwnershipBoundaries([
    { domain: 'BAD', authorityRole: 'PROJECTION', canonicalOwner: 'Qdrant', representation: null, executor: 'Qdrant', transport: null },
  ]), /OVERLAY_OWNER_CATEGORY_COLLISION/);
});

test('program overlay is architectural metadata, not a duplicated task list or runtime proof', () => {
  const overlay = buildArchitectureOverlay();
  assert.deepEqual(overlay.milestones.map((milestone) => milestone.id), ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6']);
  assert.equal(overlay.gates.length, 17);
  assert.ok(overlay.gates.every((gate) => gate.kind === 'ARCHITECTURE_PREREQUISITE' && gate.schedulerPermission === 'NOT_SELECTED'));
  assert.ok(overlay.gates.some((gate) => gate.dependsOnGateIds.length > 0));
  assert.equal(overlay.programs.find((program) => program.id === 'EXTERNAL_DOCS').corpus, 'EXTERNAL_DOCUMENT');
  assert.equal(overlay.programs.find((program) => program.id === 'CODE_RETRIEVAL').corpus, 'CODEBASE_PACKET');
  assert.equal(overlay.programs.every((program) => program.evidenceScope === 'ARCHITECTURAL_CONSTRAINT_NOT_RUNTIME_CLAIM'), true);
  assert.equal(overlay.programs.every((program) => program.promotionState === 'NOT_ELIGIBLE'), true);
  assert.equal(overlay.corpusSeparation.crossCorpusDependencyInference, false);
  assert.equal('taskAssignments' in overlay, false);
  assert.equal('unmappedTaskKeys' in overlay, false);
});

test('program mapping review surfaces rule collisions without selecting or remapping tasks', () => {
  const rows = buildProgramMappingReview([
    task('parent-atlas-deep-research-ingestion', 'external pages'),
    task('parent-atlas-deep-research-ingestion', 'LDR validation'),
    { ...task('parent-atlas-deep-research-ingestion', 'already done'), state: 'DONE' },
    task('parent-atlas-retrieval-lineage-dag-convergence', 'source authority'),
  ]);
  const deepResearch = rows.find((row) => row.change === 'parent-atlas-deep-research-ingestion');
  assert.equal(rows.length, 2);
  assert.equal(deepResearch.openTaskCount, 2);
  assert.equal(deepResearch.mappingStatus, 'PROVISIONAL_REQUIRES_REVIEW');
  assert.deepEqual(deepResearch.candidatePrograms.map((candidate) => candidate.programId), ['EXTERNAL_DOCS', 'LDR_VALIDATION']);
  assert.equal(deepResearch.multipleCandidateCorpora, false);
  assert.equal(deepResearch.schedulerPermission, 'NOT_SELECTED');
  assert.equal(rows.find((row) => row.change === 'parent-atlas-retrieval-lineage-dag-convergence').candidatePrograms.length, 1);
});

test('gate nodes mirror only declared wave edges and aggregate their packages', () => {
  const workPackages = [
    { id: 'w0-a', wave: 0, taskCount: 2, taskKeys: ['a:1', 'a:2'] },
    { id: 'w1-a', wave: 1, taskCount: 3, taskKeys: ['b:1', 'b:2', 'b:3'] },
  ];
  const gates = buildProgramGates(PROGRAM_WAVES, workPackages);
  assert.equal(gates.length, 11);
  assert.deepEqual(gates.find((gate) => gate.waveId === 1).dependsOnGateIds, []);
  assert.deepEqual(gates.find((gate) => gate.waveId === 1).workPackageIds, ['w1-a']);
  assert.equal(gates.find((gate) => gate.waveId === 1).taskCount, 3);
  assert.ok(gates.every((gate) => gate.proofReceipt === null && gate.schedulerPermission === 'NOT_SELECTED'));
});

test('work packages contain classified leaves only; unmapped leaves remain in the separate review queue', () => {
  const leaves = [
    { taskKey: 'a:1', change: 'a', line: 1, program: { wave: 0, milestone: 'M0', architecture: { programId: 'CONTROL_PLANE', milestoneId: 'M0' } } },
    { taskKey: 'b:2', change: 'b', line: 2, program: { wave: 9, milestone: 'M4', architecture: { programId: 'PROJECTION_EXECUTORS', milestoneId: 'M4' } } },
    { taskKey: 'c:3', change: 'c', line: 3, program: { wave: null, milestone: null, architecture: { programId: null } } },
  ];
  const packages = buildProgramWorkPackages(leaves);
  const keys = packages.flatMap((item) => item.taskKeys);
  assert.deepEqual(keys.sort(), ['a:1', 'b:2']);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(packages.find((item) => item.taskKeys.includes('b:2')).dependsOnWaveIds, []);
  assert.equal(packages.some((item) => item.taskKeys.includes('c:3')), false);
  const reviewTaskKeys = leaves.filter((item) => !item.program.architecture.programId).map((item) => item.taskKey);
  assert.deepEqual(reviewTaskKeys, ['c:3']);
  assert.equal(new Set([...keys, ...reviewTaskKeys]).size, leaves.length);
});

test('work packages never mix mutation class or readiness gate and retain wave metadata without edges', () => {
  const base = { program: { wave: 2, milestone: 'M0', architecture: { programId: 'SOURCE_AUTHORITY', milestoneId: 'M0', lane: 'LINEAGE', corpus: 'CODEBASE_PACKET' } } };
  const rows = [
    { taskKey: 'x:1', change: 'x', line: 1, mutationClass: 'CODE_ONLY', gateState: 'READY', ...base },
    { taskKey: 'x:2', change: 'x', line: 2, mutationClass: 'DB_WRITE', gateState: 'AUTHORIZATION_REQUIRED', ...base },
    { taskKey: 'x:3', change: 'x', line: 3, mutationClass: 'CODE_ONLY', gateState: 'READY', ...base, program: { ...base.program, wave: 3 } },
  ];
  const packages = buildProgramWorkPackages(rows);
  assert.equal(packages.length, 2);
  assert.ok(packages.every((item) => item.taskKeys.length > 0 && item.taskCount <= 10));
  assert.ok(packages.every((item) => item.taskKeys.every((key) => rows.find((row) => row.taskKey === key).mutationClass === item.mutationClass)));
  assert.ok(packages.every((item) => item.taskKeys.every((key) => rows.find((row) => row.taskKey === key).gateState === item.gateState)));
  const codePackage = packages.find((item) => item.mutationClass === 'CODE_ONLY');
  assert.deepEqual(codePackage.waveIds, [2, 3]);
  assert.equal(codePackage.wave, null);
  assert.equal(codePackage.dependsOn.length, 0);
});

test('package feasibility reports lower bound without relaxing boundaries or selecting tasks', () => {
  const rows = [
    ...Array.from({ length: 25 }, (_, i) => ({ taskKey: `a:${i}`, change: 'a', mutationClass: 'CODE_ONLY', gateState: 'READY', program: { architecture: { programId: 'P' } } })),
    ...Array.from({ length: 2 }, (_, i) => ({ taskKey: `b:${i}`, change: 'b', mutationClass: 'CODE_ONLY', gateState: 'READY', program: { architecture: { programId: 'P' } } })),
    { taskKey: 'review:1', change: 'review', program: { architecture: { programId: null } } },
  ];
  const result = analyzeWorkPackageFeasibility(rows, { currentChunkSize: 10, targetMinimumPackages: 2, targetMaximumPackages: 4 });
  assert.equal(result.groupCount, 2);
  assert.equal(result.classifiedTaskCount, 27);
  assert.equal(result.reviewRequiredTaskCount, 1);
  assert.equal(result.currentPackageCount, 4);
  assert.equal(result.currentUndersizedPackageCount, 1);
  assert.equal(result.minimumPackageCountAtMaximumSize, 4);
  assert.equal(result.minimumPackagesPreservingChangeOwnerAndMutation, 4);
  assert.equal(result.ownerMutationGroupsBelowMinimum, 1);
  assert.equal(result.targetAchievablePreservingChangeOwnerAndMutation, false);
  assert.equal(result.maximumPackageCountAtMinimumSize, 8);
  assert.equal(result.boundaryGroupsBelowMinimum, 1);
  assert.equal(result.targetAchievableWithoutBoundaryChanges, false);
  assert.deepEqual(result.boundary, ['CHANGE_OWNER', 'PRIMARY_PROGRAM', 'MUTATION_CLASS', 'GATE_STATE']);
  assert.equal(result.dependenciesInvented, 0);
  assert.equal(result.tasksSelected, 0);
});

test('READY does not imply scheduler selection; only explicit selected task keys pass', () => {
  const row = { ...task('x', 'unit test'), selectionKey: 'stable:x:1', gateState: 'READY' };
  assert.equal(classifyGateState({ ...row, controllerState: 'ACTIONABLE' }), 'READY');
  assert.equal(classifyGateState({ ...row, controllerState: 'STALE_CONTROLLER_RECEIPT' }), 'REVIEW_REQUIRED');
  assert.equal(classifyGateState({ ...task('x', 'unreceipted action'), executionState: 'ACTIONABLE' }), 'REVIEW_REQUIRED');
  assert.equal(schedulerPermission(row), 'NOT_SELECTED');
  assert.equal(schedulerPermission(row, { permission: 'SELECTED', taskKeys: [row.selectionKey] }), 'SELECTED');
  assert.equal(schedulerPermission(row, { permission: 'SELECTED', taskKeys: [row.taskKey] }), 'NOT_SELECTED');
  assert.equal(schedulerPermission({ ...row, gateState: 'BLOCKED_BY_LINEAGE' }, { permission: 'SELECTED', taskKeys: [row.selectionKey] }), 'NOT_SELECTED');
  assert.equal(schedulerPermission({ ...row, state: 'DONE' }, { permission: 'SELECTED', taskKeys: [row.selectionKey] }), 'NOT_SELECTED');
  assert.equal(schedulerPermission({ ...row, gateState: 'SUPERSEDED' }, { permission: 'SELECTED', taskKeys: [row.selectionKey] }), 'NOT_SELECTED');
});

test('scheduler selection manifest requires a nonempty, unique exact task-key list', () => {
  assert.equal(isValidSchedulerSelection({ schema: 'atlas.openspec-scheduler-selection.v1', permission: 'SELECTED', taskKeys: ['x:1'] }), true);
  assert.equal(isValidSchedulerSelection({ schema: 'atlas.openspec-scheduler-selection.v1', permission: 'SELECTED', taskKeys: [] }), false);
  assert.equal(isValidSchedulerSelection({ schema: 'atlas.openspec-scheduler-selection.v1', permission: 'SELECTED', taskKeys: ['x:1', 'x:1'] }), false);
  assert.equal(isValidSchedulerSelection({ schema: 'wrong', permission: 'SELECTED', taskKeys: ['x:1'] }), false);
});

test('waiting and historical states remain non-ready', () => {
  assert.equal(classifyGateState(task('x', 'needs source', { executionState: 'WAITING_ON_DEPENDENCY' })), 'WAITING_FOR_DEPENDENCY');
  assert.equal(classifyGateState(task('x', 'obsolete', { executionState: 'SUPERSEDED_OR_HISTORICAL' })), 'SUPERSEDED');
});

test('current controller evidence separates proof-only, authority waits, and stale receipts', () => {
  assert.equal(classifyGateState(task('x', 'still an open ledger row', { controllerState: 'PROVEN' })), 'PROOF_ONLY');
  assert.equal(classifyGateState(task('x', 'packet lineage', { controllerState: 'WAITING_ON_AUTHORITY', controllerBlockerKey: 'CURRENT_SOURCE_AUTHORITY' })), 'BLOCKED_BY_LINEAGE');
  assert.equal(classifyGateState(task('x', 'stale task row', { controllerState: 'STALE_CONTROLLER_RECEIPT' })), 'REVIEW_REQUIRED');
});

test('unknown task grouping is visibly review-required and mutation defaults conservatively', () => {
  const unclassified = classifyProgramTask(task('odd-change', 'something unexplained'));
  assert.equal(unclassified.classification, 'UNCLASSIFIED_REVIEW_REQUIRED');
  assert.equal(unclassified.wave, null);
  assert.equal(classifyProgramTask(task('atlas-feature-intelligence', 'Materialize typed Feature↔Evidence relations')).wave, 5);
  assert.equal(mutationClass(task('odd-change', 'something unexplained')), 'CODE_ONLY');
  assert.equal(mutationClass(task('x', 'write Qdrant projection')), 'PROJECTION_WRITE');
});

const done = (change, key, extra = {}) => ({ taskKey: `${change}:${key}`, change, text: `t${key}`, state: 'DONE', selectionKey: `${change}#${key}`, ...extra });
const open = (change, key, extra = {}) => ({ ...done(change, key), state: 'OPEN', program: { wave: 2, milestone: classifyArchitectureProgram(change).milestoneId, architecture: classifyArchitectureProgram(change), workPackageKey: null }, ...extra });

test('hierarchy: one primary program per change, provisional by name rule, unmapped stays review', () => {
  const tasks = [open('parent-atlas-retrieval-lineage-dag-convergence', 1), done('parent-atlas-retrieval-lineage-dag-convergence', 2), open('totally-unknown-change', 3)];
  const h = buildProgramHierarchy(tasks, buildProgramWorkPackages(tasks));
  const lineage = h.changeGates.find((gate) => gate.change === 'parent-atlas-retrieval-lineage-dag-convergence');
  assert.equal(lineage.primaryProgramId, 'SOURCE_AUTHORITY');
  assert.equal(lineage.mappingStatus, 'PROVISIONAL');
  assert.equal(lineage.completedTaskCount, 1);
  assert.equal(lineage.openTaskCount, 1);
  const unknown = h.changeGates.find((gate) => gate.change === 'totally-unknown-change');
  assert.equal(unknown.primaryProgramId, null);
  assert.equal(unknown.mappingStatus, 'REVIEW_REQUIRED');
  assert.equal(h.hierarchyReview.reviewChangeCount, 1);
  assert.equal(h.hierarchyReview.provenChangeCount, 0);
  assert.equal(h.programs.length, 25);
});

test('hierarchy: no synthetic edges, nothing selected, every package has exactly one change gate', () => {
  const tasks = [open('parent-atlas-retrieval-lineage-dag-convergence', 1), open('parent-atlas-gate2-chunk-lineage-convergence', 2)];
  const packages = buildProgramWorkPackages(tasks);
  const h = buildProgramHierarchy(tasks, packages);
  assert.ok(h.changeGates.every((gate) => gate.dependsOnGateIds.length === 0 && gate.schedulerPermission === 'NOT_SELECTED'));
  assert.ok(h.programs.every((program) => program.schedulerPermission === 'NOT_SELECTED' && !('dependsOn' in program)));
  const gateIds = new Set(h.changeGates.map((gate) => gate.id));
  assert.ok(packages.every((workPackage) => gateIds.has(workPackage.changeGateId)));
  assert.ok(tasks.every((t) => t.hierarchy.effectiveDependencies.length === 0));
});

test('hierarchy: only a reviewed mapping can yield PROVEN, and it must name a real program', () => {
  const tasks = [open('mystery-change', 1)];
  const h = buildProgramHierarchy(tasks, buildProgramWorkPackages(tasks), { 'mystery-change': 'GRAPH_RETRIEVAL' });
  assert.equal(h.changeGates[0].mappingStatus, 'PROVEN');
  assert.equal(h.changeGates[0].primaryProgramId, 'GRAPH_RETRIEVAL');
  assert.throws(() => buildProgramHierarchy(tasks, buildProgramWorkPackages(tasks), { 'mystery-change': 'NOPE' }), /UNKNOWN_PROGRAM/);
});

test('hierarchy: leaves inherit only explicit package dependencies, never wave membership', () => {
  const tasks = [open('parent-atlas-gate2-chunk-lineage-convergence', 1, { declared: { dependsOn: ['x:9'] } })];
  const packages = buildProgramWorkPackages(tasks);
  packages[0].dependsOnWaveIds = [1]; // architectural metadata is not a leaf dependency
  packages[0].dependsOn = ['GATE-EXPLICIT'];
  tasks[0].program.workPackageKey = packages[0].id;
  buildProgramHierarchy(tasks, packages);
  assert.deepEqual(tasks[0].hierarchy.declaredDependencies, ['x:9']);
  assert.deepEqual(tasks[0].hierarchy.inheritedDependencies, ['GATE-EXPLICIT']);
  assert.deepEqual(tasks[0].hierarchy.effectiveDependencies, ['x:9', 'GATE-EXPLICIT']);
});

test('selected-chain overlay is ordered, selects nothing, and never fabricates a missing gate', () => {
  const overlay = buildSelectedChainOverlay([{ id: 'GATE-CHANGE-parent-atlas-retrieval-lineage-dag-convergence' }]);
  assert.deepEqual(overlay.nodes.map((node) => node.id), ['SOURCE_LINEAGE', 'PACKET_REVISION_QUALIFICATION', 'CURRENT_WORKSPACE_LINEAGE', 'PACKET_KEY_OWNER', 'PACKET_ADMISSION', 'GATE_2']);
  assert.equal(overlay.edges.length, 5);
  assert.equal(overlay.autoSelects, false);
  assert.equal(overlay.schedulerPermission, 'NOT_SELECTED');
  assert.equal(overlay.nodes.at(-1).changeGateId, null);
});

test('completion tracking observes OPEN->DONE and DONE->OPEN transitions and appends to the carried ledger', () => {
  const before = { generatedAt: '2026-09-24T00:00:00Z', taskInventory: [open('c', 1), open('c', 2), done('c', 3)], completionTracking: { ledger: [{ event: 'COMPLETED_OBSERVED', selectionKey: 'c#0', taskKey: 'c:0', change: 'c', text: '', observedAt: 'old', previousSnapshotAt: null }] } };
  const after = [done('c', 1), open('c', 2), open('c', 3), done('c', 5)];
  const t = computeCompletionTracking({ previous: before, tasks: after, generatedAt: '2026-09-25T00:00:00Z' });
  assert.equal(t.newlyCompleted, 1);
  assert.equal(t.reopened, 1);
  assert.equal(t.addedAlreadyDoneSinceLastSnapshot, 1);
  assert.equal(t.ledger.length, 3);
  assert.equal(t.ledger[0].observedAt, 'old');
  assert.equal(t.ledger.filter((e) => e.observedAt === '2026-09-25T00:00:00Z').length, 2);
  assert.equal(t.completedTotal, 2);
});

test('completion tracking with no previous snapshot records nothing individually and never invents transitions', () => {
  const t = computeCompletionTracking({ previous: null, tasks: [done('c', 1), open('c', 2)], generatedAt: 'now' });
  assert.equal(t.hasPreviousSnapshot, false);
  assert.equal(t.ledger.length, 0);
  assert.equal(t.baselineCompletedNotIndividuallyObserved, 1);
});
