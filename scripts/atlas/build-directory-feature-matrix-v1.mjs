#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { assertDirectoryFeatureInputLineageV1, buildDirectoryFeatureMatrixV1 } from './lib/directory-feature-matrix-v1.mjs';

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const root = path.resolve(REPO_ROOT);
const resolveRepoPath = relativePath => {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY');
  return resolved;
};
const runId = arg('--run-id') ?? '';
if (!/^dir-features-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const packageManifestPath = path.resolve(root, arg('--package-manifest') ?? '');
const packageRowsPath = path.resolve(root, arg('--package-rows') ?? '');
const rollupManifestPath = path.resolve(root, arg('--rollup-manifest') ?? '');
const summaryManifestPath = arg('--summary-manifest') ? path.resolve(root, arg('--summary-manifest')) : null;
const domainManifestPath = arg('--domain-manifest') ? path.resolve(root, arg('--domain-manifest')) : null;
const runtimeOwnerManifestPath = arg('--runtime-owner-manifest') ? path.resolve(root, arg('--runtime-owner-manifest')) : null;
const sourceClassReceiptPath = arg('--source-class-receipt') ? path.resolve(root, arg('--source-class-receipt')) : null;
if (Boolean(summaryManifestPath) !== Boolean(domainManifestPath)) throw new Error('DOMAIN_FEATURE_INPUT_PAIR_REQUIRED');
for (const inputPath of [packageManifestPath, packageRowsPath, rollupManifestPath, summaryManifestPath, domainManifestPath, runtimeOwnerManifestPath, sourceClassReceiptPath].filter(Boolean)) {
  if (!inputPath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY');
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sha256Stream = filePath => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(filePath).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
});
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const readJson = filePath => JSON.parse(readFileSync(filePath, 'utf8'));
function verifyReceipt(value, expectedSchema) {
  const body = { ...value };
  delete body.receiptSha256;
  if (value.schema !== expectedSchema || sha256(Buffer.from(canonical(body))) !== value.receiptSha256) {
    throw new Error('INPUT_RECEIPT_INVALID');
  }
}

const packageManifest = readJson(packageManifestPath);
verifyReceipt(packageManifest, 'atlas.directory-intelligence-package-references.v1');
const packageRowsManifest = readJson(packageRowsPath);
verifyReceipt(packageRowsManifest, 'atlas.directory-package-candidates.v1');
const rollupManifest = readJson(rollupManifestPath);
verifyReceipt(rollupManifest, 'atlas.directory-intelligence-rollup.v1');
let summaryManifest = null;
let domainManifest = null;
let runtimeOwnerManifest = null;
let sourceClassManifest = null;
let summaryManifestSha256 = null;
if (summaryManifestPath && domainManifestPath) {
  const summaryManifestBytes = readFileSync(summaryManifestPath);
  summaryManifest = JSON.parse(summaryManifestBytes.toString('utf8'));
  verifyReceipt(summaryManifest, 'atlas.directory-metadata-summaries.v1');
  summaryManifestSha256 = sha256(summaryManifestBytes);
  domainManifest = readJson(domainManifestPath);
  const domainBody = { ...domainManifest };
  delete domainBody.manifestBodySha256;
  if (domainManifest.schema !== 'atlas.directory-domain-candidates-manifest.v1'
    || sha256(Buffer.from(JSON.stringify(domainBody))) !== domainManifest.manifestBodySha256) {
    throw new Error('DOMAIN_CANDIDATE_RECEIPT_INVALID');
  }
}
if (runtimeOwnerManifestPath) {
  runtimeOwnerManifest = readJson(runtimeOwnerManifestPath);
  verifyReceipt(runtimeOwnerManifest, 'atlas.runtime-owner-directory-candidates.v1');
}
if (sourceClassReceiptPath) sourceClassManifest = readJson(sourceClassReceiptPath);
assertDirectoryFeatureInputLineageV1({ packageManifest, packageRowsManifest, rollupManifest,
  summaryManifest, domainManifest, summaryManifestSha256, runtimeOwnerManifest, sourceClassManifest });
const packageArtifactPath = path.resolve(root, packageRowsManifest.artifactPath);
const directoryArtifactPath = path.resolve(root, rollupManifest.directoriesArtifactPath);
const summaryArtifactPath = summaryManifest ? path.resolve(root, summaryManifest.artifactPath) : null;
const domainArtifactPath = domainManifest ? path.resolve(root, domainManifest.artifactPath) : null;
const runtimeOwnerArtifactPath = runtimeOwnerManifestPath ? path.join(path.dirname(runtimeOwnerManifestPath), 'runtime-owner-candidates.arrow') : null;
for (const artifactPath of [packageArtifactPath, directoryArtifactPath, summaryArtifactPath, domainArtifactPath, runtimeOwnerArtifactPath].filter(Boolean)) {
  if (!artifactPath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_ARTIFACT_OUTSIDE_REPOSITORY');
}
const packageBytes = readFileSync(packageArtifactPath);
const directoryBytes = readFileSync(directoryArtifactPath);
if (sha256(packageBytes) !== packageRowsManifest.artifactSha256
  || sha256(directoryBytes) !== rollupManifest.directoriesArtifactSha256) throw new Error('INPUT_ARTIFACT_CHECKSUM_INVALID');

const packageTable = tableFromIPC(packageBytes);
const directoryTable = tableFromIPC(directoryBytes);
let domainCandidates = [];
let runtimeOwnerCandidates = [];
if (domainManifest && summaryManifest) {
  const summaryBytes = readFileSync(summaryArtifactPath);
  const domainBytes = readFileSync(domainArtifactPath);
  if (sha256(summaryBytes) !== summaryManifest.artifactSha256
    || sha256(domainBytes) !== domainManifest.artifactSha256) throw new Error('DOMAIN_FEATURE_ARTIFACT_CHECKSUM_INVALID');
  const summaryTable = tableFromIPC(summaryBytes);
  const domainTable = tableFromIPC(domainBytes);
  if (summaryTable.numRows !== summaryManifest.summaryCount || summaryTable.numRows !== rollupManifest.directories
    || domainTable.numRows !== domainManifest.candidateRowCount) throw new Error('DOMAIN_FEATURE_ROW_COUNT_INVALID');
  const summaryByPath = new Map();
  for (let index = 0; index < summaryTable.numRows; index += 1) {
    summaryByPath.set(summaryTable.getChild('relativePath').get(index), {
      summarySha256: summaryTable.getChild('summarySha256').get(index),
      inputDigest: summaryTable.getChild('inputDigest').get(index),
    });
  }
  const candidatePaths = new Set();
  for (let index = 0; index < domainTable.numRows; index += 1) {
    const relativePath = domainTable.getChild('relativePath').get(index);
    const summary = summaryByPath.get(relativePath);
    if (!summary || summary.summarySha256 !== domainTable.getChild('summarySha256').get(index)
      || summary.inputDigest !== domainTable.getChild('inputDigest').get(index)) {
      throw new Error('DOMAIN_CANDIDATE_SUMMARY_BINDING_MISMATCH');
    }
    candidatePaths.add(relativePath);
    domainCandidates.push({
      relativePath,
      candidateGroupId: domainTable.getChild('candidateGroupId').get(index),
      score: domainTable.getChild('score').get(index),
      status: domainTable.getChild('status').get(index),
    });
  }
  if (candidatePaths.size !== summaryByPath.size) throw new Error('DOMAIN_CANDIDATE_DIRECTORY_COVERAGE_MISMATCH');
}
if (runtimeOwnerManifest) {
  const runtimeBytes = readFileSync(runtimeOwnerArtifactPath);
  if (sha256(runtimeBytes) !== runtimeOwnerManifest.artifacts?.['runtime-owner-candidates.arrow']?.sha256) {
    throw new Error('RUNTIME_OWNER_FEATURE_ARTIFACT_CHECKSUM_INVALID');
  }
  const runtimeTable = tableFromIPC(runtimeBytes);
  if (runtimeTable.numRows !== runtimeOwnerManifest.ownerCandidates) throw new Error('RUNTIME_OWNER_FEATURE_ROW_COUNT_INVALID');
  runtimeOwnerCandidates = Array.from({ length: runtimeTable.numRows }, (_, index) => ({
    capabilityId: runtimeTable.getChild('capabilityId').get(index),
    parentDirectoryPath: runtimeTable.getChild('parentDirectoryPath').get(index),
    evidenceKind: runtimeTable.getChild('evidenceKind').get(index),
    executionProven: runtimeTable.getChild('executionProven').get(index) === 1,
    sourceRevisionQualified: runtimeTable.getChild('sourceRevisionQualified').get(index) === 1,
  }));
}
const packageRows = [];
for (let index = 0; index < packageTable.numRows; index += 1) {
  packageRows.push(Object.fromEntries(packageTable.schema.fields.map(field => [field.name, packageTable.getChild(field.name).get(index)])));
}
const directories = [];
for (let index = 0; index < directoryTable.numRows; index += 1) {
  directories.push({
    directoryPath: directoryTable.getChild('directoryPath').get(index),
    profileLanguageCountsJson: directoryTable.getChild('profileLanguageCountsJson').get(index),
    roleCountsJson: directoryTable.getChild('roleCountsJson').get(index),
  });
}
let sourceClassCounts = [];
let sourceClassReceiptSha256 = null;
let sourceClassArtifactSha256 = null;
if (sourceClassManifest) {
  const sourceClassRowsPath = resolveRepoPath(sourceClassManifest.outputs.classifiedRows.path);
  const sourceInventoryPath = resolveRepoPath(sourceClassManifest.inputs.inventoryPath);
  const sourcePathsPath = resolveRepoPath(sourceClassManifest.inputs.pathsPath);
  const sourceSnapshotManifestPath = resolveRepoPath(sourceClassManifest.inputs.snapshotManifestPath);
  const sourceInventory = readJson(sourceInventoryPath);
  const { inventorySha256, ...sourceInventoryBody } = sourceInventory;
  const sourceInventoryCanonicalSha256 = sha256(Buffer.from(canonical(sourceInventoryBody)));
  const sourceSnapshotManifest = readJson(sourceSnapshotManifestPath);
  if (sourceClassManifest.schema !== 'atlas.source-class-split.receipt.v1'
    || sourceClassManifest.canonicalAuthority !== false || sourceClassManifest.writesPerformed !== false
    || sha256(readFileSync(sourceInventoryPath)) !== sourceClassManifest.inputs.inventorySha256
    || sourceInventoryCanonicalSha256 !== inventorySha256
    || sourceInventoryCanonicalSha256 !== sourceClassManifest.inputs.inventorySha256Recorded
    || sha256(readFileSync(sourceSnapshotManifestPath)) !== sourceClassManifest.inputs.snapshotManifestSha256
    || sourceSnapshotManifest.receiptSha256 !== rollupManifest.sourcePathManifestReceiptSha256
    || sourceSnapshotManifest.pathManifestSha256 !== sourceClassManifest.inputs.pathsSha256
    || sourceSnapshotManifest.sourceInventorySha256 !== sourceInventoryCanonicalSha256
    || await sha256Stream(sourcePathsPath) !== sourceClassManifest.inputs.pathsSha256
    || await sha256Stream(sourceClassRowsPath) !== sourceClassManifest.outputs.classifiedRows.sha256) {
    throw new Error('SOURCE_CLASS_FEATURE_ARTIFACT_CHECKSUM_INVALID');
  }
  const directorySet = new Set(directories.map(row => row.directoryPath));
  const counts = new Map();
  const classes = new Set(['FIRST_PARTY_SOURCE', 'OPENSPEC_REQUIREMENTS', 'EXTERNAL_DEPENDENCY', 'GENERATED_SOURCE',
    'TELEMETRY_REPORT', 'MODEL_ARTIFACT', 'BINARY_ASSET', 'ENVIRONMENT_CACHE', 'UNKNOWN']);
  let rowCount = 0;
  let fileCount = 0;
  const lineReader = readline.createInterface({ input: createReadStream(sourceClassRowsPath), crlfDelay: Infinity });
  for await (const line of lineReader) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (row.o !== rowCount++) throw new Error('SOURCE_CLASS_FEATURE_ROW_ORDINAL_INVALID');
    if (row.k !== 'F') continue;
    if (typeof row.p !== 'string' || !classes.has(row.c)) throw new Error('SOURCE_CLASS_FEATURE_ROW_INVALID');
    fileCount++;
    let parent = path.posix.dirname(row.p.replaceAll('\\', '/'));
    for (;;) {
      if (!directorySet.has(parent)) throw new Error('SOURCE_CLASS_DIRECTORY_NOT_IN_ROLLUP');
      const key = `${parent}\u0000${row.c}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (parent === '.') break;
      const next = path.posix.dirname(parent);
      if (next === parent) throw new Error('SOURCE_CLASS_PARENT_WALK_INVALID');
      parent = next;
    }
  }
  if (rowCount !== sourceClassManifest.outputs.classifiedRows.rows
    || fileCount !== sourceClassManifest.reconciliation.independentFileCount) throw new Error('SOURCE_CLASS_FEATURE_ROW_COUNT_INVALID');
  sourceClassCounts = [...counts].map(([key, fileCount]) => {
    const separator = key.indexOf('\u0000');
    return { directoryPath: key.slice(0, separator), sourceClass: key.slice(separator + 1), fileCount };
  });
  sourceClassReceiptSha256 = sha256(readFileSync(sourceClassReceiptPath));
  sourceClassArtifactSha256 = sourceClassManifest.outputs.classifiedRows.sha256;
}
const result = buildDirectoryFeatureMatrixV1({ directories, packageRows, domainCandidates, runtimeOwnerCandidates, sourceClassCounts });
const directoryBytesOut = tableToIPC(new Table({
  ordinal: vectorFromArray(result.directoryRows.map(row => row.ordinal), new Int32()),
  relativePath: vectorFromArray(result.directoryRows.map(row => row.directoryPath), new Utf8()),
}), 'file');
const featureBytesOut = tableToIPC(new Table({
  ordinal: vectorFromArray(result.featureRows.map(row => row.ordinal), new Int32()),
  featureKey: vectorFromArray(result.featureRows.map(row => row.featureKey), new Utf8()),
  evidenceKind: vectorFromArray(result.featureRows.map(row => row.evidenceKind), new Utf8()),
}), 'file');
const matrixBytesOut = tableToIPC(new Table({
  entityOrdinal: vectorFromArray(result.sparseRows.map(row => row.entityOrdinal), new Int32()),
  featureOrdinal: vectorFromArray(result.sparseRows.map(row => row.featureOrdinal), new Int32()),
  value: vectorFromArray(result.sparseRows.map(row => row.value), new Int32()),
}), 'file');
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
const disk = statfsSync(root);
const outputSize = directoryBytesOut.byteLength + featureBytesOut.byteLength + matrixBytesOut.byteLength;
if (disk.bavail * disk.bsize < (outputSize + 2_000_000) * 2) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
mkdirSync(outputDir, { recursive: true });
const outputs = [
  ['directory-ordinals.arrow', directoryBytesOut],
  ['feature-ordinals.arrow', featureBytesOut],
  ['directory-features-sparse.arrow', matrixBytesOut],
];
for (const [name, bytes] of outputs) writeFileSync(path.join(outputDir, name), bytes, { flag: 'wx' });
const readbacks = outputs.map(([name]) => tableFromIPC(readFileSync(path.join(outputDir, name))));
if (readbacks[0].numRows !== result.directoryRows.length
  || readbacks[1].numRows !== result.featureRows.length
  || readbacks[2].numRows !== result.sparseRows.length) throw new Error('FEATURE_ARROW_READBACK_INVALID');
const manifest = {
  schema: 'atlas.directory-feature-matrix.v1',
  status: 'DERIVED_ADVISORY_SPARSE_FEATURES',
  canonicalAuthority: false,
  writesPerformed: false,
  packageReferenceReceiptSha256: packageManifest.receiptSha256,
  directoryPackageReceiptSha256: packageRowsManifest.receiptSha256,
  directoryRollupReceiptSha256: rollupManifest.receiptSha256,
  directoryRows: result.directoryRows.length,
  featureRows: result.featureRows.length,
  sparseValueRows: result.sparseRows.length,
  featureKinds: Object.fromEntries([...new Set(result.featureRows.map(row => row.evidenceKind))].sort().map(kind => [kind,
    result.featureRows.filter(row => row.evidenceKind === kind).length])),
  domainProposalManifestSha256: domainManifest?.manifestBodySha256 ?? null,
  domainProposalArtifactSha256: domainManifest?.artifactSha256 ?? null,
  domainProposalFeatureCount: result.featureRows.filter(row => row.evidenceKind === 'ADVISORY_DOMAIN_PROPOSAL_SCORE').length,
  runtimeOwnerManifestSha256: runtimeOwnerManifest?.receiptSha256 ?? null,
  runtimeOwnerArtifactSha256: runtimeOwnerManifest?.artifacts?.['runtime-owner-candidates.arrow']?.sha256 ?? null,
  runtimeOwnerFeatureCount: result.featureRows.filter(row => row.evidenceKind === 'ADVISORY_DECLARED_RUNTIME_OWNER_PATH').length,
  sourceClassReceiptSha256,
  sourceClassArtifactSha256,
  sourceClassFeatureCount: result.featureRows.filter(row => row.evidenceKind === 'PATH_SOURCE_CLASS_INVENTORY_COUNT').length,
  ordering: { directories: 'UTF-8 bytewise relative path', features: 'UTF-8 bytewise feature key', sparse: 'entity ordinal then feature ordinal' },
  artifacts: Object.fromEntries(outputs.map(([name, bytes]) => [name, { sha256: sha256(bytes), bytes: bytes.byteLength }])),
  identityPolicy: 'run-local ordinals map to relative paths and feature strings; never canonical identity or persistent feature IDs',
  evidencePolicy: 'profile, role, and source-class counts derive from checksummed physical inventory; package counts derive from regex import candidates; domain and declared runtime-owner path candidates remain separate advisory feature families; declared owner paths do not prove execution; source-class counts are not semantic relevance; no canonical feature labels, embeddings, or reviewed relevance judgments',
  noDatabaseOrGpuWrites: true,
};
manifest.receiptSha256 = sha256(Buffer.from(canonical(manifest)));
const manifestPath = path.join(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const readbackManifest = readJson(manifestPath);
const receiptSha256 = readbackManifest.receiptSha256;
delete readbackManifest.receiptSha256;
if (sha256(Buffer.from(canonical(readbackManifest))) !== receiptSha256) throw new Error('FEATURE_RECEIPT_READBACK_FAILED');
for (const [name, expected] of Object.entries(manifest.artifacts)) {
  if (sha256(readFileSync(path.join(outputDir, name))) !== expected.sha256) throw new Error('FEATURE_ARTIFACT_READBACK_FAILED');
}
console.log(JSON.stringify({ status: manifest.status, manifestPath: path.relative(root, manifestPath).replaceAll('\\', '/'),
  receiptSha256, directoryRows: manifest.directoryRows, featureRows: manifest.featureRows,
  sparseValueRows: manifest.sparseValueRows }));
