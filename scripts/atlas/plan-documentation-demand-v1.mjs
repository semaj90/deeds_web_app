#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryNpm, inventoryNonNpmManifests } from './lib/library-doc-inventory-v1.mjs';
import {
  buildDocumentationDemandV1,
  collectDocumentationSourceFiles,
  collectNonNpmManifestFiles,
  collectIndexedDocumentationRecords,
  parseNonNpmDependencyManifests,
} from './lib/documentation-demand-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratchRoot = path.join(root, '.tmp', 'atlas') + path.sep;
const args = process.argv.slice(2);
const outputArgIndex = args.indexOf('--output');
const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
const outputPath = path.resolve(root, outputArgIndex >= 0
  ? args[outputArgIndex + 1]
  : `.tmp/atlas/documentation-demand-v1-${stamp}.json`);
if (!outputPath.startsWith(scratchRoot)) throw new Error('OUTPUT_MUST_BE_UNDER_TMP_ATLAS');
if (outputArgIndex >= 0 && !args[outputArgIndex + 1]) throw new Error('OUTPUT_PATH_REQUIRED');
const unknown = args.filter((arg, index) => arg !== '--output' && index !== outputArgIndex + 1);
if (unknown.length) throw new Error(`UNKNOWN_ARGUMENTS:${unknown.join(',')}`);

const catalogPath = path.join(root, 'docs/.okf/dev/library-api-doc-catalog-v1.json');
const catalogBytes = fs.readFileSync(catalogPath);
const catalog = JSON.parse(catalogBytes.toString('utf8'));
if (catalog.schema !== 'atlas.library-api-doc-catalog.v1' || !Array.isArray(catalog.sources)) throw new Error('INVALID_LIBRARY_API_DOC_CATALOG');
const gitmodulesPath = path.join(root, '.gitmodules');
const gitmodulesBytes = fs.existsSync(gitmodulesPath) ? fs.readFileSync(gitmodulesPath) : null;
const gitmodulesText = gitmodulesBytes?.toString('utf8') ?? '';
const gitSubmodulePaths = [...gitmodulesText.matchAll(/^\s*path\s*=\s*(.*?)\s*$/gm)]
  .map((match) => match[1].replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, ''))
  .filter((value) => value.length > 0 && !value.split('/').includes('..'))
  .sort();
const sourceInventory = collectDocumentationSourceFiles(root, fs, { excludedRootDirs: gitSubmodulePaths });
const npmInventory = inventoryNpm(root, catalog, { excludedRootDirs: gitSubmodulePaths });
const nonNpmManifestFiles = collectNonNpmManifestFiles(root, fs, { excludedRootDirs: gitSubmodulePaths });
const nonNpmInventory = parseNonNpmDependencyManifests(nonNpmManifestFiles);
const indexedCorpus = collectIndexedDocumentationRecords(root, fs);
const evidenceFiles = [
  ...(gitmodulesBytes ? [{ path: '.gitmodules', sha256: crypto.createHash('sha256').update(gitmodulesBytes).digest('hex') }] : []),
  ...nonNpmManifestFiles,
  ...indexedCorpus.records.map((record) => ({ path: record.path, sha256: record.fileSha256 })),
  ...npmInventory.manifests.flatMap((manifest) => [
    { path: manifest.path, sha256: manifest.packageJsonSha256 },
    ...(manifest.lockfile && manifest.lockfileSha256 ? [{ path: manifest.lockfile, sha256: manifest.lockfileSha256 }] : []),
  ]),
];
const demandInputs = { catalog, inventory: { npm: npmInventory, nonNpm: nonNpmInventory }, sourceFiles: sourceInventory.files, indexedDocuments: indexedCorpus.records, inputFiles: evidenceFiles };
const demand = buildDocumentationDemandV1(demandInputs);
const replay = buildDocumentationDemandV1(demandInputs);
if (replay.demandChecksum !== demand.demandChecksum || replay.sourceSnapshot.checksum !== demand.sourceSnapshot.checksum) {
  throw new Error('DOCUMENTATION_DEMAND_REPLAY_MISMATCH');
}
const payload = {
  ...demand,
  replay: { status: 'MATCH', buildCount: 2, demandChecksum: replay.demandChecksum, sourceSnapshotChecksum: replay.sourceSnapshot.checksum },
  catalogPath: 'docs/.okf/dev/library-api-doc-catalog-v1.json',
  catalogFileChecksum: crypto.createHash('sha256').update(catalogBytes).digest('hex'),
  packageInventory: {
    manifestCount: npmInventory.manifestCount,
    uniqueNpmPackages: npmInventory.uniqueNpmPackages,
    declarationCount: npmInventory.packageDeclarationCount,
    nonNpmDeclarationCount: nonNpmInventory.length,
    nonNpmManifestCount: nonNpmManifestFiles.length,
    nonNpmManifests: inventoryNonNpmManifests(root, { excludedRootDirs: gitSubmodulePaths }),
  },
  indexedDocumentationInventory: {
    corpusRecordCount: indexedCorpus.records.length,
    corpusSnapshotChecksum: crypto.createHash('sha256').update(JSON.stringify(indexedCorpus.records.map(({ path: recordPath, fileSha256 }) => ({ path: recordPath, sha256: fileSha256 })))).digest('hex'),
    invalidJsonCount: indexedCorpus.invalidJsonCount,
    authority: 'EXTERNAL_DOCUMENTATION_REFERENCE_ONLY',
    sourceDirectory: 'docs/.okf/dev',
  },
  sourceInventory: {
    scannedFileCount: sourceInventory.files.length,
    skippedLargeFileCount: sourceInventory.skippedLargeFiles,
    excludedGitSubmodulePaths: gitSubmodulePaths,
    byteLimit: 2 * 1024 * 1024,
    ecosystems: ['typescript', 'javascript', 'python', 'go', 'rust', 'cpp'],
    useEvidenceSemantics: 'LEXICAL_IMPORT_REFERENCE_COUNTS_NOT_CALL_GRAPH_OR_RUNTIME_CALLERS',
  },
};
const receipt = { ...payload, receiptChecksum: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
const readback = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
const { receiptChecksum, ...readbackPayload } = readback;
if (crypto.createHash('sha256').update(JSON.stringify(readbackPayload)).digest('hex') !== receiptChecksum) throw new Error('DEMAND_RECEIPT_READBACK_CHECKSUM_MISMATCH');
console.log(JSON.stringify({
  status: readback.status,
  demandCount: readback.demandCount,
  scannedSourceFiles: readback.sourceInventory.scannedFileCount,
  skippedLargeFiles: readback.sourceInventory.skippedLargeFileCount,
  topDemands: readback.demands.slice(0, 10).map((item) => ({ sourceId: item.sourceId, relevanceScore: item.relevanceScore, nonTestFiles: item.packages.reduce((sum, pkg) => sum + pkg.sourceUse.nonTestFiles, 0) })),
  demandChecksum: readback.demandChecksum,
  receiptReadback: 'MATCH',
  fetchPerformed: false,
  datastoreWritesPerformed: false,
  reportPath: path.relative(root, outputPath).replaceAll('\\', '/'),
}, null, 2));
