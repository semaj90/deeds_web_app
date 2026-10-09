#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildTaskTriageCorpusV1 } from './lib/openspec-report-manifest-v1.mjs';
import { loadTaskCardCorpusV1 } from './lib/openspec-task-card-v1.mjs';
import { writeTaskTriageShardsV1 } from './lib/openspec-task-triage-shards-v1.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const taskCardsPath = resolve(root, 'docs/reports/openspec-task-cards-v1.json');
const reportManifestsPath = resolve(root, 'docs/reports/openspec-report-artifact-manifests-v1.json');
const defaultOutput = resolve(root, 'docs/reports/openspec-task-triage-corpus-v1.json');
const reportLimitBytes = 10_000_000;

function getHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`GIT_HEAD_UNAVAILABLE:${result.stderr.trim()}`);
  return result.stdout.trim();
}

function parseArgs(args) {
  const parsed = { checkOnly: false };
  for (const arg of args) {
    if (arg === '--check-only') parsed.checkOnly = true;
    else if (arg.startsWith('--task-cards=')) parsed.taskCards = arg.slice('--task-cards='.length);
    else if (arg.startsWith('--report-manifests=')) parsed.reportManifests = arg.slice('--report-manifests='.length);
    else if (arg.startsWith('--reviewed-supersessions=')) parsed.reviewedSupersessions = arg.slice('--reviewed-supersessions='.length);
    else if (arg.startsWith('--output=')) parsed.output = arg.slice('--output='.length);
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  return parsed;
}

function repoPath(value) {
  const target = resolve(root, value);
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`PATH_OUTSIDE_REPOSITORY:${value}`);
  return target;
}

function verifyTaskFileHashes(taskFileHashes) {
  for (const [path, expected] of Object.entries(taskFileHashes ?? {})) {
    const file = repoPath(path);
    if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`TASK_FILE_MISSING:${path}`);
    const actual = `sha256:${createHash('sha256').update(readFileSync(file, 'utf8')).digest('hex')}`;
    if (actual !== expected) throw new Error(`TASK_FILE_REVISION_MISMATCH:${path}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const head = getHead();
  const taskCardInput = repoPath(args.taskCards ?? relative(root, taskCardsPath));
  const reportManifestInput = repoPath(args.reportManifests ?? relative(root, reportManifestsPath));
  const taskCardCorpus = loadTaskCardCorpusV1(taskCardInput);
  const reportManifestCorpus = JSON.parse(readFileSync(reportManifestInput, 'utf8'));
  verifyTaskFileHashes(taskCardCorpus.source?.taskFileHashes);
  let reviewedSupersessionLinks = [];
  if (args.reviewedSupersessions) {
    const receiptCorpus = JSON.parse(readFileSync(repoPath(args.reviewedSupersessions), 'utf8'));
    if (receiptCorpus.schema !== 'atlas.openspec-supersession-link-corpus.v1') throw new Error('SUPERSESSION_RECEIPT_CORPUS_SCHEMA_UNSUPPORTED');
    if (receiptCorpus.workspaceHead !== head || receiptCorpus.taskPopulationRevision !== taskCardCorpus.source?.sourcePopulationChecksum) {
      throw new Error('SUPERSESSION_RECEIPT_CORPUS_REVISION_MISMATCH');
    }
    if (!Array.isArray(receiptCorpus.links)) throw new Error('SUPERSESSION_RECEIPT_LINKS_MUST_BE_ARRAY');
    reviewedSupersessionLinks = receiptCorpus.links;
  }
  const corpus = buildTaskTriageCorpusV1({ taskCardCorpus, reportManifestCorpus, workspaceHead: head, reviewedSupersessionLinks });
  const serialized = `${JSON.stringify(corpus)}\n`;
  const reportBytes = Buffer.byteLength(serialized);
  if (reportBytes >= reportLimitBytes) {
    const outputPath = repoPath(args.output ?? relative(root, defaultOutput));
    if (args.checkOnly) {
      process.stdout.write(`${JSON.stringify({
        status: 'TRIAGE_SHARDING_REQUIRED',
        taskCount: corpus.summary.taskCount,
        reportBytes,
        shardTargetBytes: 2_000_000,
        writesPerformed: false,
        outputArtifactWritten: false,
      }, null, 2)}\n`);
      return;
    }
    if (getHead() !== head) throw new Error('WORKSPACE_HEAD_CHANGED_DURING_TRIAGE_BUILD');
    verifyTaskFileHashes(taskCardCorpus.source?.taskFileHashes);
    const shardResult = writeTaskTriageShardsV1(corpus, outputPath);
    if (getHead() !== head) throw new Error('WORKSPACE_HEAD_CHANGED_DURING_TRIAGE_READBACK');
    verifyTaskFileHashes(taskCardCorpus.source?.taskFileHashes);
    process.stdout.write(`${JSON.stringify({
      status: 'TRIAGE_CORPUS_SHARDS_READBACK_PROVEN',
      taskCount: corpus.summary.taskCount,
      reportBytes,
      shardCount: shardResult.shardCount,
      manifestBytes: shardResult.manifestBytes,
      checksum: shardResult.checksum,
      rowsChecksum: shardResult.rowsChecksum,
      writesPerformed: false,
      outputArtifactWritten: true,
      outputPath: args.output ?? relative(root, defaultOutput),
    }, null, 2)}\n`);
    return;
  }
  if (!args.checkOnly) {
    const output = repoPath(args.output ?? relative(root, defaultOutput));
    mkdirSync(dirname(output), { recursive: true });
    if (getHead() !== head) throw new Error('WORKSPACE_HEAD_CHANGED_DURING_TRIAGE_BUILD');
    writeFileSync(output, serialized, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({
    status: args.checkOnly ? 'CHECK_ONLY' : 'TRIAGE_CORPUS_WRITTEN',
    taskCount: corpus.summary.taskCount,
    reportArtifactCount: corpus.summary.reportArtifactCount,
    supersessionReviewCandidateCount: corpus.summary.supersessionReviewCandidateCount,
    confirmedSupersededCount: corpus.summary.confirmedSupersededCount,
    supersessionReceiptChecksum: corpus.retrievalPolicy.supersessionReceiptChecksum,
    archiveEligibleCount: corpus.summary.archiveEligibleCount,
    outputBytes: reportBytes,
    writesPerformed: false,
    outputArtifactWritten: !args.checkOnly,
    outputPath: args.checkOnly ? null : args.output ?? relative(root, defaultOutput),
  }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
