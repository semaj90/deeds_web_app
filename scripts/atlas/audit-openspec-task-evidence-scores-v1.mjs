#!/usr/bin/env node
/**
 * Evidence-only task completion audit. A checked box is not proof: 100% is
 * assigned only when the current workboard binding has a PROVEN controller
 * state and an admitted task-bound proof receipt. All other task rows score 0
 * verified completion, with their claim/status and blocker reported separately.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const workboardPath = resolve(ROOT, arg('workboard', '.tmp/atlas/gpu-compute-lanes-workboard-score-v1.json'));
const controllerPath = resolve(ROOT, arg('controller', '.tmp/atlas/gpu-compute-lanes-score-controller/openspec-execution-controller-v1.json'));
const change = arg('change', 'parent-atlas-gpu-compute-lanes-consolidation');
const outputPath = resolve(ROOT, arg('out', 'docs/reports/gpu-compute-lanes-task-evidence-score-v1.json'));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const requireFile = (path) => { if (!existsSync(path)) throw new Error(`INPUT_MISSING: ${path}`); return readFileSync(path); };

const workboardBytes = requireFile(workboardPath);
const controllerBytes = requireFile(controllerPath);
const workboard = JSON.parse(workboardBytes.toString('utf8'));
const controller = JSON.parse(controllerBytes.toString('utf8'));
if (workboard.schema !== 'atlas.openspec.workboard.v1' || !Array.isArray(workboard.taskInventory)) throw new Error('INVALID_WORKBOARD_SCHEMA');
if (controller.schema !== 'atlas.openspec-execution-controller.v1' || !Array.isArray(controller.allTasks) || controller.summary?.writesPerformed !== false) throw new Error('INVALID_OR_MUTATING_CONTROLLER_INPUT');

const rows = workboard.taskInventory.filter((task) => task.change === change);
const controllerRows = controller.allTasks.filter((task) => task.change === change);
if (!rows.length || rows.length !== controllerRows.length) throw new Error(`TASK_COUNT_MISMATCH: workboard=${rows.length} controller=${controllerRows.length}`);
const controllerByTask = new Map(controllerRows.map((task) => [task.taskKey, task]));
const sourceFiles = new Map();
const tasks = [];
const FACTOR_WEIGHTS = {
  acceptanceCoverage: 30,
  evidenceProvenance: 25,
  independentVerification: 20,
  reproducibility: 15,
  gapClosure: 10,
};
for (const task of rows) {
  const current = controllerByTask.get(task.taskKey);
  if (!current || current.source !== task.source || current.line !== task.line || current.blockHash !== task.blockHash) {
    throw new Error(`CONTROLLER_BINDING_MISMATCH: ${task.taskKey}`);
  }
  const sourcePath = resolve(ROOT, task.source);
  if (!sourceFiles.has(task.source)) {
    const bytes = requireFile(sourcePath);
    sourceFiles.set(task.source, { bytes, lines: bytes.toString('utf8').split(/\r?\n/) });
  }
  const source = sourceFiles.get(task.source);
  const block = taskBlock(source.lines, task.line - 1);
  if (blockHash(block) !== task.blockHash) throw new Error(`CURRENT_SOURCE_BLOCK_MISMATCH: ${task.taskKey}`);
  const controllerState = current.controller?.state ?? 'UNKNOWN';
  const proofReceipt = current.proofReceipt ?? null;
  const proven = controllerState === 'PROVEN' && proofReceipt !== null;
  // The current controller feed has source-bound task blocks and proof-receipt
  // presence, but no per-criterion evidence map. Keep those dimensions explicit
  // and refuse a weighted total until that mapping exists.
  const factors = {
    acceptanceCoverage: { weight: FACTOR_WEIGHTS.acceptanceCoverage, points: null, status: 'UNSCORABLE', reason: 'NO_CRITERION_TO_EVIDENCE_MAP' },
    evidenceProvenance: { weight: FACTOR_WEIGHTS.evidenceProvenance, points: 25, status: 'VERIFIED', evidence: 'CURRENT_TASK_BLOCK_SHA256' },
    independentVerification: { weight: FACTOR_WEIGHTS.independentVerification, points: proofReceipt ? null : 0, status: proofReceipt ? 'UNSCORABLE' : 'NO_ADMITTED_TASK_RECEIPT', reason: proofReceipt ? 'RECEIPT_NOT_INDEPENDENTLY_ADMITTED_BY_THIS_AUDIT' : 'NO_ADMITTED_TASK_RECEIPT' },
    reproducibility: { weight: FACTOR_WEIGHTS.reproducibility, points: null, status: 'UNSCORABLE', reason: 'NO_TASK_BOUND_COMMAND_AND_RESULT_CATALOG' },
    gapClosure: { weight: FACTOR_WEIGHTS.gapClosure, points: proven ? 10 : null, status: proven ? 'VERIFIED' : 'UNSCORABLE', reason: proven ? null : 'DEPENDENCY_AND_GAP_EVIDENCE_NOT_MAPPED' },
  };
  const weightedScore = Object.values(factors).every((factor) => factor.points !== null)
    ? Object.values(factors).reduce((sum, factor) => sum + factor.points, 0)
    : null;
  tasks.push({
    taskKey: task.taskKey,
    stableKey: task.stableKey,
    source: task.source,
    line: task.line,
    taskBlockSha256: task.blockHash,
    taskText: task.text,
    checkboxState: task.state,
    controllerState,
    blockerKey: current.controller?.blockerKey ?? null,
    proofReceiptPresent: proofReceipt !== null,
    sourceBlockCurrent: true,
    factorScores: factors,
    weightedEvidenceScore: weightedScore,
    scoringStatus: weightedScore === null ? 'UNSCORABLE_INCOMPLETE_EVIDENCE_MAPPING' : 'SCORABLE',
    claimedCompletionPercent: task.state === 'DONE' ? 100 : 0,
    verifiedCompletionPercent: proven ? 100 : 0,
    scoringNote: proven ? 'PROVEN_WITH_TASK_BOUND_RECEIPT' : 'NOT_PROVEN; checkbox and source binding do not substitute for admitted receipt',
  });
}

const countBy = (list, pick) => Object.fromEntries([...list.reduce((map, item) => map.set(pick(item), (map.get(pick(item)) ?? 0) + 1), new Map())].sort(([a], [b]) => String(a).localeCompare(String(b))));
const provenCount = tasks.filter((task) => task.verifiedCompletionPercent === 100).length;
const doneCount = tasks.filter((task) => task.checkboxState === 'DONE').length;
const report = {
  schema: 'atlas.openspec-task-evidence-completion-audit.v1',
  generatedAt: new Date().toISOString(),
  canonicalAuthority: false,
  taskCompletionAuthorized: false,
  databaseWritesPerformed: false,
  modelCallsPerformed: false,
  scoringRule: 'Per-task verified completion is 100 only for controller state PROVEN plus a task-bound proof receipt; otherwise 0. Checkbox progress is reported separately and is not evidence.',
  factorWeights: FACTOR_WEIGHTS,
  factorScoringRule: 'Award points only for factor evidence validated by this audit. Missing criterion mappings, task-bound commands, or dependency evidence make the aggregate UNSCORABLE; they are not converted to a guessed percentage. Current source-block binding earns provenance points only and never implies implementation completion.',
  inputs: {
    change,
    workboardPath: workboardPath.replace(`${ROOT}\\`, '').replaceAll('\\', '/'),
    workboardSha256: digest(workboardBytes),
    workboardGeneratedAt: workboard.generatedAt,
    controllerPath: controllerPath.replace(`${ROOT}\\`, '').replaceAll('\\', '/'),
    controllerSha256: digest(controllerBytes),
    controllerGeneratedAt: controller.generatedAt,
    controllerWritesPerformed: controller.summary.writesPerformed,
  },
  counts: {
    taskRows: tasks.length,
    currentSourceBlocks: tasks.filter((task) => task.sourceBlockCurrent).length,
    checkedDone: doneCount,
    open: tasks.length - doneCount,
    rawCheckboxProgressPercent: tasks.length ? Number((doneCount * 100 / tasks.length).toFixed(2)) : null,
    independentlyProven: provenCount,
    evidenceVerifiedCompletionPercent: tasks.length ? Number((provenCount * 100 / tasks.length).toFixed(2)) : null,
    tasksWithProofReceipt: tasks.filter((task) => task.proofReceiptPresent).length,
    factorScorableTasks: tasks.filter((task) => task.scoringStatus === 'SCORABLE').length,
    factorUnscorableTasks: tasks.filter((task) => task.scoringStatus !== 'SCORABLE').length,
  },
  controllerStates: countBy(tasks, (task) => task.controllerState),
  blockerKeys: countBy(tasks.filter((task) => task.blockerKey), (task) => task.blockerKey),
  interpretation: 'The checkbox ratio is self-reported ledger progress. Evidence-verified completion is 0% when no current task-bound proof receipts are admitted; this does not prove no implementation exists. Per-task score buckets are ordered PROVEN, CHECKED_UNVERIFIED, WAITING_ON_AUTHORITY, WAITING_ON_DEPENDENCY, DEFERRED, ACTIONABLE.',
  tasks,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, ...report.counts, controllerStates: report.controllerStates, blockerKeys: report.blockerKeys }, null, 2));
