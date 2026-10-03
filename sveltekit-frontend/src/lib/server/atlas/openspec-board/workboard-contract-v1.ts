/**
 * OCP-01 — typed contract for the CANONICAL workboard artifact, docs/reports/openspec-workboard-v1.json
 * (built by scripts/atlas/build-openspec-workboard-v1.mjs from openspec/changes/*\/tasks.md).
 *
 * This is a DIFFERENT, narrower contract than openspec-board/types.ts's OpenSpecBoardSnapshotV1, which
 * describes a DERIVED composite of ~17 downstream analysis reports (execution-controller, actionable-work,
 * etc.), consumed by /atlas/studio/openspec today. Per OCP-00's census (docs/reports/openspec-control-plane-owner-census-v1.json):
 * the two are layered, not competing -- this file models the L0 canonical source those L1 reports derive from.
 *
 * Hard rules:
 *  - Validates and exposes the artifact's REAL, EXISTING fields only. Does not invent fields absent from it.
 *  - Never reparses tasks.md. Never reimplements priorityFor()/classifyExecutionState()/WFU parsing/dependency
 *    resolution -- those already ran inside the builder that produced this JSON; this module only reads its output.
 *  - Fails closed on a malformed/incompatible artifact (throws), never silently substitutes a stale or partial shape.
 */
import { z } from 'zod';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const OPENSPEC_WORKBOARD_CONTRACT_SCHEMA = 'atlas.openspec-workboard-contract.v1' as const;

const etaSchema = z.object({ status: z.string(), method: z.string() }).passthrough();
const gateStateSchema = z.enum([
  'READY', 'PROOF_ONLY', 'BLOCKED_BY_LINEAGE', 'BLOCKED_BY_RUNTIME', 'AUTHORIZATION_REQUIRED',
  'OWNER_DECISION_REQUIRED', 'WAITING_FOR_REAL_INPUTS', 'WAITING_FOR_DEPENDENCY', 'DEFERRED',
  'STALE_LEDGER', 'REVIEW_REQUIRED', 'SUPERSEDED', 'COMPLETE',
]);
const mutationClassSchema = z.enum(['READ_ONLY', 'CODE_ONLY', 'LOCAL_ARTIFACT', 'DB_WRITE', 'CACHE_WRITE', 'PROJECTION_WRITE', 'DDL', 'GRAPHIFY_RUN']);
const proofLevelSchema = z.enum(['SPEC_ONLY', 'UNIT_PROVEN', 'INTEGRATION_PROVEN', 'LIVE_READBACK_PROVEN', 'PROMOTED']);

const mappingStatusSchema = z.enum(['PROVEN', 'PROVISIONAL', 'REVIEW_REQUIRED']);

/** Taxonomy inherited by a leaf from its work package / change gate. Never a dependency edge by itself. */
const taskHierarchyV1Schema = z.object({
  primaryProgramId: z.string().min(1).nullable(),
  mappingStatus: mappingStatusSchema,
  secondaryProgramIds: z.array(z.string().min(1)),
  changeGateId: z.string().min(1),
  declaredDependencies: z.array(z.string()),
  inheritedDependencies: z.array(z.string()),
  effectiveDependencies: z.array(z.string()),
}).strict();

