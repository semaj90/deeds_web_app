#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { buildDirectoryDomainCandidatesV1 } from './lib/directory-domain-candidates-v1.mjs';

const [summaryArtifactArg, summaryManifestArg, vocabularyArg, runId] = process.argv.slice(2);
if (!summaryArtifactArg || !summaryManifestArg || !vocabularyArg || !/^[a-zA-Z0-9][a-zA-Z0-9-]{2,63}$/.test(runId ?? '')) {
  throw new Error('USAGE: node scripts/atlas/build-directory-domain-candidates-v1.mjs <summaries.arrow> <summary-manifest.json> <domain-vocabulary.json> <run-id>');
}

const root = process.cwd();
const summaryPath = path.resolve(root, summaryArtifactArg);
const summaryManifestPath = path.resolve(root, summaryManifestArg);
const vocabularyPath = path.resolve(root, vocabularyArg);
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', 'domain-candidates', runId);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value);
const writeExclusive = (filePath, bytes) => writeFileSync(filePath, bytes, { flag: 'wx' });

const summaryBytes = readFileSync(summaryPath);
const summaryManifestBytes = readFileSync(summaryManifestPath);
const vocabularyBytes = readFileSync(vocabularyPath);
const summaryManifest = JSON.parse(summaryManifestBytes.toString('utf8'));
const vocabulary = JSON.parse(vocabularyBytes.toString('utf8'));
if (summaryManifest.schema !== 'atlas.directory-metadata-summaries.v1'
  || summaryManifest.artifactSha256 !== sha256(summaryBytes)
  || !Array.isArray(vocabulary.groups) || vocabulary.groups.length === 0) {
  throw new Error('DOMAIN_CANDIDATE_INPUT_BINDING_INVALID');
}
const summaryTable = tableFromIPC(summaryBytes);
if (summaryTable.numRows !== summaryManifest.summaryCount || summaryTable.numRows !== summaryManifest.directoryCount) {
  throw new Error('DIRECTORY_SUMMARY_ROW_COUNT_MISMATCH');
}
const directories = summaryTable.toArray().map(row => ({
  relativePath: row.relativePath,
  summarySha256: row.summarySha256,
  inputDigest: row.inputDigest,
  topDirectPackageCandidatesJson: row.topDirectPackageCandidatesJson,
}));
const vocabularySha256 = sha256(vocabularyBytes);
const result = buildDirectoryDomainCandidatesV1({ directories, groups: vocabulary.groups, vocabularySha256 });
const rows = result.rows.map(row => ({
  relativePath: row.relativePath,
  summarySha256: row.summarySha256,
  inputDigest: row.inputDigest,
  candidateGroupId: row.candidateGroupId ?? '',
  parentGroupId: row.parentGroupId ?? '',
  inheritedFromGroupId: row.inheritedFromGroupId ?? '',
  candidateKind: row.candidateKind,
  matchedPathTermsJson: canonical(row.matchedPathTerms),
  matchedPackageTermsJson: canonical(row.matchedPackageTerms),
  score: row.score,
  status: row.status,
}));
const fields = [
  ['relativePath', Utf8], ['summarySha256', Utf8], ['inputDigest', Utf8], ['candidateGroupId', Utf8],
  ['parentGroupId', Utf8], ['inheritedFromGroupId', Utf8], ['candidateKind', Utf8], ['matchedPathTermsJson', Utf8],
  ['matchedPackageTermsJson', Utf8], ['score', Int32], ['status', Utf8],
];
const artifactBytes = tableToIPC(new Table(Object.fromEntries(fields.map(([name, Type]) => [name,
  vectorFromArray(rows.map(row => row[name]), Type === Int32 ? new Int32() : new Utf8())]))), 'file');
const availableBytes = statfsSync(root).bavail * statfsSync(root).bsize;
if (availableBytes < artifactBytes.byteLength * 2 + 1_000_000) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
mkdirSync(path.dirname(outputDir), { recursive: true });
mkdirSync(outputDir, { recursive: false });
const artifactPath = path.join(outputDir, 'directory-domain-candidates.arrow');
writeExclusive(artifactPath, artifactBytes);
const readback = tableFromIPC(readFileSync(artifactPath));
if (readback.numRows !== rows.length || readback.numCols !== fields.length
  || sha256(readFileSync(artifactPath)) !== sha256(artifactBytes)) throw new Error('DOMAIN_CANDIDATE_READBACK_FAILED');
const body = {
  schema: 'atlas.directory-domain-candidates-manifest.v1',
  runId,
  status: 'ADVISORY_PROPOSALS_ONLY',
  canonicalAuthority: false,
  inputs: {
    directorySummaryPath: path.relative(root, summaryPath).replaceAll(path.sep, '/'),
    directorySummarySha256: sha256(summaryBytes),
    directorySummaryManifestSha256: sha256(summaryManifestBytes),
    vocabularyPath: path.relative(root, vocabularyPath).replaceAll(path.sep, '/'),
    vocabularySha256,
    vocabularySchema: vocabulary.schema ?? 'UNSPECIFIED',
  },
  directoryCount: directories.length,
  candidateRowCount: rows.length,
  directCandidates: result.counts.directCandidates,
  inheritedCandidates: result.counts.inheritedCandidates,
  unclassifiedRows: result.counts.unclassified,
  distinctCandidateDirectories: new Set(rows.filter(row => row.candidateGroupId).map(row => row.relativePath)).size,
  distinctUnclassifiedDirectories: new Set(rows.filter(row => row.status === 'UNCLASSIFIED_NO_DOMAIN_SIGNAL').map(row => row.relativePath)).size,
  candidateRowsSha256: result.rowsSha256,
  artifactPath: path.relative(root, artifactPath).replaceAll(path.sep, '/'),
  artifactSha256: sha256(artifactBytes),
  artifactBytes: artifactBytes.byteLength,
  outputReadbackRows: readback.numRows,
  sourceEvidenceScope: summaryManifest.contentCoverage,
  writesPerformed: true,
  productionStoreWrites: false,
};
const manifest = { ...body, manifestBodySha256: sha256(Buffer.from(canonical(body))) };
const manifestPath = path.join(outputDir, 'manifest.json');
writeExclusive(manifestPath, Buffer.from(`${canonical(manifest)}\n`, 'utf8'));
process.stdout.write(`${JSON.stringify({ ...manifest, manifestPath: path.relative(root, manifestPath).replaceAll(path.sep, '/') })}\n`);
