#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const root = process.cwd();
const actionablePath = path.resolve(process.argv[2] ?? '.tmp/atlas/wfu09-current-actionable-workboard-v3.json');
const workboardPath = path.resolve(process.argv[3] ?? '.tmp/atlas/wfu09-workboard-refreshed.json');
const controllerPath = path.resolve(process.argv[4] ?? '.tmp/atlas/wfu09-controller-refresh2/openspec-execution-controller-v1.json');
const reportPath = path.resolve(process.argv[5] ?? 'docs/reports/wfu09-task-block-history-feature-audit-v1.json');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const rel = (file) => path.relative(root, file).replaceAll(path.sep, '/');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trimEnd();

function parseBlameTimes(blame) {
  const times = new Map();
  let finalLine = null;
  let committerTime = null;
  for (const line of blame.split(/\r?\n/)) {
    const header = /^[0-9a-f]{40} \d+ (\d+)(?: \d+)?$/.exec(line);
    if (header) {
      finalLine = Number(header[1]);
      committerTime = null;
      continue;
    }
    const time = /^committer-time (\d+)$/.exec(line);
    if (time) committerTime = Number(time[1]);
    else if (line.startsWith('\t') && finalLine !== null && committerTime !== null) {
      times.set(finalLine, committerTime);
      committerTime = null;
    }
  }
  return times;
}

const actionable = readJson(actionablePath);
const workboard = readJson(workboardPath);
const controller = readJson(controllerPath);
if (actionable.schema !== 'atlas.actionable-workboard.v3' || workboard.schema !== 'atlas.openspec.workboard.v1' || controller.schema !== 'atlas.openspec-execution-controller.v1') {
  throw new Error('Expected current actionable workboard, OpenSpec workboard, and execution controller schemas.');
}
const controllerByKey = new Map((controller.allTasks ?? []).map((task) => [task.taskKey, task]));
const dirtyPaths = new Set(git('status', '--porcelain=v1', '-z', '--untracked-files=no').split('\0').filter(Boolean).map((entry) => entry.slice(3).replaceAll('\\', '/')));
const sourceTextByPath = new Map();
const rows = [];
const failures = [];
for (const candidate of actionable.tasks ?? []) {
  const task = controllerByKey.get(candidate.id);
  if (!task?.source || !Number.isInteger(Number(task.line)) || !task.blockHash) {
    failures.push({ taskKey: candidate.id, reason: 'CONTROLLER_SOURCE_BINDING_MISSING' });
    continue;
  }
  const sourceRef = task.source.replaceAll('\\', '/');
  try {
    if (!sourceTextByPath.has(sourceRef)) sourceTextByPath.set(sourceRef, fs.readFileSync(path.resolve(root, sourceRef), 'utf8'));
    const sourceText = sourceTextByPath.get(sourceRef);
    const lines = sourceText.split(/\r?\n/);
    const sourceBlock = taskBlock(lines, Number(task.line) - 1);
    const observedBlockHash = blockHash(sourceBlock);
    const sourceFileSha256 = sha256(sourceText);
    const manifestSha256 = String(workboard.sourceFileHashes?.[sourceRef] ?? '').replace(/^sha256:/, '');
    rows.push({
      taskKey: task.taskKey,
      logicalTaskKey: task.logicalTaskKey ?? null,
      sourceRef,
      line: Number(task.line),
      blockHash: task.blockHash,
      observedBlockHash,
      sourceFileSha256,
      manifestSha256,
      exactBlockMatch: observedBlockHash === task.blockHash,
      exactFileManifestMatch: manifestSha256 === sourceFileSha256,
      sourceCleanAtAudit: !dirtyPaths.has(sourceRef),
      blockLineCount: sourceBlock.length,
    });
  } catch (error) {
    failures.push({ taskKey: candidate.id, sourceRef, reason: 'SOURCE_READ_FAILED', detail: String(error.message).slice(0, 160) });
  }
}

