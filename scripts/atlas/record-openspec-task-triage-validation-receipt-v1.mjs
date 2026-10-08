#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEvidenceReceiptV1,
  buildPortfolioCensus,
  computeOpenSpecWorkspaceRevisionV1,
  verifyEvidenceReceiptV1,
} from './audit-openspec-evidence-fabric-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const changeId = 'parent-atlas-openspec-task-triage-pipeline';
const taskId = '2.2';
const reportLimitBytes = 10_000_000;
function scratchCorpusPath(environmentKey, fallback) {
  const requested = process.env[environmentKey];
  if (!requested) return fallback;
  const resolved = path.resolve(root, requested);
  const scratchRoot = path.resolve(root, '.tmp');
  const relative = path.relative(scratchRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${environmentKey}_MUST_TARGET_REPOSITORY_TMP`);
  }
  return path.relative(root, resolved).replaceAll('\\', '/');
}
const corpusPaths = {
  taskCards: scratchCorpusPath('OPENSPEC_TASK_CARDS_OUTPUT', 'docs/reports/openspec-task-cards-v1.json'),
  reportManifests: scratchCorpusPath('OPENSPEC_REPORT_MANIFESTS_OUTPUT', 'docs/reports/openspec-report-artifact-manifests-v1.json'),
  triage: scratchCorpusPath('OPENSPEC_TRIAGE_CORPUS_OUTPUT', 'docs/reports/openspec-task-triage-corpus-v1.json'),
};
const testPaths = [
  'scripts/atlas/audit-openspec-evidence-fabric-v1.test.mjs',
  'scripts/atlas/lib/openspec-report-manifest-v1.test.mjs',
  'scripts/atlas/lib/openspec-task-card-v1.test.mjs',
  'scripts/atlas/lib/openspec-task-triage-corpus-v1.test.mjs',
];

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function hashFile(relativePath) {
  return sha256(fs.readFileSync(path.join(root, relativePath)));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function run(command, args, { shell = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

function validateCorpus(workspaceRevision, head) {
  const taskCards = readJson(corpusPaths.taskCards);
  const reportManifests = readJson(corpusPaths.reportManifests);
  const triage = readJson(corpusPaths.triage);
  const inputs = [taskCards, reportManifests, triage];
  if (taskCards.source?.workspaceHead !== head || reportManifests.workspaceHead !== head || triage.workspaceHead !== head) {
    throw new Error('TRIAGE_CORPUS_HEAD_MISMATCH');
  }
  if (taskCards.source?.workspaceRevision !== workspaceRevision
    || reportManifests.workspaceRevision !== workspaceRevision
    || triage.taskCardCorpus?.source?.workspaceRevision !== workspaceRevision
    || triage.reportManifestCorpus?.workspaceRevision !== workspaceRevision) {
    throw new Error('TRIAGE_CORPUS_REVISION_MISMATCH');
  }
  if (inputs.some((input) => input.writesPerformed !== false)
    || taskCards.cardPolicy?.canonicalAuthority !== false
    || taskCards.cardPolicy?.mutationAuthorized !== false
    || reportManifests.policy?.canonicalAuthority !== false
    || reportManifests.policy?.mutationAuthorized !== false
    || reportManifests.policy?.sizeAloneDoesNotQualify !== true
    || triage.summary?.canonicalAuthority !== false
    || triage.summary?.mutationAuthorized !== false
    || triage.summary?.archiveEligibleCount !== 0) {
    throw new Error('TRIAGE_CORPUS_AUTHORITY_OR_WRITE_GUARD_FAILED');
  }

  const artifacts = Object.entries(corpusPaths).map(([name, uri]) => {
    const sizeBytes = fs.statSync(path.join(root, uri)).size;
    if (sizeBytes >= reportLimitBytes) throw new Error(`TRIAGE_ARTIFACT_OVER_LIMIT:${uri}:${sizeBytes}`);
    return { name, uri, checksum: hashFile(uri), sizeBytes };
  });
  return { taskCards, reportManifests, triage, artifacts };
}

function main() {
  const head = run('git', ['rev-parse', 'HEAD']).trim();
  const taskCardBuild = JSON.parse(run(process.execPath, [
    'scripts/atlas/build-openspec-task-cards-v1.mjs',
    `--output=${corpusPaths.taskCards}`,
  ]));
  if (taskCardBuild.status !== 'TASK_CARDS_WRITTEN' || taskCardBuild.writesPerformed !== false) {
    throw new Error('TASK_CARD_REFRESH_FAILED');
  }
  const manifestBuild = JSON.parse(run(process.execPath, [
    'scripts/atlas/build-openspec-report-manifests-v1.mjs',
    `--task-cards=${corpusPaths.taskCards}`,
    `--output=${corpusPaths.reportManifests}`,
  ]));
  if (manifestBuild.status !== 'REPORT_MANIFESTS_WRITTEN' || manifestBuild.archiveWrites !== false) {
    throw new Error('REPORT_MANIFEST_REFRESH_FAILED');
  }
  const triageBuild = JSON.parse(run(process.execPath, [
    'scripts/atlas/build-openspec-task-triage-corpus-v1.mjs',
    `--task-cards=${corpusPaths.taskCards}`,
    `--report-manifests=${corpusPaths.reportManifests}`,
    `--output=${corpusPaths.triage}`,
  ]));
  if (triageBuild.status !== 'TRIAGE_CORPUS_WRITTEN' || triageBuild.writesPerformed !== false) {
    throw new Error('TRIAGE_CORPUS_REFRESH_FAILED');
  }

  const testOutput = run(process.execPath, ['--test', ...testPaths]);
  const testCount = Number(testOutput.match(/^# tests (\d+)$/m)?.[1] ?? 0);
  const failedTests = Number(testOutput.match(/^# fail (\d+)$/m)?.[1] ?? -1);
  if (testCount === 0 || failedTests !== 0) throw new Error('FOCUSED_CONTRACT_TESTS_UNCONFIRMED');

  const validationOutput = run('openspec', [
    'validate', changeId, '--type', 'change', '--strict', '--json', '--no-interactive',
  ], { shell: process.platform === 'win32' });
  const validation = JSON.parse(validationOutput);
  if (validation.summary?.totals?.failed !== 0 || validation.summary?.totals?.passed !== 1) {
    throw new Error('STRICT_OPENSPEC_VALIDATION_FAILED');
  }

  const workspaceRevision = computeOpenSpecWorkspaceRevisionV1(root);
  const census = buildPortfolioCensus(root);
  const corpus = validateCorpus(workspaceRevision, head);
  const task = census.tasks.find((candidate) => candidate.changeId === changeId && candidate.taskId === taskId);
  if (!task) throw new Error('TRIAGE_VALIDATION_TASK_NOT_FOUND');
  if (computeOpenSpecWorkspaceRevisionV1(root) !== workspaceRevision
    || census.source.workspaceRevision !== workspaceRevision || census.source.gitCommit !== head) {
    throw new Error('TRIAGE_VALIDATION_SOURCE_CHANGED_DURING_RUN');
  }

  const observedAt = new Date().toISOString();
  const runId = observedAt.replace(/[-:.TZ]/g, '');
  const revisionTag = workspaceRevision.slice(7, 19);
  const runPath = `docs/reports/openspec-task-triage-validation-run-v1-${revisionTag}-${runId}.json`;
  const receiptPath = `docs/reports/openspec-task-triage-validation-receipt-v1-${revisionTag}-${runId}.json`;
  const runAbsolutePath = path.join(root, runPath);
  const receiptAbsolutePath = path.join(root, receiptPath);
  if (fs.existsSync(runAbsolutePath) || fs.existsSync(receiptAbsolutePath)) throw new Error('TRIAGE_VALIDATION_RUN_PATH_EXISTS');

  const runReport = {
    schema: 'atlas.openspec-task-triage-validation-run.v1',
    generatedAt: observedAt,
    changeId,
    taskId,
    taskRef: task.taskRef,
    taskRevision: task.taskHash,
    workspaceHead: head,
    workspaceRevision,
    taskPopulationRevision: corpus.triage.taskPopulationRevision,
    tests: { command: `node --test ${testPaths.join(' ')}`, passed: testCount, failed: failedTests },
    openSpecValidation: {
      command: `openspec validate ${changeId} --type change --strict --json --no-interactive`,
      passed: validation.summary.totals.passed,
      failed: validation.summary.totals.failed,
    },
    corpus: {
      artifacts: corpus.artifacts,
      taskCount: corpus.taskCards.summary.taskCount,
      reportArtifactCount: corpus.reportManifests.summary.artifactCount,
      taskCardBytes: taskCardBuild.reportBytes,
      reportManifestBytes: manifestBuild.reportBytes,
      triageBytes: triageBuild.outputBytes,
      joinedReportCount: corpus.reportManifests.summary.associatedTaskCount,
      supersededCount: corpus.triage.summary.confirmedSupersededCount,
      archiveEligibleCount: corpus.triage.summary.archiveEligibleCount,
    },
    authority: { canonicalAuthority: false, mutationAuthorized: false },
    writes: { reportArtifactsWritten: true, database: false, qdrant: false, neo4j: false, valkey: false, seaweedfs: false },
  };
  const runBytes = Buffer.from(`${JSON.stringify(runReport, null, 2)}\n`, 'utf8');
  if (runBytes.length >= reportLimitBytes) throw new Error(`TRIAGE_VALIDATION_RUN_OVER_LIMIT:${runBytes.length}`);
  fs.writeFileSync(runAbsolutePath, runBytes, { flag: 'wx' });
  const runChecksum = sha256(runBytes);

  const receipt = buildEvidenceReceiptV1({
    schema: 'atlas.evidence-receipt.v1',
    evidenceId: `receipt:${changeId}:${taskId}:${revisionTag}:${runId}`,
    evidenceType: 'VALIDATION',
    changeId,
    taskId,
    claim: 'The compact OpenSpec task, report-manifest, and triage pipeline passes focused contracts and strict change validation against one current workspace revision; report associations remain derived and advisory.',
    gitCommit: head,
    workspaceRevision,
    sourceRevision: task.taskHash,
    sourceRefs: [{
      file: task.tasksPath,
      lineStart: task.sourceLine,
      lineEnd: task.sourceLine,
      sourceRevision: hashFile(task.tasksPath),
    }],
    producer: 'scripts/atlas/record-openspec-task-triage-validation-receipt-v1.mjs',
    command: `node scripts/atlas/record-openspec-task-triage-validation-receipt-v1.mjs`,
    inputs: corpus.artifacts.map((artifact) => ({ kind: artifact.name, uri: artifact.uri, checksum: artifact.checksum })),
    observedAt,
    expectedAssertions: [
      { id: 'focused-contracts', expected: 'all focused evidence, TaskCard, manifest, and triage tests pass' },
      { id: 'strict-change-validation', expected: 'the owning OpenSpec change passes strict validation' },
      { id: 'revision-bound-corpus', expected: 'all three corpus stages share the current HEAD and OpenSpec workspace revision' },
      { id: 'bounded-derived-artifacts', expected: 'each corpus output is below 10,000,000 bytes' },
      { id: 'authority-boundary', expected: 'derived artifacts remain non-authoritative and no datastore/archive writes occur' },
      { id: 'receipt-readback', expected: 'the evidence-fabric independently binds this receipt to the exact task and output checksum' },
    ],
    actualAssertions: [
      { id: 'focused-contracts', actual: `${testCount} focused tests passed; ${failedTests} failed`, passed: testCount > 0 && failedTests === 0 },
      { id: 'strict-change-validation', actual: `${validation.summary.totals.passed} change passed; ${validation.summary.totals.failed} failed`, passed: validation.summary.totals.passed === 1 && validation.summary.totals.failed === 0 },
      { id: 'revision-bound-corpus', actual: `all corpus stages use ${workspaceRevision} at HEAD ${head}`, passed: true },
      { id: 'bounded-derived-artifacts', actual: `${corpus.artifacts.length} outputs below ${reportLimitBytes} bytes`, passed: corpus.artifacts.every((artifact) => artifact.sizeBytes < reportLimitBytes) },
      { id: 'authority-boundary', actual: 'only local report artifacts were written; canonical, cache, vector, graph, database, and archive writes are disabled', passed: runReport.authority.canonicalAuthority === false && runReport.authority.mutationAuthorized === false && runReport.writes.reportArtifactsWritten === true && ['database', 'qdrant', 'neo4j', 'valkey', 'seaweedfs'].every((store) => runReport.writes[store] === false) },
      { id: 'receipt-readback', actual: 'pending independent evidence-fabric readback', passed: false },
    ],
    outputs: [{ kind: 'validation_run_report', uri: runPath, checksum: runChecksum }],
    verifier: 'scripts/atlas/audit-openspec-evidence-fabric-v1.mjs',
    independentVerifier: 'buildPortfolioCensus readback with exact task span, workspace revision, receipt checksum, and output checksum',
    readbackRequired: true,
    readbackPerformed: false,
    readbackCommand: 'node scripts/atlas/record-openspec-task-triage-validation-receipt-v1.mjs (post-write census readback)',
    verdict: 'PARTIAL',
  });

  const provisionalPath = path.join(root, receiptPath);
  fs.writeFileSync(provisionalPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  const provisionalCensus = buildPortfolioCensus(root);
  const provisionalMatch = provisionalCensus.evidenceMatches.find((match) => match.evidenceId === receipt.evidenceId);
  const outputReadback = provisionalMatch?.outputs?.some((output) => output.uri === runPath && output.checksum === runChecksum) === true;
  const receiptReadbackPassed = provisionalMatch?.proofEligible === true
    && provisionalMatch.workspaceCurrent === true
    && provisionalMatch.sourceCurrent === true
    && outputReadback;
  if (!receiptReadbackPassed) {
    const failedReceipt = buildEvidenceReceiptV1({
      ...receipt,
      verdict: 'FAILED',
      outputs: [],
      actualAssertions: receipt.actualAssertions.map((assertion) => assertion.id === 'receipt-readback'
        ? { ...assertion, actual: 'evidence-fabric readback did not bind this receipt to the exact task, revision, and output', passed: false }
        : assertion),
    });
    fs.writeFileSync(provisionalPath, `${JSON.stringify(failedReceipt, null, 2)}\n`, 'utf8');
    throw new Error('TRIAGE_VALIDATION_RECEIPT_READBACK_FAILED');
  }

  const provenReceipt = buildEvidenceReceiptV1({
    ...receipt,
    verdict: 'PROVEN',
    readbackPerformed: true,
    actualAssertions: receipt.actualAssertions.map((assertion) => assertion.id === 'receipt-readback'
      ? { ...assertion, actual: 'independent census readback matched the exact task span, workspace/source revisions, and output checksum', passed: true }
      : assertion),
  });
  fs.writeFileSync(provisionalPath, `${JSON.stringify(provenReceipt, null, 2)}\n`, 'utf8');
  const readBack = verifyEvidenceReceiptV1(readJson(receiptPath));
  const finalCensus = buildPortfolioCensus(root);
  const finalMatch = finalCensus.evidenceMatches.find((match) => match.evidenceId === provenReceipt.evidenceId);
  if (readBack.verdict !== 'PROVEN' || finalMatch?.proofEligible !== true
    || finalMatch.workspaceCurrent !== true || finalMatch.sourceCurrent !== true
    || !finalMatch.outputs?.some((output) => output.uri === runPath && output.checksum === runChecksum)) {
    throw new Error('TRIAGE_VALIDATION_FINAL_READBACK_FAILED');
  }

  process.stdout.write(`${JSON.stringify({
    status: 'PROVEN',
    evidenceId: provenReceipt.evidenceId,
    taskRef: task.taskRef,
    taskRevision: task.taskHash,
    workspaceRevision,
    testsPassed: testCount,
    strictOpenSpecValidation: 'PASS',
    receiptWorkspaceCurrent: finalMatch.workspaceCurrent,
    receiptSourceCurrent: finalMatch.sourceCurrent,
    reportOutputChecksumMatched: true,
    runReport: runPath,
    receipt: receiptPath,
    canonicalAuthority: false,
    mutationAuthorized: false,
    canonicalWrites: false,
    archiveWrites: false,
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
