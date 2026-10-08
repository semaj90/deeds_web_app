#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildPortfolioCensus } from './audit-openspec-evidence-fabric-v1.mjs';
import { buildCompactTaskCardSummaryV1, buildOpenSpecTaskCardReportV1, verifyCompactTaskCardSummaryV1, writeTaskCardShardsV1 } from './lib/openspec-task-card-v1.mjs';

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
  const parsed = { checkOnly: false, compactSummary: false };
  for (const arg of args) {
    if (arg === '--check-only') {
      parsed.checkOnly = true;
      continue;
    }
    if (arg === '--compact-summary') {
      parsed.compactSummary = true;
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
  if (args.compactSummary) {
    if (!args.output) throw new Error('COMPACT_SUMMARY_OUTPUT_REQUIRED');
    const outputPath = safeRepoPath(args.output);
    const outputRelativePath = relative(root, outputPath).replaceAll('\\', '/');
    if (!outputRelativePath.startsWith('.tmp/')) throw new Error('COMPACT_SUMMARY_OUTPUT_MUST_BE_UNDER_TMP');
    if (args.checkOnly) throw new Error('COMPACT_SUMMARY_REQUIRES_WRITE_FOR_READBACK');
    if (getHead() !== headAtStart) throw new Error('WORKSPACE_HEAD_CHANGED_DURING_CARD_BUILD');
    verifyTaskFileHashes(workboard.sourceFileHashes);
    const compactSummary = buildCompactTaskCardSummaryV1(report);
    const serializedSummary = `${JSON.stringify(compactSummary)}\n`;
    const summaryBytes = Buffer.byteLength(serializedSummary);
    if (summaryBytes >= reportLimitBytes) throw new Error(`COMPACT_TASK_CARD_SUMMARY_OVER_LIMIT:${summaryBytes}`);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serializedSummary, { encoding: 'utf8', flag: 'wx' });
    const readback = JSON.parse(readFileSync(outputPath, 'utf8'));
    if (!verifyCompactTaskCardSummaryV1(readback) || readback.checksum !== compactSummary.checksum) {
      throw new Error('COMPACT_TASK_CARD_SUMMARY_READBACK_MISMATCH');
    }
    if (getHead() !== headAtStart) throw new Error('WORKSPACE_HEAD_CHANGED_DURING_SUMMARY_READBACK');
    verifyTaskFileHashes(workboard.sourceFileHashes);
    process.stdout.write(`${JSON.stringify({
      status: 'COMPACT_SUMMARY_READBACK_PROVEN',
      workspaceHead: readback.source.workspaceHead,
      workspaceRevision: readback.source.workspaceRevision,
      sourcePopulationChecksum: readback.source.sourcePopulationChecksum,
      summary: readback.summary,
      checksum: readback.checksum,
      bytes: summaryBytes,
      readbackChecksumMatched: true,
      outputArtifactWritten: true,
      outputPath: outputRelativePath,
    }, null, 2)}\n`);
    return;
  }
  const serialized = `${JSON.stringify(report)}\n`;
  const outputBytes = Buffer.byteLength(serialized);
  if (outputBytes >= reportLimitBytes) {
    const outputPath = safeRepoPath(args.output ?? relative(root, defaultOutput));
    if (args.checkOnly) {
      process.stdout.write(`${JSON.stringify({
        status: 'SHARDING_REQUIRED', taskCount: report.summary.taskCount, reportBytes: outputBytes,
        shardTargetBytes: 2_000_000, writesPerformed: false, outputArtifactWritten: false,
      }, null, 2)}\n`);
      return;
    }
    if (getHead() !== headAtStart) throw new Error('WORKSPACE_HEAD_CHANGED_DURING_CARD_BUILD');
    verifyTaskFileHashes(workboard.sourceFileHashes);
    const shardResult = writeTaskCardShardsV1(report, outputPath);
    if (getHead() !== headAtStart) throw new Error('WORKSPACE_HEAD_CHANGED_DURING_SHARD_READBACK');
    verifyTaskFileHashes(workboard.sourceFileHashes);
    const outputRelativePath = relative(root, outputPath).replaceAll('\\', '/');
    process.stdout.write(`${JSON.stringify({
      status: 'TASK_CARD_SHARDS_READBACK_PROVEN', taskCount: report.summary.taskCount,
      taskFileCount: sourceTaskFileCount, reportBytes: outputBytes, shardCount: shardResult.shardCount,
      manifestBytes: shardResult.bytes, checksum: shardResult.checksum,
      retrievalStateCounts: report.summary.retrievalStateCounts, evidenceStateCounts: report.summary.evidenceStateCounts,
      writesPerformed: false, outputArtifactWritten: true, outputPath: outputRelativePath,
    }, null, 2)}\n`);
    return;
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