const grouped = new Map();
for (const row of rows) {
  const group = grouped.get(row.sourceRef) ?? [];
  group.push(row);
  grouped.set(row.sourceRef, group);
}
const generatedAt = new Date().toISOString();
const generatedEpoch = Math.floor(Date.parse(generatedAt) / 1000);
const observations = [];
const blameFailures = [];
for (const [sourceRef, sourceRows] of grouped) {
  const eligible = sourceRows.filter((row) => row.exactBlockMatch && row.exactFileManifestMatch && row.sourceCleanAtAudit);
  if (!eligible.length) continue;
  let blameTimes;
  try {
    blameTimes = parseBlameTimes(git('blame', '--line-porcelain', '--', sourceRef));
  } catch (error) {
    blameFailures.push({ sourceRef, reason: 'GIT_BLAME_FAILED', detail: String(error.message).slice(0, 160) });
    continue;
  }
  for (const row of eligible) {
    const taskLineTimes = [];
    for (let line = row.line; line < row.line + row.blockLineCount; line++) {
      const timestamp = blameTimes.get(line);
      if (timestamp !== undefined) taskLineTimes.push(timestamp);
    }
    if (!taskLineTimes.length) {
      blameFailures.push({ taskKey: row.taskKey, sourceRef, reason: 'NO_BLAME_LINES_FOR_TASK_BLOCK' });
      continue;
    }
    const lastChangedAtEpoch = Math.max(...taskLineTimes);
    observations.push({
      taskKey: row.taskKey,
      logicalTaskKey: row.logicalTaskKey,
      sourceRef,
      line: row.line,
      blockHash: row.blockHash,
      sourceFileSha256: row.sourceFileSha256,
      lastChangedAtEpoch,
      taskBlockAgeSeconds: Math.max(0, generatedEpoch - lastChangedAtEpoch),
      basis: 'DERIVED_FROM_GIT_BLAME_COMMITTER_TIME',
    });
  }
}

const ages = observations.map((row) => row.taskBlockAgeSeconds).sort((a, b) => a - b);
const distinctAges = new Set(ages);
const report = {
  schema: 'atlas.wfu09-task-block-history-feature-audit.v1',
  generatedAt,
  workspaceRevision: git('rev-parse', 'HEAD'),
  authority: 'ADVISORY_FEATURE_AUDIT_ONLY',
  canonicalAuthority: false,
  writes: { canonicalStores: false, database: 0, cache: 0, gpu: 0, localReport: true },
  definition: {
    feature: 'taskBlockAgeSeconds',
    derivation: 'generatedAt minus the newest Git committer timestamp among lines in the exact task block',
    qualification: 'only emitted when source file is clean, its full SHA-256 matches the workboard manifest, and its block SHA-256 matches the controller',
    limitations: ['Git history age is a task-block change-age signal, not proof of task readiness, truth, or completion.', 'Uncommitted or stale source rows are absent, never filled from filesystem timestamps.'],
  },
  inputs: {
    actionable: { path: rel(actionablePath), sha256: sha256(fs.readFileSync(actionablePath)) },
    workboard: { path: rel(workboardPath), sha256: sha256(fs.readFileSync(workboardPath)) },
    controller: { path: rel(controllerPath), sha256: sha256(fs.readFileSync(controllerPath)) },
    generator: { path: rel(fileURLToPath(import.meta.url)), sha256: sha256(fs.readFileSync(fileURLToPath(import.meta.url))) },
  },
  counts: {
    actionableRows: (actionable.tasks ?? []).length,
    sourceBoundRows: rows.length,
    exactBlockMatches: rows.filter((row) => row.exactBlockMatch).length,
    exactBlockAndCleanFileMatches: rows.filter((row) => row.exactBlockMatch && row.sourceCleanAtAudit).length,
    exactBlockAndManifestAndCleanMatches: rows.filter((row) => row.exactBlockMatch && row.exactFileManifestMatch && row.sourceCleanAtAudit).length,
    historyObservations: observations.length,
    historyCoverage: (actionable.tasks ?? []).length ? observations.length / actionable.tasks.length : 0,
    distinctAgeValues: distinctAges.size,
    minAgeSeconds: ages[0] ?? null,
    medianAgeSeconds: ages.length ? ages[Math.floor((ages.length - 1) / 2)] : null,
    maxAgeSeconds: ages.at(-1) ?? null,
    sourceFiles: grouped.size,
    sourceBindingFailures: failures.length,
    gitHistoryFailures: blameFailures.length,
  },
  failures: { sourceBindings: failures, gitHistory: blameFailures },
  observations,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: observations.length ? 'PASS_ADVISORY_OBSERVATION' : 'BLOCKED_NO_OBSERVATIONS', report: rel(reportPath), ...report.counts }, null, 2));

function fileURLToPath(url) {
  return new URL(url).pathname.replace(/^\/(\w:)/, '$1').replaceAll('/', path.sep);
}