/** The real, flat per-task shape as emitted by build-openspec-workboard-v1.mjs (verified live against 9,393 rows). */
export const OpenSpecWorkboardTaskV1Schema = z
  .object({
    taskKey: z.string().min(1),
    change: z.string().min(1),
    source: z.string().min(1),
    line: z.number().int().nonnegative(),
    text: z.string(),
    state: z.string(),
    kind: z.string(),
    executionState: z.string(),
    lane: z.string().nullable().optional(),
    declaredSourceRef: z.string().nullable(),
    declaredSourceRevision: z.string().nullable(),
    priority: z.number(),
    lastUpdatedAt: z.string(),
    timestampMethod: z.string(),
    blockHash: z.string(),
    sectionSlug: z.string().nullable().optional(),
    eta: etaSchema,
    /** Globally unique across the whole artifact (verified live: 0 duplicates / 9,393 rows) -- the reliable identity. */
    stableKey: z.string().min(1),
    ledgerId: z.string().optional(),
    /** Present on ~29% of rows live (2,751/9,393); null elsewhere with taskIdentity.basis explaining why. Never
     * treated as the sole identity -- stableKey is. Uniqueness is enforced only over non-null values. */
    logicalTaskKey: z.string().nullable(),
    taskIdentity: z
      .object({
        logicalTaskKey: z.string().nullable(),
        taskRevision: z.string(),
        sourceLine: z.number().int().nonnegative(),
        migrationKey: z.string(),
        basis: z.string(),
      })
      .passthrough(),
    program: z.object({
      wave: z.number().int().min(0).max(10).nullable(),
      waveTitle: z.string().nullable(),
      classification: z.enum(['TASK_TEXT_RULE', 'CHANGE_FALLBACK_REVIEW', 'UNCLASSIFIED_REVIEW_REQUIRED']),
      matchedRule: z.string().nullable(),
      milestone: z.string().regex(/^M[0-6]$/).nullable(),
      gate: z.string().min(1),
      gateId: z.string().regex(/^GATE-WAVE-(0[0-9]|10)$/).nullable(),
      workPackageKey: z.string().nullable(),
    }).strict().optional(),
    gateState: gateStateSchema.optional(),
    schedulerPermission: z.enum(['SELECTED', 'NOT_SELECTED']).optional(),
    mutationClass: mutationClassSchema.optional(),
    mutationClassBasis: z.string().optional(),
    owner: z.string().optional(),
    ownerScope: z.literal('OPENSPEC_CHANGE_ONLY_NOT_CANONICAL_RUNTIME_OWNER').optional(),
    canonicalOwner: z.null().optional(),
    dependsOn: z.array(z.string()).nullable().optional(),
    unlocks: z.array(z.string()).nullable().optional(),
    runtimeDependencies: z.array(z.string()).nullable().optional(),
    artifactOutputs: z.array(z.string()).nullable().optional(),
    proofReceipt: z.unknown().nullable().optional(),
    criticalPathRank: z.number().int().min(0).max(10).nullable().optional(),
    fanoutCount: z.number().int().nonnegative().nullable().optional(),
    writeRisk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN_NOT_MEASURED']).nullable().optional(),
    proofLevel: proofLevelSchema.nullable().optional(),
    hierarchy: taskHierarchyV1Schema.optional(),
    primaryProgramId: z.string().min(1).nullable().optional(),
    secondaryProgramIds: z.array(z.string().min(1)).optional(),
    milestoneId: z.string().regex(/^M[0-6]$/).nullable().optional(),
    waveId: z.number().int().min(0).max(10).nullable().optional(),
    changeGateId: z.string().min(1).nullable().optional(),
    workPackageId: z.string().min(1).nullable().optional(),
    declaredDependencies: z.array(z.string()).optional(),
    inheritedDependencies: z.array(z.string()).optional(),
    effectiveDependencies: z.array(z.string()).optional(),
    selectionKey: z.string().min(1).optional(),
    controllerState: z.string().optional(),
    controllerBlockerKey: z.string().nullable().optional(),
  })
  .passthrough(); // artifact may carry additional fields this contract doesn't yet model; never reject on extras

export const OpenSpecWorkboardSummaryV1Schema = z
  .object({
    completedTasks: z.number().int().nonnegative(),
    openTasks: z.number().int().nonnegative(),
    actionableTasks: z.number().int().nonnegative(),
    waitingTasks: z.number().int().nonnegative(),
    supersededTasks: z.number().int().nonnegative(),
    totalTasks: z.number().int().nonnegative(),
    progressFraction: z.number(),
    progressBar: z.string(),
    eta: etaSchema,
  })
  .passthrough();

const programMilestoneV1Schema = z.object({
  id: z.string().regex(/^M[0-6]$/),
  name: z.string().min(1),
  outcome: z.string().optional(),
  exitCondition: z.string().optional(),
  waves: z.array(z.number().int().min(0).max(10)),
}).strict();

const programWaveV1Schema = z.object({
  id: z.string().regex(/^WAVE-(0[0-9]|10)$/),
  gateId: z.string().regex(/^GATE-WAVE-(0[0-9]|10)$/),
  title: z.string().min(1),
  milestone: z.string().regex(/^M[0-6]$/).nullable(),
  gates: z.array(z.string().min(1)),
  dependsOn: z.array(z.string().regex(/^WAVE-(0[0-9]|10)$/)),
  dependsOnWaveIds: z.array(z.number().int().min(0).max(10)),
  prerequisiteExitGates: z.array(z.string().min(1)),
  taskCount: z.number().int().nonnegative(),
  taskKeys: z.array(z.string().min(1)),
  actionableCount: z.number().int().nonnegative(),
  waitingCount: z.number().int().nonnegative(),
  schedulerPermission: z.literal('NOT_SELECTED'),
  state: z.enum(['PLANNED_NOT_SELECTED', 'NO_OPEN_TASKS']),
}).strict().superRefine((wave, ctx) => {
  if (wave.taskCount !== wave.taskKeys.length) ctx.addIssue({ code: 'custom', message: 'wave taskCount must match taskKeys' });
  if (wave.dependsOn.length !== wave.dependsOnWaveIds.length) ctx.addIssue({ code: 'custom', message: 'wave dependency ids must align' });
  if (wave.prerequisiteExitGates.length !== wave.dependsOnWaveIds.length) ctx.addIssue({ code: 'custom', message: 'wave prerequisite gates must align' });
  if (wave.actionableCount + wave.waitingCount !== wave.taskCount) ctx.addIssue({ code: 'custom', message: 'wave actionable/waiting counts must reconcile' });
});

