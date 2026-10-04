#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { computeOpenSpecWorkspaceRevisionV1, verifyEvidenceReceiptV1 } from './audit-openspec-evidence-fabric-v1.mjs';
import { buildReportArtifactManifestV1, buildReportManifestCorpusV1, joinCurrentReceiptOutputsToReportManifestV1 } from './lib/openspec-report-manifest-v1.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const previousManifestPath = resolve(root, 'docs/reports/openspec-evidence-disposition-v1.json');
const defaultOutput = resolve(root, 'docs/reports/openspec-report-artifact-manifests-v1.json');
const defaultTaskCards = resolve(root, 'docs/reports/openspec-task-cards-v1.json');
const smallHashLimit = 10_000_000;
const excludedNames = new Set([
  'openspec-report-artifact-manifests-v1.json',
  'openspec-report-artifact-manifests-v1.check.json',
]);
const excludedPaths = new Set([
  'docs/reports/openspec-evidence-disposition-v1.json',
  'docs/reports/openspec-evidence-disposition-20261003.md',
  'docs/reports/openspec-evidence/README.md',
]);

function getHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function parseArgs(args) {
  const parsed = { checkOnly: false };
  for (const arg of args) {
    if (arg === '--check-only') parsed.checkOnly = true;
    else if (arg.startsWith('--task-cards=')) parsed.taskCards = arg.slice('--task-cards='.length);
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

function verifyTaskCardCorpus(taskCardCorpus, expectedHead) {
  if (taskCardCorpus?.schema !== 'atlas.openspec-task-card-corpus.v1') throw new Error('REPORT_MANIFEST_TASK_CARD_SCHEMA_UNSUPPORTED');
  if (taskCardCorpus.source?.workspaceHead !== expectedHead || !taskCardCorpus.source?.workspaceRevision) {
    throw new Error('REPORT_MANIFEST_TASK_CARD_HEAD_OR_REVISION_MISMATCH');
  }
  if (computeOpenSpecWorkspaceRevisionV1(root) !== taskCardCorpus.source.workspaceRevision) {
    throw new Error('REPORT_MANIFEST_TASK_CARD_WORKSPACE_REVISION_MISMATCH');
  }
  const taskFileHashes = taskCardCorpus.source?.taskFileHashes ?? {};
  if (Object.keys(taskFileHashes).length === 0) throw new Error('REPORT_MANIFEST_TASK_SOURCE_HASHES_MISSING');
  for (const [path, expectedHash] of Object.entries(taskFileHashes)) {
    const source = repoPath(path);
    if (!existsSync(source) || !statSync(source).isFile()) throw new Error(`REPORT_MANIFEST_TASK_SOURCE_MISSING:${path}`);
    const actualHash = `sha256:${createHash('sha256').update(readFileSync(source, 'utf8')).digest('hex')}`;
    if (actualHash !== expectedHash) throw new Error(`REPORT_MANIFEST_TASK_SOURCE_REVISION_MISMATCH:${path}`);
  }
}

function enumerateReportPaths() {
  const reportsRoot = resolve(root, 'docs/reports');
  const paths = new Set();
  const visitEvidence = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) visitEvidence(absolute);
      else if (entry.isFile() && !excludedNames.has(entry.name)) {
        const path = relative(root, absolute).split(sep).join('/');
        if (!excludedPaths.has(path)) paths.add(path);
      }
    }
  };
  const evidenceRoot = resolve(reportsRoot, 'openspec-evidence');
  visitEvidence(evidenceRoot);
  if (existsSync(reportsRoot)) {
    for (const entry of readdirSync(reportsRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !/^openspec-/i.test(entry.name) || excludedNames.has(entry.name)) continue;
      const relativePath = `docs/reports/${entry.name}`;
      if (!excludedPaths.has(relativePath) && /\.(?:json|jsonl|ndjson|md|ya?ml)$/i.test(entry.name)) paths.add(relativePath);
    }
  }
  return [...paths].sort();
}

