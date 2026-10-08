#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildPortfolioCensus } from './audit-openspec-evidence-fabric-v1.mjs';
import { buildOpenSpecTaskCardReportV1, classifyTaskEvidenceCardJoinV1, evaluateTaskEvidenceAdmissionV1 } from './lib/openspec-task-card-v1.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmpRoot = resolve(root, '.tmp');

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function getHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`GIT_HEAD_UNAVAILABLE:${result.stderr.trim()}`);
  return result.stdout.trim();
}

function buildWorkboardSnapshot() {
  const script = resolve(root, 'scripts/atlas/build-openspec-workboard-v1.mjs');
  const result = spawnSync(process.execPath, [script, '--task-snapshot-stdout'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`WORKBOARD_SNAPSHOT_FAILED:${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

function verifyTaskSources(workboard) {
  const entries = Object.entries(workboard.sourceFileHashes ?? {});
  if (!entries.length) throw new Error('TASK_SOURCE_HASHES_MISSING');
  for (const [sourcePath, expected] of entries) {
    const absolute = resolve(root, sourcePath);
    const rel = relative(root, absolute);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('TASK_SOURCE_PATH_OUTSIDE_REPOSITORY');
    const actual = sha256(readFileSync(absolute, 'utf8'));
    if (actual !== expected) throw new Error(`TASK_SOURCE_HASH_MISMATCH:${sourcePath}`);
  }
  return sha256(canonicalJson(entries.sort(([left], [right]) => left.localeCompare(right))));
}

function parseOutputPath() {
  const arg = process.argv.slice(2).find((value) => value.startsWith('--output='));
  const requested = arg ? arg.slice('--output='.length) : `.tmp/task-evidence-join/${new Date().toISOString().replace(/\D/g, '').slice(0, 17)}-${process.pid}.json`;
  const output = resolve(root, requested);
  const rel = relative(tmpRoot, output);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('..')) {
    throw new Error('OUTPUT_MUST_BE_UNDER_REPOSITORY_TMP');
  }
  return output;
}

function main() {
  const outputPath = parseOutputPath();
  const headAtStart = getHead();
  const workboard = buildWorkboardSnapshot();
  if (workboard.schema !== 'atlas.openspec.workboard-task-snapshot.v1') throw new Error('WORKBOARD_SCHEMA_UNSUPPORTED');
  const sourceFileHash = verifyTaskSources(workboard);
  const census = buildPortfolioCensus(root);
  if (census.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('EVIDENCE_CENSUS_SCHEMA_UNSUPPORTED');
  if (census.source?.gitCommit !== headAtStart) throw new Error('EVIDENCE_CENSUS_HEAD_MISMATCH');
  const currentEvidenceTasks = census.tasks.filter((item) => !item.archived
    && item.tasksPath?.startsWith('openspec/changes/')
    && item.tasksPath.split('/').length === 4
    && item.tasksPath.endsWith('/tasks.md'));
  const taskSnapshotChecksum = sha256(canonicalJson({ sourceFileHash, tasks: workboard.tasks }));
  const evidenceInputChecksum = sha256(canonicalJson({
    workspaceRevision: census.source.workspaceRevision,
    tasks: currentEvidenceTasks,
    evidenceCards: census.evidenceCards,
  }));
  const join = classifyTaskEvidenceCardJoinV1({
    tasks: workboard.tasks.map((task) => ({
      ...task,
      sourceFileRevision: workboard.sourceFileHashes?.[task.source] ?? null,
    })),
    evidenceTasks: currentEvidenceTasks,
    evidenceCards: census.evidenceCards,
    workspaceRevision: census.source.workspaceRevision,
  });
  const taskCardReport = buildOpenSpecTaskCardReportV1({
    workboard,
    evidenceCensus: census,
    head: headAtStart,
    taskFileHashes: workboard.sourceFileHashes,
  });
  const evidenceTaskByRef = new Map(currentEvidenceTasks.map((task) => [task.taskRef, task]));
  const evidenceCardsByRef = new Map();
  for (const card of census.evidenceCards) {
    const rows = evidenceCardsByRef.get(card.taskRef) ?? [];
    rows.push(card);
    evidenceCardsByRef.set(card.taskRef, rows);
  }
  const joinRowByRef = new Map(join.rows.map((row) => [row.taskRef, row]));
  const taskEvidenceAdmissions = taskCardReport.cards.flatMap((taskCard) => {
    const evidenceTask = evidenceTaskByRef.get(taskCard.taskRef);
    const evidenceCardRows = evidenceCardsByRef.get(taskCard.taskRef) ?? [];
    const joinRow = joinRowByRef.get(taskCard.taskRef);
    if (!evidenceTask || evidenceCardRows.length !== 1 || joinRow?.joinable !== true) return [];
    const evidenceCard = evidenceCardRows[0];
    const receiptBindings = census.evidenceMatches.filter((binding) => evidenceCard.evidenceIds.includes(binding.evidenceId));
    return [evaluateTaskEvidenceAdmissionV1({ taskCard, evidenceTask, evidenceCard, receiptBindings })];
  });
  const unsigned = {
    schema: 'atlas.current-task-evidence-card-join-report.v1',
    workspaceHead: headAtStart,
    workspaceRevision: census.source.workspaceRevision,
    taskSourceFileHash: sourceFileHash,
    taskSnapshotChecksum,
    evidenceInputChecksum,
    taskCount: workboard.tasks.length,
    evidenceTaskCount: currentEvidenceTasks.length,
    evidenceCardCount: census.evidenceCards.length,
    taskEvidenceAdmissionCandidateCount: taskEvidenceAdmissions.length,
    taskEvidenceAdmissionPassedCount: taskEvidenceAdmissions.filter((admission) => admission.admitted).length,
    taskEvidenceAdmissionRejectedCount: taskEvidenceAdmissions.filter((admission) => !admission.admitted).length,
    joinableTaskCount: join.rows.filter((row) => row.joinable).length,
    nonJoinableTaskCount: join.rows.filter((row) => !row.joinable).length,
    join,
    taskEvidenceAdmissions,
    proofUsableEvidenceCardCount: census.evidenceCards.filter((card) => card.proofUsable === true).length,
    censusStatus: census.parserAudit?.censusStatus ?? census.summary?.censusStatus ?? 'UNKNOWN',
    canonicalAuthority: false,
    writesPerformed: false,
    interpretation: 'TaskEvidenceAdmissionV1 is a non-authoritative task-claim proof projection. It does not prove code-span grounding, promote ontology facts, or authorize indexing.',
  };
  const report = { ...unsigned, checksum: sha256(canonicalJson(unsigned)), generatedAt: new Date().toISOString() };
  if (getHead() !== headAtStart) throw new Error('WORKSPACE_HEAD_CHANGED_DURING_CENSUS');
  verifyTaskSources(workboard);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report)}\n`, { encoding: 'utf8', flag: 'wx' });
  const readback = JSON.parse(readFileSync(outputPath, 'utf8'));
  const { checksum, generatedAt: _generatedAt, ...readbackUnsigned } = readback;
  if (checksum !== sha256(canonicalJson(readbackUnsigned))
    || readback.checksum !== report.checksum
    || readback.join.evidenceCardRows.length !== report.evidenceCardCount) {
    throw new Error('TASK_EVIDENCE_JOIN_READBACK_MISMATCH');
  }
  if (getHead() !== headAtStart) throw new Error('WORKSPACE_HEAD_CHANGED_DURING_READBACK');
  process.stdout.write(`${JSON.stringify({
    status: 'CURRENT_TASK_EVIDENCE_CARD_JOIN_READBACK_PROVEN',
    workspaceHead: headAtStart,
    workspaceRevision: report.workspaceRevision,
    taskCount: report.taskCount,
    evidenceTaskCount: report.evidenceTaskCount,
    evidenceCardCount: report.evidenceCardCount,
    taskEvidenceAdmissionCandidateCount: report.taskEvidenceAdmissionCandidateCount,
    taskEvidenceAdmissionPassedCount: report.taskEvidenceAdmissionPassedCount,
    taskEvidenceAdmissionRejectedCount: report.taskEvidenceAdmissionRejectedCount,
    joinableTaskCount: report.joinableTaskCount,
    nonJoinableTaskCount: report.nonJoinableTaskCount,
    taskCardCardinality: report.join.cardinalityCounts,
    evidenceCardTaskCardinality: report.join.evidenceCardCardinalityCounts,
    activeEvidenceCardTaskCardinality: report.join.activeEvidenceCardCardinalityCounts,
    evidenceCardScope: report.join.evidenceCardScopeCounts,
    taskSnapshotChecksum: report.taskSnapshotChecksum,
    evidenceInputChecksum: report.evidenceInputChecksum,
    proofUsableEvidenceCardCount: report.proofUsableEvidenceCardCount,
    censusStatus: report.censusStatus,
    checksum: report.checksum,
    output: relative(root, outputPath).replaceAll('\\', '/'),
    canonicalAuthority: false,
    writesPerformed: false,
  }, null, 2)}\n`);
}

main();