const programWorkPackageV1Schema = z.object({
  id: z.string().min(1),
  wave: z.number().int().min(0).max(10).nullable(),
  milestone: z.string().regex(/^M[0-6]$/).nullable(),
  gateId: z.string().regex(/^GATE-WAVE-(0[0-9]|10)$/).nullable(),
  gate: z.string().min(1),
  owner: z.string().min(1),
  ownerScope: z.literal('OPENSPEC_CHANGE_ONLY_NOT_CANONICAL_RUNTIME_OWNER'),
  canonicalOwner: z.null(),
  taskKeys: z.array(z.string().min(1)).min(1),
  taskCount: z.number().int().positive(),
  declaredTaskDependencyCount: z.number().int().nonnegative(),
  dependsOnWaveIds: z.array(z.number().int().min(0).max(10)),
  dependsOn: z.array(z.string()).optional(),
  programId: z.string().min(1).nullable().optional(),
  changeGateId: z.string().min(1).optional(),
  mappingStatus: mappingStatusSchema.optional(),
  prerequisiteGateIds: z.array(z.string()).optional(),
  primaryLane: z.string().nullable().optional(),
  secondaryLanes: z.array(z.string()).optional(),
  corpus: z.string().nullable().optional(),
  schedulerPermission: z.literal('NOT_SELECTED'),
  state: z.enum(['PLANNED_NOT_SELECTED', 'REVIEW_REQUIRED']),
}).strict().superRefine((workPackage, ctx) => {
  if (workPackage.taskCount !== workPackage.taskKeys.length) ctx.addIssue({ code: 'custom', message: 'work-package taskCount must match taskKeys' });
  if (workPackage.wave === null && workPackage.milestone !== null) ctx.addIssue({ code: 'custom', message: 'unclassified work package cannot claim a milestone' });
  if (workPackage.wave === null && workPackage.state !== 'REVIEW_REQUIRED') ctx.addIssue({ code: 'custom', message: 'unclassified work package must remain review-only' });
});

const programGateV1Schema = z.object({
  id: z.string().regex(/^GATE-WAVE-(0[0-9]|10)$/),
  waveId: z.number().int().min(0).max(10),
  milestone: z.string().regex(/^M[0-6]$/).nullable(),
  exitGate: z.string().min(1),
  dependsOnGateIds: z.array(z.string().regex(/^GATE-WAVE-(0[0-9]|10)$/)),
  workPackageIds: z.array(z.string().min(1)),
  taskCount: z.number().int().nonnegative(),
  proofReceipt: z.null(),
  proofLevel: z.null(),
  canonicalOwner: z.null(),
  schedulerPermission: z.literal('NOT_SELECTED'),
  state: z.literal('UNPROVEN_NOT_SELECTED'),
}).strict();

const programReviewQueueV1Schema = z.object({
  id: z.literal('UNCLASSIFIED_REVIEW'),
  title: z.string().min(1),
  milestone: z.null(),
  gates: z.array(z.string().min(1)),
  dependsOn: z.array(z.string()),
  taskCount: z.number().int().nonnegative(),
  taskKeys: z.array(z.string().min(1)),
  actionableCount: z.literal(0),
  waitingCount: z.number().int().nonnegative(),
  schedulerPermission: z.literal('NOT_SELECTED'),
  state: z.literal('REVIEW_REQUIRED'),
}).strict().superRefine((queue, ctx) => {
  if (queue.taskCount !== queue.taskKeys.length || queue.waitingCount !== queue.taskCount) {
    ctx.addIssue({ code: 'custom', message: 'review queue counts must match taskKeys' });
  }
});

const domainProgramV1Schema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  milestoneId: z.string().regex(/^M[0-6]$/),
  primaryLane: z.string().min(1),
  corpus: z.string().min(1),
  changeGateIds: z.array(z.string().min(1)),
  changeCount: z.number().int().nonnegative(),
  activeChangeCount: z.number().int().nonnegative(),
  openTaskCount: z.number().int().nonnegative(),
  completedTaskCount: z.number().int().nonnegative(),
  totalTaskCount: z.number().int().nonnegative(),
  ownerScope: z.literal('PROVISIONAL_PROGRAM_GROUP_NOT_CANONICAL_RUNTIME_OWNER'),
  canonicalOwner: z.null(),
  schedulerPermission: z.literal('NOT_SELECTED'),
}).strict(); // strict + no dependsOn key: programs are taxonomy, never prerequisite nodes.

