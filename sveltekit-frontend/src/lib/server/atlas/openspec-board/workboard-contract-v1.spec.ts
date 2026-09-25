import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  loadOpenSpecWorkboardV1,
  projectTask,
  OpenSpecWorkboardContractError,
  OpenSpecImplementationProgramV1Schema,
  OpenSpecWorkboardV1Schema,
} from './workboard-contract-v1';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../../../../..');
const LIVE_ARTIFACT = process.env.OPENSPEC_WORKBOARD_FIXTURE
  ? path.resolve(process.env.OPENSPEC_WORKBOARD_FIXTURE)
  : path.join(REPO_ROOT, 'docs/reports/openspec-workboard-v1.json');

describe('OpenSpecWorkboardContractV1 against the live canonical artifact', () => {
  it('loads and validates deterministically, exposing a stable checksum', async () => {
    const first = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const second = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    expect(first.revision.workboardChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.revision.workboardChecksum).toBe(second.revision.workboardChecksum);
  });

  it('exact total/complete/open/actionable/waiting/superseded parity against the artifact\'s own summary', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const tasks = workboard.taskInventory;
    expect(tasks.length).toBe(workboard.summary.totalTasks);
    expect(tasks.filter((t) => t.executionState === 'DONE').length).toBe(workboard.summary.completedTasks);
    expect(tasks.filter((t) => t.state === 'OPEN').length).toBe(workboard.summary.openTasks);
    expect(tasks.filter((t) => t.executionState === 'ACTIONABLE').length).toBe(workboard.summary.actionableTasks);
    expect(tasks.filter((t) => t.executionState === 'WAITING_ON_DEPENDENCY').length).toBe(workboard.summary.waitingTasks);
    expect(tasks.filter((t) => t.executionState === 'SUPERSEDED_OR_HISTORICAL').length).toBe(workboard.summary.supersededTasks);
  });

  it('no duplicate stableKey across the whole artifact (the reliable canonical identity)', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const keys = workboard.taskInventory.map((t) => t.stableKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('no duplicate logicalTaskKey among the rows where it is non-null (it is legitimately null on most rows)', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const nonNull = workboard.taskInventory.map((t) => t.logicalTaskKey).filter((k): k is string => k !== null);
    expect(new Set(nonNull).size).toBe(nonNull.length);
    // Documents the real, verified-live shape rather than assuming logicalTaskKey is always present.
    expect(nonNull.length).toBeLessThan(workboard.taskInventory.length);
  });

  it('taskInventory is a flat array of task objects, not nested groups', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    expect(Array.isArray(workboard.taskInventory)).toBe(true);
    for (const t of workboard.taskInventory.slice(0, 50)) {
      expect(typeof t.taskKey).toBe('string');
      expect(typeof t.text).toBe('string');
    }
  });

  it('validates the implementation program and accounts for each open leaf exactly once', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    expect(workboard.implementationProgram).toBeDefined();
    const program = OpenSpecImplementationProgramV1Schema.parse(workboard.implementationProgram);
    const packageKeys = program.workPackages.flatMap((workPackage) => workPackage.taskKeys);
    const allProgramKeys = [...packageKeys, ...program.reviewQueue.taskKeys];
    const openKeys = workboard.taskInventory.filter((task) => task.state === 'OPEN').map((task) => task.taskKey);
    expect(new Set(allProgramKeys).size).toBe(allProgramKeys.length);
    expect(allProgramKeys.sort()).toEqual(openKeys.sort());
    expect(program.workPackages.every((workPackage) => workPackage.schedulerPermission === 'NOT_SELECTED')).toBe(true);
    expect(program.reviewQueue.milestone).toBeNull();
    expect(workboard.taskInventory.every((task) => task.gateState !== undefined
      && task.schedulerPermission === 'NOT_SELECTED'
      && task.ownerScope === 'OPENSPEC_CHANGE_ONLY_NOT_CANONICAL_RUNTIME_OWNER'
      && task.canonicalOwner === null
      && task.criticalPathRank === null
      && task.fanoutCount === null
      && task.proofLevel === null
      && task.writeRisk === null)).toBe(true);
  });

  it('accepts the additive v2 flat hierarchy and verifies IDs and dependency provenance against nested metadata', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const v2 = structuredClone(workboard) as any;
    v2.hierarchyContractVersion = 'v2';
    for (const task of v2.taskInventory) {
      const h = task.hierarchy;
      task.primaryProgramId = h.primaryProgramId;
      task.secondaryProgramIds = h.secondaryProgramIds;
      task.milestoneId = task.program?.milestone ?? null;
      task.waveId = task.program?.wave ?? null;
      task.changeGateId = h.changeGateId;
      task.workPackageId = task.state === 'OPEN' ? task.program?.workPackageKey ?? null : null;
      task.declaredDependencies = h.declaredDependencies;
      task.inheritedDependencies = h.inheritedDependencies;
      task.effectiveDependencies = h.effectiveDependencies;
      task.dependsOn = h.effectiveDependencies;
    }
    expect(OpenSpecWorkboardV1Schema.safeParse(v2).success).toBe(true);

    const mismatched = structuredClone(v2);
    mismatched.taskInventory[0].effectiveDependencies.push('invented-wave-prerequisite');
    expect(OpenSpecWorkboardV1Schema.safeParse(mismatched).success).toBe(false);
  });

  it('keeps v1 historical task receipts readable without the additive hierarchy fields', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const historical = structuredClone(workboard) as any;
    delete historical.hierarchyContractVersion;
    for (const task of historical.taskInventory) {
      delete task.primaryProgramId;
      delete task.secondaryProgramIds;
      delete task.milestoneId;
      delete task.waveId;
      delete task.changeGateId;
      delete task.workPackageId;
      delete task.declaredDependencies;
      delete task.inheritedDependencies;
      delete task.effectiveDependencies;
    }
    expect(OpenSpecWorkboardV1Schema.safeParse(historical).success).toBe(true);
  });

  it('rejects duplicate or missing leaf assignment in the implementation program', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const program = workboard.implementationProgram;
    expect(program).toBeDefined();
    const duplicated = structuredClone(program!);
    duplicated.workPackages[0].taskKeys.push(duplicated.workPackages[0].taskKeys[0]);
    duplicated.workPackages[0].taskCount += 1;
    duplicated.leafTaskCount += 1;
    duplicated.assignedLeafTaskCount += 1;
    expect(OpenSpecImplementationProgramV1Schema.safeParse(duplicated).success).toBe(false);
  });

  it('projectTask never invents a STEP label absent from the artifact', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const projected = workboard.taskInventory.slice(0, 100).map(projectTask);
    for (const p of projected) {
      if (p.step !== null) expect(p.step).toMatch(/^STEP-\d{2}/);
    }
  });

  it('fails closed on a missing file', async () => {
    await expect(loadOpenSpecWorkboardV1(path.join(REPO_ROOT, 'docs/reports/does-not-exist-v1.json')))
      .rejects.toBeInstanceOf(OpenSpecWorkboardContractError);
  });

  it('fails closed on malformed JSON', async () => {
    const tmp = path.join(REPO_ROOT, 'sveltekit-frontend/.tmp-workboard-contract-spec-malformed.json');
    await fs.mkdir(path.dirname(tmp), { recursive: true });
    await fs.writeFile(tmp, '{ not valid json', 'utf8');
    try {
      await expect(loadOpenSpecWorkboardV1(tmp)).rejects.toBeInstanceOf(OpenSpecWorkboardContractError);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });

  it('fails closed on a shape mismatch (wrong schema literal)', async () => {
    const tmp = path.join(REPO_ROOT, 'sveltekit-frontend/.tmp-workboard-contract-spec-wrongshape.json');
    await fs.mkdir(path.dirname(tmp), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify({ schema: 'not.the.right.schema', generatedAt: 'x', source: 'x', summary: {}, taskInventory: [] }), 'utf8');
    try {
      const result = OpenSpecWorkboardV1Schema.safeParse(JSON.parse(await fs.readFile(tmp, 'utf8')));
      expect(result.success).toBe(false);
      await expect(loadOpenSpecWorkboardV1(tmp)).rejects.toBeInstanceOf(OpenSpecWorkboardContractError);
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });
});

