// OMR-MSGPACK-RPC-PACKET-01 Phase C: diagnostic DuckDB feature reduction over a verified PostgreSQL packet snapshot.
// Not the legacy packets:duckdb:reduce owner (hardcoded packet inputs, fixed summary schema). Reads one snapshot,
// binds it to its receipt digest, reduces only rows with a well-formed source_revision, writes a separate artifact
// and receipt. Never writes to PostgreSQL, CouchDB, Neo4j or the legacy summary files.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REDUCER_VERSION = 'omr-duckdb-reduce-v1@1';
export const REDUCE_SCHEMA_V1 = 'atlas.omr-duckdb-feature-reduction.v1';
export const REDUCE_RECEIPT_SCHEMA_V1 = 'atlas.omr-duckdb-reduce-receipt.v1';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_DIR = path.join(ROOT, '.tmp', 'atlas', 'omr-msgpack');

const sha256Text = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
const sha256File = (file) => `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;

/** Classify one snapshot row. Exactly one reason per row; QUALIFIED is the only reduced class. */
export function classifyPacketRow(row) {
  if (typeof row.packet_key !== 'string' || row.packet_key.length === 0) return 'MISSING_PACKET_KEY';
  if (row.source_revision == null || row.source_revision === '') return 'MISSING_SOURCE_REVISION';
  if (!/^sha256:[0-9a-f]{64}$/.test(row.source_revision)) return 'INVALID_SOURCE_REVISION';
  if (typeof row.feature_id !== 'string' || row.feature_id.length === 0) return 'MISSING_FEATURE_ID';
  if (typeof row.source_ref !== 'string' || row.source_ref.length === 0) return 'MISSING_SOURCE_REF';
  return 'QUALIFIED';
}

function duckdbJson(duckdbBin, sql) {
  const res = spawnSync(duckdbBin, ['-json', '-c', sql], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`DUCKDB_FAILED:${(res.stderr || res.stdout || '').trim().slice(0, 300)}`);
  // One JSON array per SELECT (CREATE prints nothing); the reduction issues two SELECTs in order.
  return res.stdout.trim().split(/\n(?=\[)/).map((chunk) => JSON.parse(chunk));
}

/**
 * Reduce one snapshot. `snapshotFile` must match `snapshotReceiptDigest` (binding check).
 * Returns { output, receipt, outputFile, receiptFile } after publishing both atomically.
 */
export function reduceSnapshotV1({ snapshotFile, snapshotReceiptDigest, outDir = DEFAULT_DIR, duckdbBin = process.env.DUCKDB_BIN || 'duckdb', runId }) {
  const inputDigest = sha256File(snapshotFile);
  if (snapshotReceiptDigest && inputDigest !== snapshotReceiptDigest) throw new Error('SNAPSHOT_DIGEST_MISMATCH');

  const rows = fs.readFileSync(snapshotFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const rejections = {};
  const qualified = [];
  for (const row of rows) {
    const reason = classifyPacketRow(row);
    rejections[reason] = (rejections[reason] ?? 0) + 1;
    if (reason === 'QUALIFIED') qualified.push(row);
  }

  // DuckDB performs the aggregation over the same snapshot; the JS pass above is the independent cross-check.
  const file = snapshotFile.split(path.sep).join('/');
  const sql = `
    CREATE TABLE snap AS SELECT * FROM read_ndjson('${file}', columns={packet_key:'VARCHAR', source_ref:'VARCHAR', feature_id:'VARCHAR', workspace_revision:'BIGINT', source_revision:'VARCHAR', representation_revision:'BIGINT', sha256:'VARCHAR', updated_at:'VARCHAR'});
    SELECT count(*) AS qualified_rows, count(DISTINCT packet_key) AS distinct_packet_keys, count(DISTINCT feature_id) AS distinct_features
      FROM snap WHERE packet_key IS NOT NULL AND feature_id IS NOT NULL AND source_ref IS NOT NULL AND source_revision IS NOT NULL AND regexp_full_match(source_revision, 'sha256:[0-9a-f]{64}');
    SELECT feature_id, count(*) AS packet_count, count(DISTINCT packet_key) AS distinct_packet_key
      FROM snap WHERE packet_key IS NOT NULL AND feature_id IS NOT NULL AND source_ref IS NOT NULL AND source_revision IS NOT NULL AND regexp_full_match(source_revision, 'sha256:[0-9a-f]{64}')
      GROUP BY feature_id ORDER BY feature_id;`;
  const [[totals], features] = duckdbJson(duckdbBin, sql);

  if (Number(totals.qualified_rows) !== qualified.length) throw new Error(`CROSS_CHECK_MISMATCH:QUALIFIED_ROWS:${totals.qualified_rows}!=${qualified.length}`);

  const packetKeySetDigest = sha256Text(JSON.stringify(qualified.map((r) => r.packet_key).sort()));
  const output = {
    schema: REDUCE_SCHEMA_V1,
    reducerVersion: REDUCER_VERSION,
    diagnosticOnly: true,
    workspace_revision: 'NOT_ADMITTED',
    input: { snapshotFile: file, snapshotDigest: inputDigest, rows: rows.length },
    qualifiedRows: qualified.length,
    distinctPacketKeys: Number(totals.distinct_packet_keys),
    distinctFeatures: Number(totals.distinct_features),
    packetKeySetDigest,
    rejections,
    features: features.map((f) => ({ feature_id: f.feature_id, packet_count: Number(f.packet_count), distinct_packet_key: Number(f.distinct_packet_key) })),
  };

  fs.mkdirSync(path.join(outDir, 'reduce'), { recursive: true });
  const stamp = runId ?? new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const outputFile = path.join(outDir, 'reduce', `feature-reduction-${stamp}.json`);
  const outputText = JSON.stringify(output, null, 2) + '\n';
  publishAtomic(outputFile, outputText);
  const outputDigest = sha256File(outputFile);

  const receipt = {
    schema: REDUCE_RECEIPT_SCHEMA_V1,
    reducerVersion: REDUCER_VERSION,
    status: 'DIAGNOSTIC_ONLY',
    inputFile: file,
    inputDigest,
    snapshotReceiptBound: Boolean(snapshotReceiptDigest),
    outputFile: outputFile.split(path.sep).join('/'),
    outputDigest,
    counts: { snapshotRows: rows.length, qualifiedRows: qualified.length, distinctPacketKeys: output.distinctPacketKeys, distinctFeatures: output.distinctFeatures },
    rejections,
    readback: { outputDigestReread: sha256File(outputFile) === outputDigest, crossCheck: 'JS_AND_DUCKDB_QUALIFIED_ROWS_MATCH' },
    workspace_revision: 'NOT_ADMITTED',
    writesPerformed: false,
    canonicalWrites: 'DISABLED',
  };
  const receiptFile = outputFile.replace(/\.json$/, '-receipt.json');
  publishAtomic(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
  return { output, receipt, outputFile, receiptFile };
}

function publishAtomic(target, text) {
  // Immutable publication: never replace an existing artifact or receipt.
  if (fs.existsSync(target)) throw new Error('ARTIFACT_EXISTS_IMMUTABLE');
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  if (fs.readFileSync(tmp, 'utf8') !== text) {
    fs.rmSync(tmp, { force: true });
    throw new Error('ARTIFACT_VERIFY_FAILED');
  }
  fs.renameSync(tmp, target);
}

function main() {
  const dir = path.join(DEFAULT_DIR);
  const snapshotFile = process.argv[2] ?? fs.readdirSync(dir).filter((n) => /^atlas-packets-snapshot-.*\.ndjson$/.test(n)).sort().map((n) => path.join(dir, n)).pop();
  const receiptName = snapshotFile.replace(/\.ndjson$/, '-receipt.json');
  const snapshotReceiptDigest = JSON.parse(fs.readFileSync(receiptName, 'utf8')).artifact.digest;
  const { receipt, outputFile, receiptFile } = reduceSnapshotV1({ snapshotFile, snapshotReceiptDigest });
  console.log(JSON.stringify({ outputFile, receiptFile, status: receipt.status, counts: receipt.counts, rejections: receipt.rejections, outputDigest: receipt.outputDigest }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