const changeGateV1Schema = z.object({
  id: z.string().regex(/^GATE-CHANGE-.+/),
  kind: z.literal('OPENSPEC_CHANGE'),
  change: z.string().min(1),
  primaryProgramId: z.string().min(1).nullable(),
  secondaryProgramIds: z.array(z.string().min(1)),
  mappingStatus: mappingStatusSchema,
  active: z.boolean(),
  openTaskCount: z.number().int().nonnegative(),
  completedTaskCount: z.number().int().nonnegative(),
  totalTaskCount: z.number().int().nonnegative(),
  workPackageIds: z.array(z.string().min(1)),
  taskKeys: z.array(z.string().min(1)),
  dependsOnGateIds: z.tuple([]), // Change gates carry no prerequisites unless evidence is added deliberately.
  owner: z.string().min(1),
  ownerScope: z.literal('OPENSPEC_CHANGE_ONLY_NOT_CANONICAL_RUNTIME_OWNER'),
  canonicalOwner: z.null(),
  proofReceipt: z.null(),
  proofLevel: z.null(),
  schedulerPermission: z.literal('NOT_SELECTED'),
  state: z.enum(['COMPLETE', 'OPEN_UNPROVEN_NOT_SELECTED']),
}).strict();

const selectedChainOverlayV1Schema = z.object({
  schema: z.literal('atlas.openspec-selected-chain-overlay.v1'),
  edgeAuthority: z.string().min(1),
  schedulerPermission: z.literal('NOT_SELECTED'),
  autoSelects: z.literal(false),
  nodes: z.array(z.object({
    id: z.string().min(1), order: z.number().int().positive(), change: z.string().min(1),
    changeGateId: z.string().nullable(), status: z.string().min(1),
  }).strict()),
  edges: z.array(z.object({ from: z.string().min(1), to: z.string().min(1) }).strict()),
}).strict();

