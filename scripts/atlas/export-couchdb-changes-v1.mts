import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { resolveCouchDbConfigV1 } from '../../sveltekit-frontend/src/lib/server/config/couchdb-config.ts';
import {
  canonicalJsonCouchDbV1,
  readBackCouchDbOfflineBatchArtifactV1,
  sha256CouchDbV1,
  writeCouchDbOfflineBatchArtifactV1,
} from './lib/couchdb-offline-batch-v1.mjs';
import { COUCHDB_EXPORT_DATABASES_V1, exportCouchDbChangesBatchV1 } from './lib/couchdb-changes-export-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env'), override: false, quiet: true });
const args = new Map(process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
  const [key, ...parts] = arg.slice(2).split('=');
  return [key, parts.join('=')];
}));

function fail(code: string): never {
  process.stderr.write(`${JSON.stringify({ status: 'BLOCKED', code, datastoreWrites: false })}\n`);
  process.exit(1);
}

const database = args.get('database') ?? 'dag_cache';
const limit = Number(args.get('limit') ?? '100');
const maxResponseBytes = Number(args.get('max-response-bytes') ?? String(8 * 1024 * 1024));
const previousRunPath = args.get('previous-run-dir');
if (args.has('help')) {
  process.stdout.write('Usage: export-couchdb-changes-v1.mts [--database=dag_cache] [--limit=100] [--max-response-bytes=8388608] [--previous-run-dir=.tmp/atlas/couchdb-offline-export/<run>]\n');
  process.exit(0);
}
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) fail('LIMIT_OUT_OF_RANGE');
if (!COUCHDB_EXPORT_DATABASES_V1.includes(database)) fail('DATABASE_NOT_ALLOWLISTED');
if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 64 * 1024 * 1024) fail('RESPONSE_LIMIT_OUT_OF_RANGE');

let previousCheckpoint: { token: unknown; digest: string } | null = null;
if (previousRunPath) {
  try {
    const previousDirectory = path.resolve(root, previousRunPath);
    const previous = readBackCouchDbOfflineBatchArtifactV1(previousDirectory).batch;
    if (previous.sourceDatabase !== database) fail('PREVIOUS_DATABASE_MISMATCH');
    previousCheckpoint = previous.nextCheckpoint;
  } catch (error) {
    fail(error instanceof Error ? error.message : 'PREVIOUS_RUN_READBACK_FAILED');
  }
}

const requestId = randomUUID();
const startedAt = new Date().toISOString();
let config;
try { config = resolveCouchDbConfigV1(process.env); }
catch (error) { fail(error instanceof Error ? error.message.replace(/COUCHDB_[A-Z_]+/g, 'COUCHDB_CONFIGURATION') : 'COUCHDB_CONFIGURATION_INVALID'); }

let exported;
try {
  exported = await exportCouchDbChangesBatchV1({
    baseUrl: config.baseUrl,
    authorization: config.authorization,
    database,
    since: previousCheckpoint?.token ?? '0',
    previousCheckpoint,
    limit,
    maxResponseBytes,
    maxDocumentBytes: 4 * 1024 * 1024,
    timeoutMs: 30_000,
    fetchImpl: fetch,
  });
} catch (error) {
  fail(error instanceof Error ? error.message : 'COUCHDB_EXPORT_FAILED');
}

const runId = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`;
const outputRoot = path.join(root, '.tmp', 'atlas', 'couchdb-offline-export');
const runDirectory = path.join(outputRoot, runId);
mkdirSync(outputRoot, { recursive: true });
let batchReceipt;
try { batchReceipt = writeCouchDbOfflineBatchArtifactV1(exported.batch, runDirectory); }
catch (error) { fail(error instanceof Error ? error.message : 'BATCH_ARTIFACT_WRITE_FAILED'); }

const exportReceiptBody = {
  schema: 'atlas.couchdb-changes-export-receipt.v1',
  requestId,
  runId,
  startedAt,
  completedAt: new Date().toISOString(),
  sourceDatabase: database,
  feed: 'normal',
  includeDocs: true,
  conflictsIncluded: true,
  requestedLimit: limit,
  response: exported.response,
  batchDigest: exported.batch.batchDigest,
  batchReceiptChecksum: batchReceipt.receiptChecksum,
  previousCheckpointDigest: exported.batch.previousCheckpointDigest,
  canonicalAuthority: false,
  sourceAdmission: 'NOT_ADMITTED',
  datastoreWrites: false,
};
const exportReceipt = { ...exportReceiptBody, receiptChecksum: sha256CouchDbV1(exportReceiptBody) };
const exportReceiptPath = path.join(runDirectory, 'export-receipt.json');
try {
  writeFileSync(exportReceiptPath, `${canonicalJsonCouchDbV1(exportReceipt)}\n`, { flag: 'wx' });
  const independentlyRead = readBackCouchDbOfflineBatchArtifactV1(runDirectory);
  const persistedReceipt = JSON.parse(readFileSync(exportReceiptPath, 'utf8'));
  const { receiptChecksum, ...receiptBody } = persistedReceipt;
  if (independentlyRead.batch.batchDigest !== exported.batch.batchDigest
    || independentlyRead.receipt.receiptChecksum !== batchReceipt.receiptChecksum
    || receiptChecksum !== sha256CouchDbV1(receiptBody)
    || persistedReceipt.batchDigest !== independentlyRead.batch.batchDigest
    || persistedReceipt.canonicalAuthority !== false
    || persistedReceipt.datastoreWrites !== false) {
    fail('EXPORT_RECEIPT_READBACK_MISMATCH');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : 'EXPORT_RECEIPT_READBACK_FAILED');
}

process.stdout.write(`${JSON.stringify({
  status: 'COMPLETED', requestId, runId, database, recordCount: exported.batch.recordCount,
  batchDigest: exported.batch.batchDigest, checkpointDigest: exported.batch.nextCheckpoint.digest,
  receiptChecksum: exportReceipt.receiptChecksum, artifactDirectory: path.relative(root, runDirectory),
  canonicalAuthority: false, sourceAdmission: 'NOT_ADMITTED', datastoreWrites: false,
})}\n`);