async function hashFile(path) {
  const digest = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(repoPath(path))) {
    digest.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: `sha256:${digest.digest('hex')}`, bytes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const headAtStart = getHead();
  const taskCardCorpus = JSON.parse(readFileSync(repoPath(args.taskCards ?? relative(root, defaultTaskCards)), 'utf8'));
  verifyTaskCardCorpus(taskCardCorpus, headAtStart);
  const previousAudit = existsSync(previousManifestPath) ? JSON.parse(readFileSync(previousManifestPath, 'utf8')) : null;
  const previousByPath = new Map((previousAudit?.files ?? []).map((item) => [item.path, item]));
  const manifests = [];
  const sourceStats = new Map();
  let metadataOnlyFiles = 0;
  let hashedBytes = 0;

  for (const path of enumerateReportPaths()) {
    const file = repoPath(path);
    const stat = statSync(file);
    if (!stat.isFile()) continue;
    const sizeBytes = stat.size;
    const modifiedAt = stat.mtime.toISOString();
    sourceStats.set(path, { sizeBytes, modifiedAt });
    const priorEntry = previousByPath.get(path);
    let sha256 = null;
    let checksumState = 'REVIEW_REQUIRED_UNHASHED';
    if (priorEntry?.sha256 && priorEntry.bytes === sizeBytes && priorEntry.modifiedAt === modifiedAt) {
      sha256 = priorEntry.sha256;
      checksumState = 'CACHED_PRIOR_AUDIT_STAT_MATCH';
      metadataOnlyFiles += 1;
    } else if (sizeBytes <= smallHashLimit) {
      const result = await hashFile(path);
      if (result.bytes !== sizeBytes) throw new Error(`FILE_CHANGED_DURING_HASH:${path}`);
      sha256 = result.sha256;
      checksumState = 'FRESH_SHA256';
      hashedBytes += result.bytes;
    } else {
      metadataOnlyFiles += 1;
    }
    manifests.push(buildReportArtifactManifestV1({ path, sizeBytes, modifiedAt, priorEntry, sha256, checksumState }));
  }

  const artifactsByPath = new Map(manifests.map((artifact) => [artifact.artifactId, artifact]));
  const validatedReceiptsByUri = {};
  const freshOutputChecksumsByPath = {};
  for (const card of taskCardCorpus.cards ?? []) {
    for (const receiptOutput of card.receiptOutputRefs ?? []) {
      if (receiptOutput.receiptUri && !Object.hasOwn(validatedReceiptsByUri, receiptOutput.receiptUri)) {
        try {
          const receiptPath = repoPath(receiptOutput.receiptUri);
          const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
          validatedReceiptsByUri[receiptOutput.receiptUri] = verifyEvidenceReceiptV1(receipt);
        } catch {
          validatedReceiptsByUri[receiptOutput.receiptUri] = null;
        }
      }
      if (!validatedReceiptsByUri[receiptOutput.receiptUri]) continue;
      const artifactPath = String(receiptOutput.artifactId ?? '').replaceAll('\\', '/');
      const artifact = artifactsByPath.get(artifactPath);
      if (!artifact || artifact.sizeBytes >= smallHashLimit) continue;
      if (freshOutputChecksumsByPath[artifactPath]) continue;
      if (artifact.checksumState !== 'FRESH_SHA256') {
        const priorSize = artifact.sizeBytes;
        const result = await hashFile(artifactPath);
        if (result.bytes !== priorSize) throw new Error(`FILE_CHANGED_DURING_RECEIPT_OUTPUT_HASH:${artifactPath}`);
        artifact.sha256 = result.sha256;
        artifact.checksumState = 'FRESH_SHA256';
        metadataOnlyFiles -= 1;
        hashedBytes += result.bytes;
      }
      freshOutputChecksumsByPath[artifactPath] = artifact.sha256;
    }
  }

  for (const [path, initial] of sourceStats) {
    const current = statSync(repoPath(path));
    if (current.size !== initial.sizeBytes || current.mtime.toISOString() !== initial.modifiedAt) {
      throw new Error(`REPORT_INVENTORY_CHANGED_DURING_BUILD:${path}`);
    }
  }

  const corpus = buildReportManifestCorpusV1({
    workspaceHead: headAtStart,
    workspaceRevision: taskCardCorpus.source.workspaceRevision,
    previousAudit,
    manifests,
    metadataOnlyFiles,
    hashedBytes,
  });
  const joinedCorpus = joinCurrentReceiptOutputsToReportManifestV1({
    taskCardCorpus,
    reportManifestCorpus: corpus,
    validatedReceiptsByUri,
    freshOutputChecksumsByPath,
  });
  const serialized = `${JSON.stringify(joinedCorpus)}\n`;
  const outputBytes = Buffer.byteLength(serialized);
  if (outputBytes >= smallHashLimit) throw new Error(`REPORT_MANIFEST_OVER_LIMIT:${outputBytes}`);

  if (!args.checkOnly) {
    const output = repoPath(args.output ?? relative(root, defaultOutput));
    mkdirSync(dirname(output), { recursive: true });
    const beforeWrite = getHead();
    if (beforeWrite !== joinedCorpus.workspaceHead) throw new Error('WORKSPACE_HEAD_CHANGED_DURING_MANIFEST_BUILD');
    writeFileSync(output, serialized, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({
    status: args.checkOnly ? 'CHECK_ONLY' : 'REPORT_MANIFESTS_WRITTEN',
    artifactCount: joinedCorpus.summary.artifactCount,
    reportBytes: outputBytes,
    cachedChecksumCount: joinedCorpus.summary.cachedChecksumCount,
    freshChecksumCount: joinedCorpus.summary.freshChecksumCount,
    checksumReviewRequiredCount: joinedCorpus.summary.checksumReviewRequiredCount,
    metadataOnlyFiles: joinedCorpus.summary.metadataOnlyFiles,
    freshlyHashedBytes: joinedCorpus.summary.freshlyHashedBytes,
    associatedTaskCount: joinedCorpus.summary.associatedTaskCount,
    receiptOutputCandidateCount: joinedCorpus.summary.receiptOutputCandidateCount,
    rejectedCurrentReceiptCount: joinedCorpus.summary.rejectedCurrentReceiptCount,
    rejectedReceiptOutputCount: joinedCorpus.summary.rejectedReceiptOutputCount,
    coldCandidateCount: joinedCorpus.summary.coldCandidateCount,
    archiveWrites: false,
    outputArtifactWritten: !args.checkOnly,
    outputPath: args.checkOnly ? null : args.output ?? relative(root, defaultOutput),
  }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