const OpenSpecImplementationProgramV1SchemaBase = z.object({
  schema: z.literal('atlas.openspec-implementation-program.v1'),
  authority: z.literal('ADVISORY_PLAN_ONLY'),
  milestones: z.array(programMilestoneV1Schema),
  waves: z.array(programWaveV1Schema),
  gates: z.array(programGateV1Schema),
  workPackages: z.array(programWorkPackageV1Schema),
  reviewQueue: programReviewQueueV1Schema,
  programs: z.array(domainProgramV1Schema).optional(),
  changeGates: z.array(changeGateV1Schema).optional(),
  hierarchyReview: z.object({
    reviewChangeGateIds: z.array(z.string()),
    reviewChangeCount: z.number().int().nonnegative(),
    reviewOpenTaskCount: z.number().int().nonnegative(),
    provisionalChangeCount: z.number().int().nonnegative(),
    provenChangeCount: z.number().int().nonnegative(),
  }).strict().optional(),
  hierarchyPolicy: z.string().min(1).optional(),
  selectedChainOverlay: selectedChainOverlayV1Schema.optional(),
  leafTaskCount: z.number().int().nonnegative(),
  assignedLeafTaskCount: z.number().int().nonnegative(),
  reviewLeafTaskCount: z.number().int().nonnegative(),
  schedulerPermissionDefault: z.literal('NOT_SELECTED'),
  dependencies: z.string().min(1),
}).strict();
export const OpenSpecImplementationProgramV1Schema = OpenSpecImplementationProgramV1SchemaBase.superRefine((program, ctx) => {
  const packageTaskKeys = program.workPackages.flatMap((workPackage) => workPackage.taskKeys);
  if (program.assignedLeafTaskCount !== packageTaskKeys.length
    || program.leafTaskCount !== program.assignedLeafTaskCount + program.reviewLeafTaskCount
    || program.reviewLeafTaskCount !== program.reviewQueue.taskCount) {
    ctx.addIssue({ code: 'custom', message: 'classified, review, and total leaf task counts must reconcile' });
  }
  if (new Set(packageTaskKeys).size !== packageTaskKeys.length) {
    ctx.addIssue({ code: 'custom', message: 'a leaf task may appear in only one work package' });
  }
  if (new Set(program.waves.map((wave) => wave.id)).size !== program.waves.length
    || program.waves.length !== 11
    || new Set(program.gates.map((gate) => gate.id)).size !== program.gates.length
    || program.gates.length !== 11
    || new Set(program.milestones.map((milestone) => milestone.id)).size !== program.milestones.length
    || program.milestones.length !== 7) {
    ctx.addIssue({ code: 'custom', message: 'program must contain unique definitions for all 11 waves and milestones M0-M6' });
  }
  for (const wave of program.waves) {
    if (wave.milestone !== null && !program.milestones.some((milestone) => milestone.id === wave.milestone && milestone.waves.includes(Number(wave.id.slice(-2))))) {
      ctx.addIssue({ code: 'custom', path: ['milestones'], message: `${wave.id} milestone membership must be declared` });
    }
    const expectedIds = wave.dependsOnWaveIds.map((id) => `WAVE-${String(id).padStart(2, '0')}`);
    if (JSON.stringify(wave.dependsOn) !== JSON.stringify(expectedIds)) {
      ctx.addIssue({ code: 'custom', path: ['waves'], message: `${wave.id} dependency names must match dependency ids` });
    }
    const expectedGates = wave.dependsOnWaveIds.map((id) => program.waves.find((candidate) => candidate.id === `WAVE-${String(id).padStart(2, '0')}`)?.gates[0]);
    if (expectedGates.some((gate) => gate === undefined)
      || JSON.stringify(wave.prerequisiteExitGates) !== JSON.stringify(expectedGates)) {
      ctx.addIssue({ code: 'custom', path: ['waves'], message: `${wave.id} prerequisite gates must match declared predecessor waves` });
    }
    const wavePackages = program.workPackages.filter((workPackage) => workPackage.wave === Number(wave.id.slice(-2)));
    const packageKeys = wavePackages.flatMap((workPackage) => workPackage.taskKeys).sort();
    if (JSON.stringify(packageKeys) !== JSON.stringify([...wave.taskKeys].sort())) {
      ctx.addIssue({ code: 'custom', path: ['waves'], message: `${wave.id} task membership must reconcile with its work packages` });
    }
    if (wavePackages.some((workPackage) => JSON.stringify(workPackage.dependsOnWaveIds) !== JSON.stringify(wave.dependsOnWaveIds))) {
      ctx.addIssue({ code: 'custom', path: ['workPackages'], message: `${wave.id} work packages must inherit only declared wave prerequisites` });
    }
    const gate = program.gates.find((candidate) => candidate.id === wave.gateId);
    if (!gate || gate.waveId !== Number(wave.id.slice(-2)) || gate.exitGate !== wave.gates[0]
      || gate.taskCount !== wave.taskCount
      || JSON.stringify(gate.dependsOnGateIds) !== JSON.stringify(wave.dependsOnWaveIds.map((id) => `GATE-WAVE-${String(id).padStart(2, '0')}`))
      || JSON.stringify(gate.workPackageIds) !== JSON.stringify(wavePackages.map((workPackage) => workPackage.id))) {
      ctx.addIssue({ code: 'custom', path: ['gates'], message: `${wave.id} gate node must reconcile wave dependencies and work packages` });
    }
    if (wavePackages.some((workPackage) => workPackage.gateId !== wave.gateId)) {
      ctx.addIssue({ code: 'custom', path: ['workPackages'], message: `${wave.id} work packages must point at its gate` });
    }
  }
  validateProgramHierarchy(program, ctx);
});

/** Taxonomy invariants: one primary program per change gate, every package under exactly one change gate,
 * every open leaf under exactly one change gate, and no prerequisite edge invented by the taxonomy. */
