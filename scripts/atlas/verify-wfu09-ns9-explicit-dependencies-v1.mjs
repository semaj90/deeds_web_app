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
const reportPath = path.resolve(process.argv[5] ?? 'docs/reports/wfu09-ns9-explicit-dependencies-v1.json');
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

const cases = [
  {
    logicalTaskKey: 'parent-atlas-ontology-kernel:NEXT-23',
    sourceRef: 'openspec/changes/parent-atlas-ontology-kernel/tasks.md',
    expectedDependencyIds: ['NEXT-22'],
    expectedDependencyLogicalKeys: ['parent-atlas-ontology-kernel:NEXT-22'],
  },
  {
    logicalTaskKey: 'parent-atlas-versioned-doc-intelligence:DOC-BATCH-13',
    sourceRef: 'openspec/changes/parent-atlas-versioned-doc-intelligence/tasks.md',
    expectedDependencyIds: ['DOC-BATCH-10', 'DOC-BATCH-11', 'DOC-BATCH-12'],
    expectedDependencyLogicalKeys: [
      'parent-atlas-versioned-doc-intelligence:DOC-BATCH-10',
      'parent-atlas-versioned-doc-intelligence:DOC-BATCH-11',
      'parent-atlas-versioned-doc-intelligence:DOC-BATCH-12',
    ],
  },
  {
    logicalTaskKey: 'parent-atlas-ace-rlm-bitfrost-integration:SYSTEM-PROMPT-01',
    sourceRef: 'openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md',
    expectedDependencyIds: ['CTX-E2E-01'],
    expectedDependencyLogicalKeys: ['parent-atlas-ace-rlm-bitfrost-integration:CTX-E2E-01'],
  },
  {
    logicalTaskKey: 'parent-atlas-topology-representation-admission:TOPO-11A',
    sourceRef: 'openspec/changes/parent-atlas-topology-representation-admission/tasks.md',
    expectedDependencyIds: ['TOPO-11'],
    expectedDependencyLogicalKeys: ['parent-atlas-topology-representation-admission:TOPO-11'],
  },
  {
    logicalTaskKey: 'parent-atlas-graphify-recovery-proof-ladder:SRCREF-RECONCILE-01',
    sourceRef: 'openspec/changes/parent-atlas-graphify-recovery-proof-ladder/tasks.md',
    expectedDependencyIds: ['SRCREF-HARNESS-01'],
    expectedDependencyLogicalKeys: ['parent-atlas-graphify-recovery-proof-ladder:SRCREF-HARNESS-01'],
  },
  {
    logicalTaskKey: 'parent-atlas-neural-prefill-encoder:PKG-07',
    sourceRef: 'openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md',
    expectedDependencyIds: ['PKG-03', 'PKG-04', 'PKG-05', 'PKG-06'],
    expectedDependencyLogicalKeys: ['PKG-03', 'PKG-04', 'PKG-05', 'PKG-06'].map((id) => `parent-atlas-neural-prefill-encoder:${id}`),
  },
  {
    logicalTaskKey: 'parent-atlas-neural-prefill-encoder:G-08',
    sourceRef: 'openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md',
    expectedDependencyIds: ['G-01', 'G-02', 'G-03', 'G-04', 'G-05', 'G-06', 'G-07'],
    expectedDependencyLogicalKeys: ['G-01', 'G-02', 'G-03', 'G-04', 'G-05', 'G-06', 'G-07'].map((id) => `parent-atlas-neural-prefill-encoder:${id}`),
  },
  {
    logicalTaskKey: 'parent-atlas-gpu-sidecar-patch-tournament:TOUR-QLORA-02',
    sourceRef: 'openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/tasks.md',
    expectedDependencyIds: ['TOUR-QLORA-01'],
    expectedDependencyLogicalKeys: ['parent-atlas-gpu-sidecar-patch-tournament:TOUR-QLORA-01'],
  },
  {
    logicalTaskKey: 'parent-atlas-gpu-sidecar-patch-tournament:TOUR-QLORA-GATE-01',
    sourceRef: 'openspec/changes/parent-atlas-gpu-sidecar-patch-tournament/tasks.md',
    expectedDependencyIds: ['TOUR-P1-EVAL-01', 'TOUR-RECEIPT-01'],
    expectedDependencyLogicalKeys: ['TOUR-P1-EVAL-01', 'TOUR-RECEIPT-01'].map((id) => `parent-atlas-gpu-sidecar-patch-tournament:${id}`),
  },
  {
    logicalTaskKey: 'parent-atlas-retrieval-lod-algorithm-taxonomy:P24-TEST-LOCK-09',
    sourceRef: 'openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/tasks.md',
    expectedDependencyIds: ['P24-EXIT-08'],
    expectedDependencyLogicalKeys: ['parent-atlas-retrieval-lod-algorithm-taxonomy:P24-EXIT-08'],
  },
  {
    logicalTaskKey: 'parent-atlas-code-intel-e2e:CODE-IMPACT-01',
    sourceRef: 'openspec/changes/parent-atlas-code-intel-e2e/tasks.md',
    expectedDependencyIds: ['SOURCE-SYMBOL-AUTHORITY-01', 'AST-LIVE-JOIN-01'],
    expectedDependencyLogicalKeys: ['SOURCE-SYMBOL-AUTHORITY-01', 'AST-LIVE-JOIN-01'].map((id) => `parent-atlas-code-intel-e2e:${id}`),
  },
  {
    logicalTaskKey: 'parent-atlas-code-intel-e2e:MCP-CODE-INTEL-01',
    sourceRef: 'openspec/changes/parent-atlas-code-intel-e2e/tasks.md',
    expectedDependencyIds: ['CODE-IMPACT-01'],
    expectedDependencyLogicalKeys: ['parent-atlas-code-intel-e2e:CODE-IMPACT-01'],
  },
  {
    logicalTaskKey: 'parent-atlas-repair-candidate-feature-matrix:REC-04',
    sourceRef: 'openspec/changes/parent-atlas-repair-candidate-feature-matrix/tasks.md',
    expectedDependencyIds: ['REC-03'],
    expectedDependencyLogicalKeys: ['parent-atlas-repair-candidate-feature-matrix:REC-03'],
  },
  {
    logicalTaskKey: 'parent-atlas-retrieval-logic-convergence:CACHE-FABRIC-03',
    sourceRef: 'openspec/changes/parent-atlas-retrieval-logic-convergence/tasks.md',
    expectedDependencyIds: ['CACHE-FABRIC-02'],
    expectedDependencyLogicalKeys: ['parent-atlas-retrieval-logic-convergence:CACHE-FABRIC-02'],
  },
  {
    logicalTaskKey: 'atlas-feature-intelligence:PACKET-ROUTING-INDEX-01',
    sourceRef: 'openspec/changes/atlas-feature-intelligence/tasks.md',
    expectedDependencyIds: ['FI-TITLE-ADDRESS-01'],
    expectedDependencyLogicalKeys: ['atlas-feature-intelligence:FI-TITLE-ADDRESS-01'],
  },
  {
    logicalTaskKey: 'parent-atlas-agentic-file-compiler:AFC-E2E-02',
    sourceRef: 'openspec/changes/parent-atlas-agentic-file-compiler/tasks.md',
    expectedDependencyIds: ['AFC-E2E-01'],
    expectedDependencyLogicalKeys: ['parent-atlas-agentic-file-compiler:AFC-E2E-01'],
  },
  {
    logicalTaskKey: 'parent-atlas-runtime-log-remediation:LOG-16',
    sourceRef: 'openspec/changes/parent-atlas-runtime-log-remediation/tasks.md',
    expectedDependencyIds: ['LOG-09', 'LOG-10'],
    expectedDependencyLogicalKeys: ['LOG-09', 'LOG-10'].map((id) => `parent-atlas-runtime-log-remediation:${id}`),
  },
];
const results = [];
for (const testCase of cases) {
  const workTask = workboard.taskInventory.find((row) => row.logicalTaskKey === testCase.logicalTaskKey);
  const task = controller.allTasks.find((row) => row.logicalTaskKey === testCase.logicalTaskKey);
  const sourcePath = path.resolve(root, testCase.sourceRef);
  if (!workTask || !task || workTask.source !== testCase.sourceRef || task.source !== testCase.sourceRef) {
    results.push({ logicalTaskKey: testCase.logicalTaskKey, status: 'FAIL', reason: 'SOURCE_BOUND_TASK_MISSING' });
    continue;
  }
  const sourceBytes = fs.readFileSync(sourcePath);
  const lines = sourceBytes.toString('utf8').split(/\r?\n/);
  const block = taskBlock(lines, Number(task.line) - 1);
  const sourceBlockSha256 = blockHash(block);
  const declaration = parseWfu(block.join('\n'));
  const dependencies = testCase.expectedDependencyLogicalKeys.map((logicalKey) =>
    controller.allTasks.find((row) => row.logicalTaskKey === logicalKey));
  const expectedTaskKeys = dependencies.filter(Boolean).map((row) => row.taskKey).sort();
  const observedTaskKeys = [...(task.dependsOnTaskIds ?? [])].sort();
  const declaredIds = declaration?.dependsOn ?? [];
  const expectedIds = [...testCase.expectedDependencyIds].sort();
  const unprovenTaskKeys = [...(task.dependencyReadiness?.unprovenTaskKeys ?? [])].sort();
  const checks = {
    exactSourcePath: workTask.source === testCase.sourceRef && task.source === testCase.sourceRef,
    sourceBlockRevisionParity: sourceBlockSha256 === workTask.blockHash && sourceBlockSha256 === task.blockHash,
    authoredDependencySetParity: JSON.stringify([...declaredIds].sort()) === JSON.stringify(expectedIds),
    allDependencyIdentitiesResolve: dependencies.length === testCase.expectedDependencyLogicalKeys.length && dependencies.every(Boolean),
    exactTaskKeyResolution: JSON.stringify(observedTaskKeys) === JSON.stringify(expectedTaskKeys),
    missingProofReceiptsKeepTaskBlocked: task.controller?.state === 'WAITING_ON_DEPENDENCY'
      && task.dependencyReadiness?.ready === false
      && task.dependencyReadiness?.unresolvedTaskKeys?.length === 0
      && task.dependencyReadiness?.cyclic === false
      && JSON.stringify(unprovenTaskKeys) === JSON.stringify(expectedTaskKeys),
    blockedTaskExcludedFromActionableAdapter: !actionable.tasks.some((row) => row.id === task.taskKey),
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  results.push({
    logicalTaskKey: testCase.logicalTaskKey,
    taskKey: task.taskKey,
    sourceRef: testCase.sourceRef,
    sourceLine: task.line,
    sourceFileSha256: digest(sourceBytes),
    sourceBlockSha256,
    taskRevision: task.taskIdentity?.taskRevision ?? null,
    declaredDependsOn: declaration?.dependsOn ?? null,
    resolvedDependsOnTaskKeys: task.dependsOnTaskIds ?? [],
    controllerState: task.controller?.state ?? null,
    blockerKey: task.controller?.blockerKey ?? null,
    dependencyReadiness: task.dependencyReadiness ?? null,
    checks,
    failedChecks,
    status: failedChecks.length ? 'FAIL' : 'PASS_BLOCKED_PENDING_PROOF',
  });
}
const failed = results.filter((row) => row.status === 'FAIL');
const report = {
  schema: 'atlas.wfu09-ns9-explicit-dependencies.v1',
  generatedAt: new Date().toISOString(),
  workspaceRevision: git('rev-parse', 'HEAD'),
  status: failed.length ? 'FAIL' : 'PASS_EXPLICIT_DEPENDENCIES_PROPAGATED',
  authority: 'SOURCE_BOUND_DEPENDENCY_PROPAGATION_CHECK',
  canonicalAuthority: false,
  writesPerformed: false,
  taskSourceMutationPerformedByVerifier: false,
  counts: {
    tasksChecked: results.length,
    declaredEdges: results.reduce((count, row) => count + (row.declaredDependsOn?.length ?? 0), 0),
    resolvedEdges: results.reduce((count, row) => count + (row.resolvedDependsOnTaskKeys?.length ?? 0), 0),
    blockedPendingProof: results.filter((row) => row.status === 'PASS_BLOCKED_PENDING_PROOF').length,
    failedTasks: failed.length,
  },
  inputs: {
    workboard: { path: rel(workboardPath), sha256: fileDigest(workboardPath) },
    controller: { path: rel(controllerPath), sha256: fileDigest(controllerPath) },
    actionableAdapter: { path: rel(actionablePath), sha256: fileDigest(actionablePath) },
    verifier: { path: rel(fileURLToPath(import.meta.url)), sha256: fileDigest(fileURLToPath(import.meta.url)) },
  },
  tasks: results,
  limitations: [
    'This verifies two authored dependency sets only; it does not establish broad NS-9 metadata coverage.',
    'Both dependent tasks remain blocked until their prerequisites have current independently admitted proof receipts.',
    'No scheduler admission, task execution, database mutation, cache mutation, or completion is authorized by this report.',
  ],
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: rel(reportPath), status: report.status, counts: report.counts, failures: failed.map((row) => ({ task: row.logicalTaskKey, checks: row.failedChecks })) }, null, 2));
if (failed.length) process.exitCode = 1;
