#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statfsSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tableFromIPC } from 'apache-arrow';
import { buildEmbeddingSourceClassCoverageV1, SOURCE_CLASS_COVERAGE_V1_CLASSES } from './lib/embedding-source-class-coverage-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const runId = arg('--run-id') ?? '';
if (!/^embedding-class-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const coverageManifestPath = path.resolve(root, arg('--coverage-manifest') ?? '');
const sourceClassReceiptPath = path.resolve(root, arg('--source-class-receipt') ?? '');
for (const filePath of [coverageManifestPath, sourceClassReceiptPath]) {
  if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_PATH_OUTSIDE_REPOSITORY');
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const hashFile = filePath => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  stream.on('data', chunk => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});
const readJson = filePath => JSON.parse(readFileSync(filePath, 'utf8'));
const resolveInside = (relativePath, label) => {
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error(`${label}_OUTSIDE_REPOSITORY`);
  return absolute;
};
const verifyReceipt = (value, field, schema) => {
  const body = { ...value };
  delete body[field];
  if (value.schema !== schema || sha256(Buffer.from(canonical(body))) !== value[field]) {
    throw new Error(`INPUT_RECEIPT_INVALID:${schema}`);
  }
};
const rowsFromArrow = table => Array.from({ length: table.numRows }, (_, index) => Object.fromEntries(
  table.schema.fields.map(field => [field.name, table.getChild(field.name).get(index)])));

const coverageManifestBytes = readFileSync(coverageManifestPath);
const coverageManifest = JSON.parse(coverageManifestBytes.toString('utf8'));
verifyReceipt(coverageManifest, 'receiptSha256', 'atlas.directory-embedding-coverage.v1');
if (coverageManifest.canonicalAuthority !== false || coverageManifest.sourceQualified !== false
  || coverageManifest.productionAdmission !== false || coverageManifest.persistentWritesPerformed !== false) {
  throw new Error('EMBEDDING_COVERAGE_AUTHORITY_FLAGS_INVALID');
}
const coverageArtifact = coverageManifest.artifacts?.['embedding-path-coverage.arrow'];
if (!coverageArtifact) throw new Error('EMBEDDING_PATH_ARTIFACT_MISSING');
const coverageArtifactPath = resolveInside(coverageArtifact.path, 'EMBEDDING_PATH_ARTIFACT');
const coverageArtifactBytes = readFileSync(coverageArtifactPath);
if (coverageArtifactBytes.length !== coverageArtifact.bytes || sha256(coverageArtifactBytes) !== coverageArtifact.sha256) {
  throw new Error('EMBEDDING_PATH_ARTIFACT_CHECKSUM_INVALID');
}
const databasePathRows = rowsFromArrow(tableFromIPC(coverageArtifactBytes));
if (databasePathRows.length !== coverageManifest.databaseSnapshot?.totals?.distinct_paths) {
  throw new Error('EMBEDDING_PATH_ROW_COUNT_INVALID');
}

const sourceClassReceiptBytes = readFileSync(sourceClassReceiptPath);
const sourceClassReceipt = JSON.parse(sourceClassReceiptBytes.toString('utf8'));
if (sourceClassReceipt.schema !== 'atlas.source-class-split.receipt.v1'
  || sourceClassReceipt.canonicalAuthority !== false || sourceClassReceipt.writesPerformed !== false
  || sourceClassReceipt.sourceAdmission !== 'NOT_ADMITTED_NO_WORKSPACE_REVISION') {
  throw new Error('SOURCE_CLASS_RECEIPT_INVALID');
}
if (sourceClassReceipt.inputs.snapshotManifestPath !== coverageManifest.pathSnapshot?.manifestPath) {
  throw new Error('SOURCE_CLASS_PATH_SNAPSHOT_MISMATCH');
}
const snapshotManifestPath = resolveInside(coverageManifest.pathSnapshot.manifestPath, 'PATH_SNAPSHOT_MANIFEST');
const snapshotManifestBytes = readFileSync(snapshotManifestPath);
const snapshotManifest = JSON.parse(snapshotManifestBytes.toString('utf8'));
verifyReceipt(snapshotManifest, 'receiptSha256', 'atlas.directory-intelligence-path-snapshot.v1');
if (sha256(snapshotManifestBytes) !== sourceClassReceipt.inputs.snapshotManifestSha256
  || snapshotManifest.receiptSha256 !== coverageManifest.pathSnapshot.receiptSha256
  || snapshotManifest.artifactSha256 !== coverageManifest.pathSnapshot.artifactSha256) {
  throw new Error('SOURCE_CLASS_SNAPSHOT_BINDING_INVALID');
}

const classifiedRowsPath = resolveInside(sourceClassReceipt.outputs?.classifiedRows?.path, 'SOURCE_CLASS_ROWS');
const aggregatesPath = resolveInside(sourceClassReceipt.outputs?.aggregates?.path, 'SOURCE_CLASS_AGGREGATES');
if (await hashFile(classifiedRowsPath) !== sourceClassReceipt.outputs.classifiedRows.sha256) {
  throw new Error('SOURCE_CLASS_ROWS_CHECKSUM_INVALID');
}
const aggregates = readJson(aggregatesPath);
if (sha256(readFileSync(aggregatesPath)) !== sourceClassReceipt.outputs.aggregates.sha256
  || aggregates.schema !== 'atlas.source-class-split.aggregates.v1') {
  throw new Error('SOURCE_CLASS_AGGREGATES_CHECKSUM_INVALID');
}

const databasePathSet = new Set(databasePathRows.map(row => row.relativePath));
if (databasePathSet.size !== databasePathRows.length) throw new Error('EMBEDDING_DATABASE_PATH_DUPLICATE');
const physicalClassCounts = new Map(SOURCE_CLASS_COVERAGE_V1_CLASSES.map(sourceClass => [sourceClass, { files: 0, bytes: 0 }]));
const sourceClassByPath = new Map();
const ambiguousSourcePaths = new Set();
let classifiedRowCount = 0;
let expectedOrdinal = 0;
let classBytes = 0;
let classFiles = 0;
for await (const line of createInterface({ input: createReadStream(classifiedRowsPath), crlfDelay: Infinity })) {
  if (!line) continue;
  const row = JSON.parse(line);
  if (row.o !== expectedOrdinal++) throw new Error('SOURCE_CLASS_ROW_ORDINAL_MISMATCH');
  classifiedRowCount += 1;
  if (row.k !== 'F') continue;
  if (!physicalClassCounts.has(row.c) || !Number.isSafeInteger(row.b) || row.b < 0 || typeof row.p !== 'string') {
    throw new Error('SOURCE_CLASS_FILE_ROW_INVALID');
  }
  const classTotal = physicalClassCounts.get(row.c);
  classTotal.files += 1;
  classTotal.bytes += row.b;
  classFiles += 1;
  classBytes += row.b;
  if (!databasePathSet.has(row.p)) continue;
  if (ambiguousSourcePaths.has(row.p)) continue;
  if (sourceClassByPath.has(row.p)) {
    sourceClassByPath.delete(row.p);
    ambiguousSourcePaths.add(row.p);
  } else {
    sourceClassByPath.set(row.p, row.c);
  }
}
if (classifiedRowCount !== sourceClassReceipt.outputs.classifiedRows.rows
  || classifiedRowCount !== aggregates.rows || classFiles !== aggregates.reconciliation?.classFiles
  || classBytes !== aggregates.reconciliation?.classBytes) throw new Error('SOURCE_CLASS_ROWS_TOTAL_MISMATCH');
for (const sourceClass of SOURCE_CLASS_COVERAGE_V1_CLASSES) {
  const observed = physicalClassCounts.get(sourceClass);
  const expected = aggregates.classCounts?.[sourceClass];
  if (!expected || observed.files !== expected.files || observed.bytes !== expected.bytes) {
    throw new Error(`SOURCE_CLASS_AGGREGATE_MISMATCH:${sourceClass}`);
  }
}

const report = buildEmbeddingSourceClassCoverageV1({
  physicalClassTotals: [...physicalClassCounts.entries()].map(([sourceClass, value]) => ({ sourceClass, ...value })),
  databasePathRows,
  sourceClassByPath,
  ambiguousSourcePaths,
  sourceClassInput: {
    receiptPath: path.relative(root, sourceClassReceiptPath).replaceAll(path.sep, '/'),
    receiptFileSha256: sha256(sourceClassReceiptBytes),
    classifiedRowsPath: path.relative(root, classifiedRowsPath).replaceAll(path.sep, '/'),
    classifiedRowsSha256: sourceClassReceipt.outputs.classifiedRows.sha256,
    aggregateSha256: sourceClassReceipt.outputs.aggregates.sha256,
    frozenPathSnapshotSha256: snapshotManifest.receiptSha256,
    historicalInventoryChecksumReproducedFlag: sourceClassReceipt.inputs.inventoryChecksumReproduced,
  },
});
const databaseTotals = coverageManifest.databaseSnapshot.totals;
const expectedMetricTotals = {
  chunkCount: databaseTotals.chunk_rows - databaseTotals.chunks_missing_path,
  contentEmbeddingChunkCount: databaseTotals.content_embedding_chunks_with_path,
  embedding768ChunkCount: databaseTotals.embedding_768_chunks_with_path,
  sourceRevisionChunkCount: databaseTotals.source_revision_chunks,
  workspaceRevisionChunkCount: databaseTotals.workspace_revision_chunks,
  exactProvenContentEmbeddingChunks: databaseTotals.exact_proven_content_embedding_chunks,
  exactProvenEmbedding768Chunks: databaseTotals.exact_proven_embedding_768_chunks,
  provenLineageIdentityEmbedding768Chunks: databaseTotals.proven_lineage_identity_embedding_768_chunks,
  lineageSourceRefMatchEmbedding768Chunks: databaseTotals.lineage_source_ref_match_embedding_768_chunks,
  uniqueBindingSnapshotEmbedding768Chunks: databaseTotals.unique_binding_snapshot_embedding_768_chunks,
  multipleWorkspaceBindingEmbedding768Chunks: databaseTotals.multiple_workspace_binding_embedding_768_chunks,
  missingBindingEmbedding768Chunks: databaseTotals.missing_binding_embedding_768_chunks,
  conflictingLineageEmbedding768Chunks: databaseTotals.conflicting_lineage_embedding_768_chunks,
};
for (const [field, expected] of Object.entries(expectedMetricTotals)) {
  if (report.databaseMetricTotals[field] !== expected) throw new Error(`DATABASE_METRIC_TOTAL_MISMATCH:${field}`);
}
report.embeddingCoverage = {
  manifestPath: path.relative(root, coverageManifestPath).replaceAll(path.sep, '/'),
  manifestFileSha256: sha256(coverageManifestBytes),
  receiptSha256: coverageManifest.receiptSha256,
  pathArtifactSha256: coverageArtifact.sha256,
  databaseSnapshotId: coverageManifest.databaseSnapshot.snapshotId,
  transactionReadOnly: coverageManifest.databaseSnapshot.transactionReadOnly,
  transactionStatus: coverageManifest.databaseSnapshot.transactionStatus,
  totals: coverageManifest.databaseSnapshot.totals,
};
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
const outputBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (statfsSync(root).bavail * statfsSync(root).bsize < outputBytes.length * 2) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
mkdirSync(outputDir, { recursive: false });
const reportPath = path.join(outputDir, 'source-class-embedding-coverage.json');
writeFileSync(reportPath, outputBytes, { flag: 'wx' });
const readback = JSON.parse(readFileSync(reportPath, 'utf8'));
readback.receiptSha256 = sha256(Buffer.from(canonical(Object.fromEntries(Object.entries(readback).filter(([key]) => key !== 'receiptSha256')))));
const readbackBody = { ...readback };
delete readbackBody.receiptSha256;
if (sha256(Buffer.from(canonical(readbackBody))) !== readback.receiptSha256) throw new Error('OUTPUT_READBACK_CHECKSUM_INVALID');
writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(readback, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  status: report.status,
  manifestPath: path.relative(root, path.join(outputDir, 'manifest.json')).replaceAll(path.sep, '/'),
  receiptSha256: readback.receiptSha256,
  matchedDatabasePathCount: report.matchedDatabasePathCount,
  unmatchedDatabasePathCount: report.unmatchedDatabasePathCount,
  ambiguousDatabasePathCount: report.ambiguousDatabasePathCount,
  exactProvenEmbedding768Chunks: report.databaseMetricTotals.exactProvenEmbedding768Chunks,
  sourceRevisionChunks: report.databaseMetricTotals.sourceRevisionChunkCount,
  workspaceRevisionChunks: report.databaseMetricTotals.workspaceRevisionChunkCount,
  sourceClassRows: classifiedRowCount,
  outputBytes: outputBytes.length,
}, null, 2));