function validateProgramHierarchy(
  program: z.infer<typeof OpenSpecImplementationProgramV1SchemaBase>,
  ctx: z.RefinementCtx,
): void {
  const { programs, changeGates } = program;
  if (!programs && !changeGates) return; // Older snapshots without the hierarchy remain readable.
  if (!programs || !changeGates || !program.hierarchyReview) {
    ctx.addIssue({ code: 'custom', path: ['programs'], message: 'programs, changeGates, and hierarchyReview must be emitted together' });
    return;
  }
  const issue = (message: string) => ctx.addIssue({ code: 'custom', path: ['changeGates'], message });
  const programIds = new Set(programs.map((item) => item.id));
  if (programIds.size !== programs.length || programs.length < 20 || programs.length > 30) issue('taxonomy must contain 20-30 unique programs');
  const gateById = new Map(changeGates.map((gate) => [gate.id, gate]));
  if (gateById.size !== changeGates.length) issue('change gate ids must be unique');
  if (new Set(changeGates.map((gate) => gate.change)).size !== changeGates.length) issue('each change may have only one change gate');
  for (const gate of changeGates) {
    if (gate.primaryProgramId !== null && !programIds.has(gate.primaryProgramId)) issue(`${gate.id} names an unknown primary program`);
    if ((gate.mappingStatus === 'REVIEW_REQUIRED') !== (gate.primaryProgramId === null)) issue(`${gate.id} review status must match a null primary program`);
    if (gate.primaryProgramId !== null && gate.secondaryProgramIds.includes(gate.primaryProgramId)) issue(`${gate.id} secondary programs must exclude the primary`);
    if (gate.secondaryProgramIds.some((id) => !programIds.has(id))) issue(`${gate.id} names an unknown secondary program`);
    if (gate.taskKeys.length !== gate.openTaskCount || gate.openTaskCount + gate.completedTaskCount !== gate.totalTaskCount) issue(`${gate.id} task counts must reconcile`);
    if (gate.active !== (gate.openTaskCount > 0) || (gate.state === 'COMPLETE') !== (gate.openTaskCount === 0)) issue(`${gate.id} active/complete state must match its open task count`);
  }
  for (const item of programs) {
    const owned = changeGates.filter((gate) => gate.primaryProgramId === item.id).map((gate) => gate.id).sort();
    if (JSON.stringify(owned) !== JSON.stringify([...item.changeGateIds].sort())) issue(`${item.id} change gates must equal the gates naming it primary`);
    const sum = (field: 'openTaskCount' | 'completedTaskCount' | 'totalTaskCount') => changeGates.filter((gate) => gate.primaryProgramId === item.id).reduce((total, gate) => total + gate[field], 0);
    if (item.openTaskCount !== sum('openTaskCount') || item.completedTaskCount !== sum('completedTaskCount') || item.totalTaskCount !== sum('totalTaskCount')) issue(`${item.id} task counts must reconcile with its change gates`);
  }
  const review = changeGates.filter((gate) => gate.primaryProgramId === null);
  const review2 = program.hierarchyReview;
  if (review2.reviewChangeCount !== review.length || review2.reviewOpenTaskCount !== review.reduce((sum, gate) => sum + gate.openTaskCount, 0)
    || review2.provisionalChangeCount !== changeGates.filter((gate) => gate.mappingStatus === 'PROVISIONAL').length
    || review2.provenChangeCount !== changeGates.filter((gate) => gate.mappingStatus === 'PROVEN').length) issue('hierarchy review counts must reconcile');
  for (const workPackage of program.workPackages) {
    const gate = workPackage.changeGateId ? gateById.get(workPackage.changeGateId) : undefined;
    if (!gate || gate.change !== workPackage.owner || !gate.workPackageIds.includes(workPackage.id)
      || (workPackage.programId ?? null) !== gate.primaryProgramId || workPackage.mappingStatus !== gate.mappingStatus) {
      ctx.addIssue({ code: 'custom', path: ['workPackages'], message: `${workPackage.id} must belong to exactly one consistent change gate` });
    }
  }
  const gatedKeys = changeGates.flatMap((gate) => gate.taskKeys);
  if (new Set(gatedKeys).size !== gatedKeys.length || gatedKeys.length !== program.leafTaskCount) issue('every open leaf must sit under exactly one change gate');
  for (const node of program.selectedChainOverlay?.nodes ?? []) {
    if (node.changeGateId !== null && !gateById.has(node.changeGateId)) issue(`selected-chain node ${node.id} references a missing change gate`);
  }
}

const completionLedgerEntrySchema = z.object({
  event: z.enum(['COMPLETED_OBSERVED', 'REOPENED_OBSERVED']),
  selectionKey: z.string().min(1),
  taskKey: z.string().min(1),
  change: z.string().min(1),
  text: z.string(),
  observedAt: z.string().min(1),
  previousSnapshotAt: z.string().nullable(),
}).strict();

