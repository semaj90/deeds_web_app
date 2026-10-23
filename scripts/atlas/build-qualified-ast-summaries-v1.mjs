#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './connection-config.mjs';
import { buildQualifiedAstSummariesV1, canonicalAstSummaryJsonV1 } from './lib/qualified-ast-summaries-v1.mjs';

const root = path.resolve(REPO_ROOT);
const arg = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const runId = arg('--run-id') ?? '';
if (!/^ast-summaries-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const sourceReceiptPath = path.resolve(root, arg('--ast-receipt') ?? '.tmp/atlas/admitted-snapshot-ast-prefill-20261016/cohort-8.jsonl.receipt.json');
if (!sourceReceiptPath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readJson = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'));
const inside = (parent, target) => target.startsWith(`${parent}${path.sep}`);
const receipt = readJson(sourceReceiptPath);
if (receipt.schema !== 'atlas.ast-entity-prefill-graphify-receipt.v2') throw new Error('AST_RECEIPT_SCHEMA_INVALID');
if (receipt.receiptSha256) {
  const body = { ...receipt };
  delete body.receiptSha256;
  if (sha256(Buffer.from(canonicalAstSummaryJsonV1(body))) !== receipt.receiptSha256) throw new Error('AST_RECEIPT_CHECKSUM_INVALID');
}
if (receipt.canonicalAuthority !== false || receipt.canonical_writes !== false || receipt.datastoreWrites !== false
  || receipt.projectionWrites !== false || receipt.sourceBindingMode !== true
  || receipt.sourceReadMode !== 'MATERIALIZED_ADMITTED_SNAPSHOT' || receipt.files_unresolved !== 0
  || receipt.files_revision_mismatch !== 0 || receipt.files_revision_unqualified !== 0
  || receipt.symbol_registry_resolved !== 0 || receipt.canonical_entity_resolved !== 0) {
  throw new Error('AST_RECEIPT_NOT_SOURCE_ONLY_AND_REVISION_QUALIFIED');
}

const observationPath = path.resolve(root, receipt.output);
if (!inside(root, observationPath)) throw new Error('AST_OUTPUT_OUTSIDE_REPOSITORY');
const observationBytes = readFileSync(observationPath);
if (sha256(observationBytes) !== String(receipt.outputChecksum).replace(/^sha256:/, '')) throw new Error('AST_OUTPUT_CHECKSUM_INVALID');
const observations = observationBytes.toString('utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
if (observations.length !== receipt.outputRowCount || observations.length !== receipt.entity_candidates || observations.length === 0) {
  throw new Error('AST_OUTPUT_ROW_COUNT_MISMATCH');
}

const snapshotRevision = String(receipt.sourceReadSnapshotRevision).replace(/^sha256:/, '');
if (!/^[a-f0-9]{64}$/.test(snapshotRevision)) throw new Error('AST_SNAPSHOT_REVISION_INVALID');
const snapshotRoot = path.resolve(root, '.tmp', 'workspace-source-snapshots', snapshotRevision);
const sourceEvidence = new Map();
const decoder = new TextDecoder('utf-8', { fatal: true });
for (const row of observations) {
  if (typeof row.source_ref !== 'string' || path.posix.isAbsolute(row.source_ref)
    || row.source_ref.split(/[\\/]/).some((part) => part === '..' || part === '')) throw new Error('AST_SOURCE_REF_INVALID');
  const currentPath = path.resolve(root, row.source_ref);
  const resolvedPath = path.resolve(root, row.resolved_path ?? '');
  if (!inside(root, currentPath) || !inside(snapshotRoot, resolvedPath)) throw new Error('AST_SOURCE_PATH_OUTSIDE_BOUND_ROOT');
  const currentBytes = readFileSync(currentPath);
  const snapshotBytes = readFileSync(resolvedPath);
  const digest = sha256(currentBytes);
  const rowRevision = String(row.source_revision ?? '').replace(/^sha256:/, '');
  if (!/^[a-f0-9]{64}$/.test(rowRevision) || digest !== rowRevision || sha256(snapshotBytes) !== rowRevision
    || row.workspace_revision !== receipt.workspaceRevision) throw new Error('AST_SOURCE_REVISION_MISMATCH');
  if (!Number.isInteger(row.start_byte) || !Number.isInteger(row.end_byte)
    || row.start_byte < 0 || row.end_byte <= row.start_byte || row.end_byte > currentBytes.length) throw new Error('AST_SOURCE_SPAN_INVALID');
  try { decoder.decode(currentBytes.subarray(row.start_byte, row.end_byte)); }
  catch { throw new Error('AST_SOURCE_SPAN_UTF8_INVALID'); }
  const existing = sourceEvidence.get(row.source_ref);
  if (existing && (existing.sourceRevision !== row.source_revision || existing.workspaceRevision !== row.workspace_revision)) {
    throw new Error('AST_SOURCE_REVISION_CONFLICT');
  }
  sourceEvidence.set(row.source_ref, {
    sourceRef: row.source_ref,
    sourceRevision: row.source_revision,
    workspaceRevision: row.workspace_revision,
    bytes: currentBytes,
  });
}
if (sourceEvidence.size !== receipt.sourceBindingCount || sourceEvidence.size !== receipt.files_revision_qualified) {
  throw new Error('AST_SOURCE_BINDING_COUNT_MISMATCH');
}

const summaries = buildQualifiedAstSummariesV1({ observations, sourceEvidence,
  sourceSnapshotRevision: receipt.sourceReadSnapshotRevision, parserRevision: receipt.parserRevision });
const parent = path.resolve(root, '.tmp/atlas/directory-intelligence/ast-summaries');
mkdirSync(parent, { recursive: true });
const outputDirectory = path.join(parent, runId);
mkdirSync(outputDirectory);
const writeExclusive = (name, value) => {
  const bytes = Buffer.from(value);
  const filePath = path.join(outputDirectory, name);
  writeFileSync(filePath, bytes, { flag: 'wx' });
  return { path: path.relative(root, filePath).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha256(bytes) };
};
const fileRows = Buffer.from(summaries.fileSummaries.map((row) => JSON.stringify(row)).join('\n') + '\n');
const directoryRows = Buffer.from(summaries.directorySummaries.map((row) => JSON.stringify(row)).join('\n') + '\n');
const fileArtifact = writeExclusive('file-summaries.jsonl', fileRows);
const directoryArtifact = writeExclusive('directory-summaries.jsonl', directoryRows);
const manifestBody = {
  schema: 'atlas.qualified-ast-summary-manifest.v1',
  runId,
  status: 'DERIVED_ADVISORY_SOURCE_ONLY_SUMMARIES',
  canonicalAuthority: false,
  writesPerformed: false,
  sourceReceiptPath: path.relative(root, sourceReceiptPath).replaceAll('\\', '/'),
  sourceReceiptSha256: sha256(Buffer.from(canonicalAstSummaryJsonV1(receipt))),
  sourceOutputSha256: sha256(observationBytes),
  sourceRowCount: observations.length,
  sourceFileCount: sourceEvidence.size,
  workspaceRevision: receipt.workspaceRevision,
  sourceSnapshotRevision: receipt.sourceReadSnapshotRevision,
  parserRevision: receipt.parserRevision,
  canonicalSymbolResolutionCount: 0,
  fileSummaryCount: summaries.fileSummaries.length,
  directorySummaryCount: summaries.directorySummaries.length,
  artifacts: { fileSummaries: fileArtifact, directorySummaries: directoryArtifact },
  sourceAuthority: 'MATERIALIZED_ADMITTED_SNAPSHOT_BYTES_MATCH_CURRENT_SOURCE',
  summaryScope: 'AST_OBSERVATION_NAMES_KINDS_AND_EXACT_SPANS; NO_CANONICAL_SYMBOL_OR_RUNTIME_CLAIMS',
};
const manifest = { ...manifestBody, receiptSha256: sha256(Buffer.from(canonicalAstSummaryJsonV1(manifestBody))) };
writeExclusive('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
const stats = statfsSync(outputDirectory);
console.log(JSON.stringify({ runId, fileSummaryCount: manifest.fileSummaryCount,
  directorySummaryCount: manifest.directorySummaryCount, bytesWritten: fileArtifact.bytes + directoryArtifact.bytes,
  freeBytesAfterRun: stats.bavail * stats.bsize, manifestChecksum: manifest.receiptSha256,
  outputDirectory: path.relative(root, outputDirectory).replaceAll('\\', '/') }));
