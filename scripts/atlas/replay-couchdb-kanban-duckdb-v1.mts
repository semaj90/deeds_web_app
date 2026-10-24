import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  applyCouchDbOfflineBatchV1,
  createCouchDbReplayStateV1,
  readBackCouchDbOfflineBatchArtifactV1,
  sha256CouchDbV1,
} from './lib/couchdb-offline-batch-v1.mjs';
import { reduceCouchDbKanbanReplayWithDuckDbV1, verifyCouchDbDuckDbKanbanRollupV1 } from './lib/couchdb-duckdb-kanban-rollup-v1.mjs';
import { summarizeCouchDbKanbanReplayWithCpuOracleV1 } from './lib/couchdb-kanban-rollup-cpu-oracle-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exportRoot = realpathSync(path.resolve(root, '.tmp/atlas/couchdb-offline-export'));
const outputRoot = path.resolve(root, '.tmp/atlas/couchdb-duckdb-kanban-rollup');
const inputDirectories = process.argv.slice(2).map((argument) => path.resolve(root, argument));
if (inputDirectories.length === 0) throw new Error('INPUT_BATCH_DIRECTORIES_REQUIRED');

function assertInside(parent: string, target: string) {
  const resolvedTarget = realpathSync(target);
  const relative = path.relative(parent, resolvedTarget);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('INPUT_PATH_OUTSIDE_EXPORT_ROOT');
  for (const name of ['batch.json', 'records.ndjson', 'receipt.json', 'export-receipt.json']) {
    const stats = lstatSync(path.join(resolvedTarget, name));
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('INPUT_ARTIFACT_NOT_REGULAR_FILE');
  }
  return resolvedTarget;
}

function canonicalJson(value: unknown) {
  return JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
    : entry);
}

let replay = createCouchDbReplayStateV1();
const pages = [];
for (const directory of inputDirectories) {
  const admittedDirectory = assertInside(exportRoot, directory);
  const { batch, receipt } = readBackCouchDbOfflineBatchArtifactV1(admittedDirectory);
  const exportReceipt = JSON.parse(readFileSync(path.join(admittedDirectory, 'export-receipt.json'), 'utf8'));
  const { receiptChecksum, ...exportReceiptBody } = exportReceipt;
  if (exportReceipt.schema !== 'atlas.couchdb-changes-export-receipt.v1'
    || receiptChecksum !== sha256CouchDbV1(exportReceiptBody)
    || exportReceipt.sourceDatabase !== 'phase19_tasks'
    || exportReceipt.batchDigest !== batch.batchDigest
    || exportReceipt.batchReceiptChecksum !== receipt.receiptChecksum
    || exportReceipt.canonicalAuthority !== false || exportReceipt.sourceAdmission !== 'NOT_ADMITTED'
    || exportReceipt.datastoreWrites !== false) throw new Error('EXPORT_RECEIPT_INVALID');
  const applied = applyCouchDbOfflineBatchV1(replay, batch);
  replay = applied.state;
  pages.push({ batchDigest: batch.batchDigest, exportReceiptChecksum: receiptChecksum, recordCount: batch.recordCount, checkpointDigest: batch.nextCheckpoint.digest });
}

if (pages.at(-1)?.recordCount !== 0) throw new Error('TERMINAL_EMPTY_PAGE_REQUIRED');
const documents = Object.values(replay.documentsById);
const summaryBody = {
  schema: 'atlas.couchdb-offline-replay-summary.v1',
  checkpointDigest: replay.checkpoint?.digest ?? null,
  documentCount: documents.filter((document) => !document.deleted).length,
  tombstoneCount: documents.filter((document) => document.deleted).length,
  conflictCount: documents.filter((document) => document.conflictStatus === 'CONFLICTS_PRESENT').length,
  documents: Object.entries(replay.documentsById).sort(([a], [b]) => a.localeCompare(b)).map(([documentId, value]) => ({ documentId, ...value })),
  canonicalAuthority: false,
  writesPerformed: false,
};
const summary = { ...summaryBody, summaryDigest: sha256CouchDbV1(summaryBody) };
const rollup = await reduceCouchDbKanbanReplayWithDuckDbV1(summary);
const cpuOracle = summarizeCouchDbKanbanReplayWithCpuOracleV1(summary);
const verification = verifyCouchDbDuckDbKanbanRollupV1(rollup);
if (!verification.valid) throw new Error(`ROLLUP_READBACK_${verification.reason}`);
const { oracleDigest, ...cpuProjection } = cpuOracle;
const duckDbProjection = {
  inputDocumentCount: rollup.inputDocumentCount,
  liveDocumentCount: rollup.liveDocumentCount,
  tombstoneCount: rollup.tombstoneCount,
  conflictedDocumentCount: rollup.conflictedDocumentCount,
  projectedDocumentCount: rollup.projectedDocumentCount,
  sourceReferenceCount: rollup.sourceReferenceCount,
  byStatus: rollup.byStatus,
  byPriority: rollup.byPriority,
};
if (canonicalJson(cpuProjection) !== canonicalJson(duckDbProjection)) throw new Error('DUCKDB_CPU_ORACLE_PARITY_FAILED');

mkdirSync(outputRoot, { recursive: true });
const runId = `${new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')}-${randomUUID().slice(0, 8)}`;
const runDirectory = path.join(outputRoot, runId);
mkdirSync(runDirectory);
const receiptBody = {
  schema: 'atlas.couchdb-duckdb-kanban-replay-receipt.v1',
  runId,
  inputDatabase: 'phase19_tasks',
  pages,
  inputPageCount: pages.length,
  inputChangeCount: pages.reduce((sum, page) => sum + page.recordCount, 0),
  finalCheckpointDigest: replay.checkpoint?.digest ?? null,
  replaySummaryDigest: summary.summaryDigest,
  mapReduceParity: 'DUCKDB_CPU_ORACLE_PASS',
  cpuOracleDigest: oracleDigest,
  rollup,
  canonicalAuthority: false,
  sourceAdmission: 'NOT_ADMITTED',
  persistentWrites: 0,
};
const receipt = { ...receiptBody, receiptChecksum: sha256CouchDbV1(receiptBody) };
const receiptPath = path.join(runDirectory, 'receipt.json');
writeFileSync(receiptPath, `${canonicalJson(receipt)}\n`, { flag: 'wx' });
const persisted = JSON.parse(readFileSync(receiptPath, 'utf8'));
const { receiptChecksum: persistedChecksum, ...persistedBody } = persisted;
if (persistedChecksum !== sha256CouchDbV1(persistedBody)
  || persistedChecksum !== receipt.receiptChecksum
  || !verifyCouchDbDuckDbKanbanRollupV1(persisted.rollup).valid) throw new Error('RECEIPT_READBACK_FAILED');
process.stdout.write(`${JSON.stringify({ status: 'COMPLETED', runId, receiptPath: path.relative(root, receiptPath), receiptChecksum: receipt.receiptChecksum, inputChanges: receiptBody.inputChangeCount, projectedTasks: rollup.projectedDocumentCount, canonicalAuthority: false, sourceAdmission: 'NOT_ADMITTED', persistentWrites: 0 })}\n`);