export const OpenSpecCompletionTrackingV1Schema = z.object({
  schema: z.literal('atlas.openspec-completion-tracking.v1'),
  method: z.literal('SNAPSHOT_DIFF_OBSERVED_NOT_A_COMPLETION_TIMESTAMP'),
  previousGeneratedAt: z.string().nullable(),
  hasPreviousSnapshot: z.boolean(),
  completedTotal: z.number().int().nonnegative(),
  newlyCompleted: z.number().int().nonnegative(),
  reopened: z.number().int().nonnegative(),
  baselineCompletedNotIndividuallyObserved: z.number().int().nonnegative(),
  vanishedSinceLastSnapshot: z.number().int().nonnegative(),
  addedAlreadyDoneSinceLastSnapshot: z.number().int().nonnegative(),
  byProgram: z.record(z.string(), z.object({ completed: z.number().int().nonnegative(), open: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).strict()),
  ledger: z.array(completionLedgerEntrySchema),
}).strict();

/** The artifact's real top-level shape. Only the fields this contract actively validates/exposes are typed strictly;
 * everything else survives via passthrough so a future builder addition doesn't fail-closed unnecessarily. */
export const OpenSpecWorkboardV1Schema = z
  .object({
    schema: z.literal('atlas.openspec.workboard.v1'),
    hierarchyContractVersion: z.literal('v2').optional(),
    generatedAt: z.string(),
    source: z.string(),
    summary: OpenSpecWorkboardSummaryV1Schema,
    taskInventory: z.array(OpenSpecWorkboardTaskV1Schema),
    implementationProgram: OpenSpecImplementationProgramV1Schema.optional(),
    completionTracking: OpenSpecCompletionTrackingV1Schema.optional(),
  }).superRefine((workboard, ctx) => {
    const tracking = workboard.completionTracking;
    if (tracking && tracking.completedTotal !== workboard.summary.completedTasks) {
      ctx.addIssue({ code: 'custom', path: ['completionTracking'], message: 'completion tracking total must equal the summary completed count' });
    }
    const program = workboard.implementationProgram;
    if (!program) return; // Older v1 snapshots remain readable during report regeneration.
    if (program.changeGates) {
      const gateById = new Map(program.changeGates.map((gate) => [gate.id, gate]));
      const waveGateIds = new Set(program.gates.map((gate) => gate.id));
      const selectionSource = (workboard as { schedulerPolicy?: { selectionSource?: string | null } }).schedulerPolicy?.selectionSource ?? null;
      for (const [index, task] of workboard.taskInventory.entries()) {
        const at = (message: string) => ctx.addIssue({ code: 'custom', path: ['taskInventory', index, 'hierarchy'], message });
        const h = task.hierarchy;
        if (!h) { at('every task must carry inherited hierarchy metadata'); continue; }
        const gate = gateById.get(h.changeGateId);
        if (!gate || gate.change !== task.change) at('task must sit under its own change gate');
        else if (gate.primaryProgramId !== h.primaryProgramId || gate.mappingStatus !== h.mappingStatus) at('task must inherit its change gate program and mapping status');
        if ((h.mappingStatus === 'REVIEW_REQUIRED') !== (h.primaryProgramId === null)) at('review tasks must not be silently classified into a program');
        if (h.inheritedDependencies.some((id) => !waveGateIds.has(id))) at('inherited dependency references a missing gate');
        const union = [...new Set([...h.declaredDependencies, ...h.inheritedDependencies])];
        if (JSON.stringify(union) !== JSON.stringify(h.effectiveDependencies)) at('effective dependencies must equal declared plus inherited');
        if (task.schedulerPermission === 'SELECTED' && !selectionSource) at('a task cannot be SELECTED without an explicit selection file');
      }
    }
    for (const [index, task] of workboard.taskInventory.entries()) {
      if (task.program === undefined || task.gateState === undefined || task.schedulerPermission === undefined
        || task.mutationClass === undefined || task.owner === undefined || task.canonicalOwner !== null
        || task.proofLevel !== null || task.writeRisk !== null) {
        ctx.addIssue({ code: 'custom', path: ['taskInventory', index], message: 'program task must expose explicit readiness, selection, owner, risk, and proof fields' });
      }
    }
    if (workboard.hierarchyContractVersion === 'v2') {
      for (const [index, task] of workboard.taskInventory.entries()) {
        const at = (message: string) => ctx.addIssue({ code: 'custom', path: ['taskInventory', index], message });
        const fields = [task.primaryProgramId, task.secondaryProgramIds, task.milestoneId, task.waveId,
          task.changeGateId, task.workPackageId, task.declaredDependencies, task.inheritedDependencies, task.effectiveDependencies];
        if (fields.some((field) => field === undefined)) { at('v2 hierarchy contract fields must be present'); continue; }
        const hierarchy = task.hierarchy;
        if (!hierarchy || task.primaryProgramId !== hierarchy.primaryProgramId
          || JSON.stringify(task.secondaryProgramIds) !== JSON.stringify(hierarchy.secondaryProgramIds)
          || task.changeGateId !== hierarchy.changeGateId
          || JSON.stringify(task.declaredDependencies) !== JSON.stringify(hierarchy.declaredDependencies)
          || JSON.stringify(task.inheritedDependencies) !== JSON.stringify(hierarchy.inheritedDependencies)
          || JSON.stringify(task.effectiveDependencies) !== JSON.stringify(hierarchy.effectiveDependencies)
          || JSON.stringify(task.dependsOn) !== JSON.stringify(task.effectiveDependencies)) {
          at('v2 flat hierarchy fields must match the nested compatibility metadata');
        }
        if (task.waveId !== task.program?.wave || task.milestoneId !== task.program?.milestone
          || task.workPackageId !== (task.program?.workPackageKey ?? null)) at('v2 scheduling ids must match the program classification');
        if (task.state === 'OPEN' && task.workPackageId !== null && !workboard.implementationProgram?.workPackages.some((item) => item.id === task.workPackageId && item.taskKeys.includes(task.taskKey))) {
          at('open leaf workPackageId must point to its exact package assignment');
        }
      }
    }
    const expected = workboard.taskInventory.filter((task) => task.state === 'OPEN').map((task) => task.taskKey).sort();
    const actual = [
      ...program.workPackages.flatMap((workPackage) => workPackage.taskKeys),
      ...program.reviewQueue.taskKeys,
    ].sort();
    if (expected.length !== actual.length || expected.some((taskKey, index) => taskKey !== actual[index])) {
      ctx.addIssue({ code: 'custom', path: ['implementationProgram'], message: 'program must contain every open task exactly once' });
    }
  })
  .passthrough();

export type OpenSpecWorkboardTaskV1 = z.infer<typeof OpenSpecWorkboardTaskV1Schema>;
export type OpenSpecWorkboardSummaryV1 = z.infer<typeof OpenSpecWorkboardSummaryV1Schema>;
export type OpenSpecWorkboardV1 = z.infer<typeof OpenSpecWorkboardV1Schema>;

export interface OpenSpecWorkboardRevisionV1 {
  /** sha256 of the exact raw artifact bytes -- the artifact declares no checksum of its own, so this is the
   * canonical revision identity for "which exact workboard snapshot was this packet/receipt built from". */
  workboardChecksum: `sha256:${string}`;
  generatedAt: string;
  sourceFilePath: string;
}

export class OpenSpecWorkboardContractError extends Error {
  readonly issues: readonly string[];
  constructor(message: string, issues: readonly string[] = []) {
    super(issues.length ? `${message}: ${issues.join('; ')}` : message);
    this.issues = issues;
  }
}

/** Structural projection over the validated task list -- no reclassification, only exposing what's already there. */
export interface OpenSpecTaskProjectionV1 {
  stableKey: string;
  logicalTaskKey: string | null;
  taskKey: string;
  change: string;
  step: string | null;
  text: string;
  state: string;
  executionState: string;
  priority: number;
  actionable: boolean;
  waiting: boolean;
  superseded: boolean;
  lane: string | null;
  sourceLine: number;
}

const STEP_RE = /^STEP-(\d{2})\b/;

function stepFromLane(lane: string | null | undefined): string | null {
  // The artifact's own 'lane' field (e.g. 'RETRIEVAL_ACE') is not a STEP-NN label; no STEP field exists on a task
  // row today. Exposed as null rather than invented -- do not fabricate a STEP mapping the artifact doesn't declare.
  return lane && STEP_RE.test(lane) ? lane : null;
}

export function projectTask(task: OpenSpecWorkboardTaskV1): OpenSpecTaskProjectionV1 {
  return {
    stableKey: task.stableKey,
    logicalTaskKey: task.logicalTaskKey,
    taskKey: task.taskKey,
    change: task.change,
    step: stepFromLane(task.lane),
    text: task.text,
    state: task.state,
    executionState: task.executionState,
    priority: task.priority,
    actionable: task.executionState === 'ACTIONABLE',
    waiting: task.executionState === 'WAITING_ON_DEPENDENCY',
    superseded: task.executionState === 'SUPERSEDED_OR_HISTORICAL',
    lane: task.lane ?? null,
    sourceLine: task.line,
  };
}

export interface LoadedOpenSpecWorkboardV1 {
  workboard: OpenSpecWorkboardV1;
  revision: OpenSpecWorkboardRevisionV1;
}

/**
 * Reads and validates the canonical workboard artifact. Fails closed (throws OpenSpecWorkboardContractError) on
 * anything not matching the real shape -- never falls back to reparsing tasks.md, never substitutes a partial shape.
 */
export async function loadOpenSpecWorkboardV1(filePath: string): Promise<LoadedOpenSpecWorkboardV1> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new OpenSpecWorkboardContractError('OPENSPEC_WORKBOARD_ARTIFACT_UNREADABLE', [String(error instanceof Error ? error.message : error)]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new OpenSpecWorkboardContractError('OPENSPEC_WORKBOARD_ARTIFACT_INVALID_JSON', [String(error instanceof Error ? error.message : error)]);
  }

  const result = OpenSpecWorkboardV1Schema.safeParse(parsed);
  if (!result.success) {
    throw new OpenSpecWorkboardContractError(
      'OPENSPEC_WORKBOARD_ARTIFACT_SHAPE_MISMATCH',
      result.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  const workboardChecksum = `sha256:${createHash('sha256').update(raw).digest('hex')}` as const;
  return {
    workboard: result.data,
    revision: { workboardChecksum, generatedAt: result.data.generatedAt, sourceFilePath: path.resolve(filePath) },
  };
}