describe('Program taxonomy hierarchy (Program -> change gate -> work package -> leaf)', () => {
  it('every package sits under exactly one change gate and every gate under at most one primary program', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const program = OpenSpecImplementationProgramV1Schema.parse(workboard.implementationProgram);
    expect(program.programs).toBeDefined();
    const gates = program.changeGates!;
    const gateIds = new Set(gates.map((gate) => gate.id));
    expect(gateIds.size).toBe(gates.length);
    expect(program.workPackages.every((workPackage) => workPackage.changeGateId !== undefined && gateIds.has(workPackage.changeGateId))).toBe(true);
    const owning = new Map<string, string>();
    for (const item of program.programs!) for (const id of item.changeGateIds) {
      expect(owning.has(id)).toBe(false);
      owning.set(id, item.id);
    }
  });

  it('review changes are never silently classified and gates carry no invented prerequisites or selection', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const program = workboard.implementationProgram!;
    for (const gate of program.changeGates!) {
      expect((gate.mappingStatus === 'REVIEW_REQUIRED')).toBe(gate.primaryProgramId === null);
      expect(gate.dependsOnGateIds).toEqual([]);
      expect(gate.schedulerPermission).toBe('NOT_SELECTED');
    }
    for (const item of program.programs!) expect('dependsOn' in item).toBe(false);
    expect(workboard.taskInventory.filter((task) => task.schedulerPermission === 'SELECTED')).toEqual([]);
  });

  it('rejects a package pointing at a missing change gate and a task with a forged program', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const badPackage = structuredClone(workboard);
    badPackage.implementationProgram!.workPackages[0].changeGateId = 'GATE-CHANGE-does-not-exist';
    expect(OpenSpecWorkboardV1Schema.safeParse(badPackage).success).toBe(false);
    const badTask = structuredClone(workboard);
    const open = badTask.taskInventory.find((task) => task.state === 'OPEN' && task.hierarchy?.primaryProgramId);
    expect(open).toBeDefined();
    open!.hierarchy!.primaryProgramId = 'FORGED_PROGRAM';
    expect(OpenSpecWorkboardV1Schema.safeParse(badTask).success).toBe(false);
  });

  it('rejects a task that claims SELECTED without an explicit selection file', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const forged = structuredClone(workboard);
    forged.taskInventory.find((task) => task.state === 'OPEN')!.schedulerPermission = 'SELECTED';
    expect(OpenSpecWorkboardV1Schema.safeParse(forged).success).toBe(false);
  });

  it('completion tracking reconciles to the summary and its ledger is well formed', async () => {
    const { workboard } = await loadOpenSpecWorkboardV1(LIVE_ARTIFACT);
    const tracking = workboard.completionTracking!;
    expect(tracking).toBeDefined();
    expect(tracking.completedTotal).toBe(workboard.summary.completedTasks);
    const desynced = structuredClone(workboard);
    desynced.completionTracking!.completedTotal += 1;
    expect(OpenSpecWorkboardV1Schema.safeParse(desynced).success).toBe(false);
  });
});
