#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { blockHash, parseWfu, taskBlock } from './lib/wfu-metadata.mjs';

const root = process.cwd();
const workboardPath = path.resolve(process.argv[2] ?? '.tmp/atlas/wfu09-ns9-adoption-v1/openspec-workboard-v1.json');
const controllerPath = path.resolve(process.argv[3] ?? '.tmp/atlas/wfu09-ns9-adoption-v1/reports/openspec-execution-controller-v1.json');
const actionablePath = path.resolve(process.argv[4] ?? '.tmp/atlas/wfu09-ns9-adoption-v1/actionable-workboard-v3.json');
const reportPath = path.resolve(process.argv[5] ?? 'docs/reports/wfu09-ns9-first-dependency-adoption-v1.json');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileDigest = (file) => digest(fs.readFileSync(file));
const rel = (file) => path.relative(root, file).replaceAll(path.sep, '/');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

const workboard = JSON.parse(fs.readFileSync(workboardPath, 'utf8'));
const controller = JSON.parse(fs.readFileSync(controllerPath, 'utf8'));
const actionable = JSON.parse(fs.readFileSync(actionablePath, 'utf8'));
if (workboard.schema !== 'atlas.openspec.workboard.v1'
  || controller.schema !== 'atlas.openspec-execution-controller.v1'
  || actionable.schema !== 'atlas.actionable-workboard.v3') {
  throw new Error('Unexpected workboard/controller/adapter schema.');
}

const logicalKey = 'parent-atlas-ontology-kernel:NEXT-23';
const dependencyLogicalKey = 'parent-atlas-ontology-kernel:NEXT-22';
const sourceRef = 'openspec/changes/parent-atlas-ontology-kernel/tasks.md';
const workTask = workboard.taskInventory.find((row) => row.logicalTaskKey === logicalKey);
const task = controller.allTasks.find((row) => row.logicalTaskKey === logicalKey);
const dependency = controller.allTasks.find((row) => row.logicalTaskKey === dependencyLogicalKey);
if (!workTask || !task || !dependency || workTask.source !== sourceRef || task.source !== sourceRef) {
  throw new Error('The exact source-bound task or its declared prerequisite is missing.');
}
const sourceBytes = fs.readFileSync(path.resolve(root, sourceRef));
const sourceLines = sourceBytes.toString('utf8').split(/\r?\n/);
const observedBlockHash = blockHash(taskBlock(sourceLines, Number(task.line) - 1));
const declaration = parseWfu(taskBlock(sourceLines, Number(task.line) - 1).join('\n'));
const resolved = Array.isArray(task.dependsOnTaskIds) && task.dependsOnTaskIds.length === 1
  && task.dependsOnTaskIds[0] === dependency.taskKey;
const dependencyUnproven = task.dependencyReadiness?.unprovenTaskKeys?.includes(dependency.taskKey) === true;
const blockedSafely = task.controller?.state === 'WAITING_ON_DEPENDENCY'
  && task.dependencyReadiness?.ready === false
  && task.dependencyReadiness?.unresolvedTaskKeys?.length === 0
  && task.dependencyReadiness?.cyclic === false
  && dependencyUnproven;
const excludedFromActionable = !actionable.tasks.some((row) => row.id === task.taskKey);
const checks = {
  exactSourcePath: workTask.source === sourceRef && task.source === sourceRef,
  sourceBlockRevisionParity: observedBlockHash === workTask.blockHash && observedBlockHash === task.blockHash,
  authoredDependencyOnly: declaration?.dependsOn?.length === 1 && declaration.dependsOn[0] === 'NEXT-22',
  exactExistingTaskResolution: resolved,
  missingPrerequisiteReceiptBlocksTask: blockedSafely,
  blockedTaskExcludedFromActionableAdapter: excludedFromActionable,
  noCanonicalWrites: controller.policy === 'RECOMMENDATION_ONLY_NO_LEDGER_OR_RUNTIME_MUTATION'
    && controller.summary?.writesPerformed === false,
};
const failedChecks = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
const report = {
  schema: 'atlas.wfu09-ns9-first-dependency-adoption.v1',
  generatedAt: new Date().toISOString(),
  workspaceRevision: git('rev-parse', 'HEAD'),
  status: failedChecks.length ? 'FAIL' : 'PASS_DECLARATION_PROPAGATED_BLOCKED_ON_RECEIPT',
  authority: 'SOURCE_BOUND_DEPENDENCY_PROPAGATION_CHECK',
  canonicalAuthority: false,
  writesPerformed: false,
  taskSourceMutationPerformedByVerifier: false,
  task: {
    logicalTaskKey: logicalKey,
    taskKey: task.taskKey,
    sourceRef,
    sourceLine: task.line,
    sourceFileSha256: digest(sourceBytes),
    sourceBlockSha256: observedBlockHash,
    taskRevision: task.taskIdentity?.taskRevision ?? null,
    declaredDependsOn: declaration?.dependsOn ?? null,
    resolvedDependsOnTaskKeys: task.dependsOnTaskIds ?? [],
  },
  prerequisite: {
    logicalTaskKey: dependencyLogicalKey,
    taskKey: dependency.taskKey,
    controllerState: dependency.controller?.state ?? null,
  },
  observedGate: {
    controllerState: task.controller?.state ?? null,
    blockerKey: task.controller?.blockerKey ?? null,
    dependencyReadiness: task.dependencyReadiness ?? null,
    actionableAdapterContainsTask: !excludedFromActionable,
  },
  checks,
  failedChecks,
  inputs: {
    workboard: { path: rel(workboardPath), sha256: fileDigest(workboardPath) },
    controller: { path: rel(controllerPath), sha256: fileDigest(controllerPath) },
    actionableAdapter: { path: rel(actionablePath), sha256: fileDigest(actionablePath) },
    verifier: { path: rel(fileURLToPath(import.meta.url)), sha256: fileDigest(fileURLToPath(import.meta.url)) },
  },
  limitations: [
    'This verifies one task declaration and its current DAG gate only.',
    'It does not authorize scheduler admission, execution, task completion, a database write, or changes to other task ledgers.',
    'NEXT-23 remains blocked until NEXT-22 has current independently admitted proof evidence.',
  ],
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: rel(reportPath), status: report.status, checks, failedChecks }, null, 2));
if (failedChecks.length) process.exitCode = 1;
