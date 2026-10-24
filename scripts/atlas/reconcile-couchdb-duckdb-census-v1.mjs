import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canonicalJsonCouchDbV1, readBackCouchDbOfflineBatchArtifactV1, sha256CouchDbV1 } from './lib/couchdb-offline-batch-v1.mjs';
import { censusCouchDbOfflineBatchWithDuckDbV1 } from './lib/couchdb-duckdb-change-census-v1.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const allowedInputRoot = path.resolve(repoRoot, '.tmp/atlas/couchdb-offline-export');
const outputRoot = path.resolve(repoRoot, '.tmp/atlas/couchdb-duckdb-change-census');
const batchDirectoryArg = process.argv.slice(2).find((arg) => arg.startsWith('--batch-dir='))?.slice('--batch-dir='.length);

if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/atlas/reconcile-couchdb-duckdb-census-v1.mjs --batch-dir=.tmp/atlas/couchdb-offline-export/<run>');
  process.exit(0);
}
if (!batchDirectoryArg) {
  console.log('Usage: node scripts/atlas/reconcile-couchdb-duckdb-census-v1.mjs --batch-dir=.tmp/atlas/couchdb-offline-export/<run>');
  process.exit(2);
}

const batchDirectory = fs.realpathSync(path.resolve(repoRoot, batchDirectoryArg));
const canonicalAllowedInputRoot = fs.realpathSync(allowedInputRoot);
const relativeInput = path.relative(canonicalAllowedInputRoot, batchDirectory);
if (!relativeInput || relativeInput.startsWith(`..${path.sep}`) || relativeInput === '..' || path.isAbsolute(relativeInput)) {
  throw new Error('BATCH_DIRECTORY_OUTSIDE_EXPORT_ROOT');
}

const readback = readBackCouchDbOfflineBatchArtifactV1(batchDirectory);
const census = await censusCouchDbOfflineBatchWithDuckDbV1(readback.batch);
fs.mkdirSync(outputRoot, { recursive: true });
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
const runDirectory = path.join(outputRoot, runId);
fs.mkdirSync(runDirectory, { recursive: false });

const body = {
  schema: 'atlas.couchdb-duckdb-census-receipt.v1',
  runId,
  input: {
    batchDirectory: path.relative(repoRoot, batchDirectory).replace(/\\/g, '/'),
    batchDigest: readback.batch.batchDigest,
    batchReceiptChecksum: readback.receipt.receiptChecksum,
  },
  census,
  canonicalAuthority: false,
  sourceAdmission: 'NOT_ADMITTED',
  writesPerformed: false,
  persistentDatastoreWrites: 0,
  rawDocumentBodiesPersisted: 0,
};
const receipt = { ...body, receiptChecksum: sha256CouchDbV1(body) };
fs.writeFileSync(path.join(runDirectory, 'receipt.json'), `${canonicalJsonCouchDbV1(receipt)}\n`, { flag: 'wx' });
const readbackReceipt = JSON.parse(fs.readFileSync(path.join(runDirectory, 'receipt.json'), 'utf8'));
const { receiptChecksum, ...readbackBody } = readbackReceipt;
if (receiptChecksum !== sha256CouchDbV1(readbackBody)) throw new Error('CENSUS_RECEIPT_READBACK_CHECKSUM_MISMATCH');

console.log(JSON.stringify({
  status: census.status,
  inputRecords: census.inputRecordCount,
  liveDocuments: census.liveDocumentCount,
  tombstones: census.tombstoneCount,
  conflicts: census.conflictedRecordCount,
  reduction: census.reduction,
  contextManifest: census.contextManifest,
  mastra: census.mastra,
  writesPerformed: false,
  receipt: path.relative(repoRoot, path.join(runDirectory, 'receipt.json')).replace(/\\/g, '/'),
  receiptChecksum,
}, null, 2));
