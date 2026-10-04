#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildPortfolioCensus } from './audit-openspec-evidence-fabric-v1.mjs';
import { buildOpenSpecTaskCardReportV1 } from './lib/openspec-task-card-v1.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportLimitBytes = 10_000_000;
const defaultOutput = resolve(root, 'docs/reports/openspec-task-cards-v1.json');

function hash(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function getHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`GIT_HEAD_UNAVAILABLE:${result.stderr.trim()}`);
  return result.stdout.trim();
}

function parseArgs(args) {
  const parsed = { checkOnly: false };
  for (const arg of args) {
    if (arg === '--check-only') {
      parsed.checkOnly = true;
      continue;
    }
    const match = /^--output=(.+)$/.exec(arg);
    if (!match) throw new Error(`Unexpected argument: ${arg}`);
    parsed.output = match[1];
  }
  return parsed;
}

function safeRepoPath(value) {
  const path = resolve(root, value);
  const rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`OUTPUT_PATH_OUTSIDE_REPOSITORY:${value}`);
  return path;
}

function readCompactWorkboard() {
  const builder = resolve(root, 'scripts/atlas/build-openspec-workboard-v1.mjs');
  const result = spawnSync(process.execPath, [builder, '--task-snapshot-stdout'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`WORKBOARD_SNAPSHOT_FAILED:${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

function verifyTaskFileHashes(sourceFileHashes) {
  const mismatches = [];
  const entries = Object.entries(sourceFileHashes ?? {});
  for (const [sourcePath, expectedHash] of entries) {
    const absolutePath = safeRepoPath(sourcePath);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      mismatches.push({ sourcePath, reason: 'MISSING' });
      continue;
    }
    const actualHash = hash(readFileSync(absolutePath, 'utf8'));
    if (actualHash !== expectedHash) mismatches.push({ sourcePath, reason: 'CHECKSUM_MISMATCH' });
  }
  if (entries.length === 0 || mismatches.length) {
    throw new Error(`TASK_FILE_SNAPSHOT_DRIFT:${JSON.stringify(mismatches.slice(0, 20))}`);
  }
  return entries.length;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const headAtStart = getHead();
  const workboard = readCompactWorkboard();
  if (workboard.schema !== 'atlas.openspec.workboard-task-snapshot.v1') throw new Error('WORKBOARD_SNAPSHOT_SCHEMA_UNSUPPORTED');
  const sourceTaskFileCount = verifyTaskFileHashes(workboard.sourceFileHashes);
  const evidenceCensus = buildPortfolioCensus(root);
  if (getHead() !== headAtStart) throw new Error('WORKSPACE_HEAD_CHANGED_DURING_CARD_BUILD');
  verifyTaskFileHashes(workboard.sourceFileHashes);
  const report = buildOpenSpecTaskCardReportV1({
    workboard,
    evidenceCensus,
    head: headAtStart,
    taskFileHashes: workboard.sourceFileHashes,
  });
  if (report.source.taskFileCount !== sourceTaskFileCount) throw new Error('TASK_FILE_COUNT_MISMATCH');
  const serialized = `${JSON.stringify(report)}\n`;
  const outputBytes = Buffer.byteLength(serialized);
  if (outputBytes >= reportLimitBytes) {
    const fieldSizes = Object.keys(report.cards[0] ?? {}).map((key) => ({
      key,
      bytes: Buffer.byteLength(JSON.stringify(report.cards.map((card) => card[key] ?? null))),
    })).sort((left, right) => right.bytes - left.bytes).slice(0, 12);
    throw new Error(`TASK_CARD_REPORT_OVER_LIMIT:${outputBytes}:${JSON.stringify(fieldSizes)}`);
  }

  if (!args.checkOnly) {
    const outputPath = safeRepoPath(args.output ?? relative(root, defaultOutput));
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({
    status: args.checkOnly ? 'CHECK_ONLY' : 'TASK_CARDS_WRITTEN',
    taskCount: report.summary.taskCount,
    taskFileCount: sourceTaskFileCount,
    reportBytes: outputBytes,
    retrievalStateCounts: report.summary.retrievalStateCounts,
    evidenceStateCounts: report.summary.evidenceStateCounts,
    checkedWithoutProof: report.summary.checkedWithoutProof,
    supersessionReviewCandidates: report.summary.supersessionReviewCandidates,
    reportManifestsJoined: report.summary.reportManifestsJoined,
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
