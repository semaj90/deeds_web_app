#!/usr/bin/env node
/**
 * Deterministic, artifact-only fanout over a sealed SummarySearchCensusV1.
 * Workers verify shard bytes and row schema concurrently; no datastore or model access.
 * Usage: node scripts/atlas/run-summary-census-fanout-v1.mjs --dir=<census-dir> [--percent=0..100] [--concurrency=1..8] --state-dir=<new-dir> [--resume] --out=<new-json>
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const SELF = fileURLToPath(import.meta.url);
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};
const shaText = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const digestFile = async (file) => {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return `sha256:${hash.digest('hex')}`;
};

async function inspectShard({ file, expected }) {
  const result = { path: path.basename(file), rows: 0, rejected: 0, rejectionCodes: {}, classes: {}, firstOrdinal: null, lastOrdinal: null, checksum: null, checksumOk: false, ok: false };
  try {
    const [checksum, stream] = await Promise.all([digestFile(file), Promise.resolve(fs.createReadStream(file, 'utf8'))]);
    result.checksum = checksum;
    result.checksumOk = checksum === expected.sha256;
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lineNo = 0;
    for await (const line of lines) {
      if (!line.trim()) continue;
      lineNo++;
      let row;
      try { row = JSON.parse(line); } catch { result.rejected++; result.rejectionCodes.MALFORMED_JSON = (result.rejectionCodes.MALFORMED_JSON ?? 0) + 1; continue; }
      const valid = row?.schema === 'atlas.summary-search-census-row.v1'
        && Number.isSafeInteger(row.ordinal) && row.ordinal > 0
        && typeof row.identity?.chunkRowId === 'string'
        && typeof row.summary?.digest === 'string' && /^sha256:[0-9a-f]{64}$/.test(row.summary.digest)
        && ['QUARANTINED', 'CONTAMINATED', 'LEGACY_HINT_LINEAGE_BOUND', 'LEGACY_HINT_UNQUALIFIED', 'CURRENT', 'MISSING'].includes(row.summary?.state)
        && row.canonicalAuthority === false;
      if (!valid) { result.rejected++; result.rejectionCodes.SCHEMA_OR_AUTHORITY = (result.rejectionCodes.SCHEMA_OR_AUTHORITY ?? 0) + 1; continue; }
      if (result.firstOrdinal === null) result.firstOrdinal = row.ordinal;
      if (result.lastOrdinal !== null && row.ordinal !== result.lastOrdinal + 1) {
        result.rejected++; result.rejectionCodes.NONCONTIGUOUS_ORDINAL = (result.rejectionCodes.NONCONTIGUOUS_ORDINAL ?? 0) + 1;
      }
      result.lastOrdinal = row.ordinal;
      result.rows++;
      result.classes[row.summary.state] = (result.classes[row.summary.state] ?? 0) + 1;
    }
    result.ok = result.checksumOk && result.rows === expected.rows && result.rejected === 0;
    if (!result.checksumOk) result.rejectionCodes.SHARD_CHECKSUM_MISMATCH = 1;
    if (result.rows !== expected.rows) result.rejectionCodes.ROW_COUNT_MISMATCH = 1;
  } catch (error) {
    result.rejectionCodes.SHARD_READ_FAILURE = String(error?.message ?? error).slice(0, 160);
  }
  return result;
}

async function digestOrderedShards(dir, shards) {
  const hash = crypto.createHash('sha256');
  for (const shard of shards) {
    for await (const chunk of fs.createReadStream(path.join(dir, shard.path))) hash.update(chunk);
  }
  return `sha256:${hash.digest('hex')}`;
}

if (!isMainThread) {
  inspectShard(workerData).then((result) => parentPort.postMessage(result), (error) => parentPort.postMessage({ path: path.basename(workerData.file), rows: 0, rejected: 1, rejectionCodes: { WORKER_FAILURE: String(error?.message ?? error) }, ok: false }));
} else {
  const args = new Map(process.argv.slice(2).map((arg) => { const i = arg.indexOf('='); return i < 0 ? [arg.replace(/^--/, ''), 'true'] : [arg.slice(2, i), arg.slice(i + 1)]; }));
  const root = path.resolve(import.meta.dirname, '../..');
  const dir = args.get('dir') && path.resolve(root, args.get('dir'));
  const outArg = args.get('out');
  const stateDirArg = args.get('state-dir');
  const resume = args.has('resume');
  const percent = Number(args.get('percent') ?? 100);
  const concurrency = Math.max(1, Math.min(8, Number(args.get('concurrency') ?? Math.max(1, os.cpus().length - 1))));
  if (!dir || !outArg || !stateDirArg || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('DIR_OUT_STATE_DIR_AND_PERCENT_0_TO_100_REQUIRED');
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const noWrites = manifest.writes && ['postgres', 'qdrant', 'valkey', 'rabbitmq', 'graphify'].every((key) => manifest.writes[key] === 0);
  if (manifest.schema !== 'atlas.summary-search-census-manifest.v1' || manifest.status !== 'SEALED' || manifest.canonicalAuthority !== false || !noWrites) throw new Error('INPUT_CENSUS_NOT_SEALED_READ_ONLY');
  const all = manifest.acceptedShards;
  if (!Array.isArray(all) || !all.length) throw new Error('CENSUS_ACCEPTED_SHARDS_MISSING');
  const expectedTotal = manifest.tally?.accepted;
  if (!Number.isSafeInteger(expectedTotal)) throw new Error('CENSUS_ACCEPTED_COUNT_MISSING');
  const selectedCount = percent === 0 ? 0 : Math.min(all.length, Math.ceil(all.length * percent / 100));
  const selected = all.slice(0, selectedCount);
  const out = path.resolve(root, outArg);
  const tmpRoot = path.resolve(root, '.tmp', 'atlas') + path.sep;
  if (!out.startsWith(tmpRoot) || fs.existsSync(out)) throw new Error('RECEIPT_MUST_BE_NEW_FILE_UNDER_TMP_ATLAS');
  const stateDir = path.resolve(root, stateDirArg);
  if (!stateDir.startsWith(tmpRoot)) throw new Error('STATE_DIR_MUST_BE_UNDER_TMP_ATLAS');
  const checkpointPath = path.join(stateDir, 'checkpoint.ndjson');
  if (resume) {
    if (!fs.existsSync(checkpointPath)) throw new Error('RESUME_CHECKPOINT_MISSING');
  } else {
    if (fs.existsSync(stateDir)) throw new Error('STATE_DIR_ALREADY_EXISTS_USE_RESUME');
    fs.mkdirSync(stateDir, { recursive: true });
  }
  const manifestDigest = await digestFile(manifestPath);
  const workerDigest = await digestFile(SELF);
  const runIdentity = shaText(stableJson({
    schema: 'atlas.summary-census-fanout-run.v1', manifestDigest,
    rootChecksum: manifest.acceptedRootChecksum, workerDigest,
    rowSchema: 'atlas.summary-search-census-row.v1',
  }));
  const verifiedCheckpoint = new Map();
  if (resume) {
    const contents = fs.readFileSync(checkpointPath, 'utf8');
    const lines = contents.split('\n');
    if (contents.endsWith('\n')) lines.pop(); else lines.pop(); // ignore only a torn final append after a crash
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      const { eventChecksum, ...body } = event;
      if (event.schema !== 'atlas.summary-census-fanout-checkpoint.v1' || event.runIdentity !== runIdentity || eventChecksum !== shaText(stableJson(body))) throw new Error(`CHECKPOINT_EVENT_INVALID:${index + 1}`);
      const expectedShard = all.find((shard) => shard.path === event.path);
      if (!expectedShard || event.shardSha256 !== expectedShard.sha256 || event.rows !== expectedShard.rows || event.rejected !== 0 || event.ok !== true) throw new Error(`CHECKPOINT_SHARD_NOT_BOUND_TO_INPUT:${event.path}`);
      verifiedCheckpoint.set(event.path, event);
    }
  }
  const startedAt = new Date().toISOString();
  const results = new Array(selected.length);
  let next = 0;
  let resumedShards = 0;
  const appendCheckpoint = (result, entry) => {
    const body = {
      schema: 'atlas.summary-census-fanout-checkpoint.v1', runIdentity,
      path: entry.path, shardSha256: entry.sha256, rows: result.rows,
      rejected: result.rejected, firstOrdinal: result.firstOrdinal, lastOrdinal: result.lastOrdinal,
      classes: result.classes, ok: result.ok,
    };
    const event = { ...body, eventChecksum: shaText(stableJson(body)) };
    fs.appendFileSync(checkpointPath, `${JSON.stringify(event)}\n`, { flag: 'a' });
    verifiedCheckpoint.set(entry.path, event);
  };
  const loadCheckpointResult = (entry) => {
    const event = verifiedCheckpoint.get(entry.path);
    if (!event) return null;
    return { path: entry.path, rows: event.rows, rejected: event.rejected, firstOrdinal: event.firstOrdinal, lastOrdinal: event.lastOrdinal, classes: event.classes, checksum: event.shardSha256, checksumOk: true, ok: true, resumed: true };
  };
  const work = async () => {
    while (next < selected.length) {
      const i = next++;
      const entry = selected[i];
      let result = loadCheckpointResult(entry);
      if (result) resumedShards++;
      let attemptCount = 0;
      for (let attempt = 0; !result?.ok && attempt < 2; attempt++) {
        attemptCount++;
        result = await new Promise((resolve) => {
          const worker = new Worker(SELF, { workerData: { file: path.join(dir, entry.path), expected: entry } });
          worker.once('message', resolve);
          worker.once('error', (error) => resolve({ path: entry.path, rows: 0, rejected: 1, rejectionCodes: { WORKER_ERROR: String(error.message) }, ok: false }));
          worker.once('exit', (code) => { if (code !== 0) resolve({ path: entry.path, rows: 0, rejected: 1, rejectionCodes: { WORKER_EXIT: code }, ok: false }); });
        });
        const codes = Object.keys(result.rejectionCodes ?? {});
        const transient = codes.length > 0 && codes.every((code) => ['SHARD_READ_FAILURE', 'WORKER_ERROR', 'WORKER_EXIT'].includes(code));
        if (!result.ok && (!transient || attempt === 1)) break;
      }
      result.attemptCount = attemptCount;
      if (result?.ok && !result.resumed) appendCheckpoint(result, entry);
      results[i] = result;
      const done = i + 1;
      console.log(`[${Math.floor(done * 100 / Math.max(1, selected.length))}%] ${entry.path} rows=${result.rows}/${entry.rows} ok=${result.ok}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, work));
  let recomputedInputRoot = null;
  let inputRootFailure = null;
  try { recomputedInputRoot = await digestOrderedShards(dir, all); }
  catch (error) { inputRootFailure = String(error?.message ?? error).slice(0, 180); }
  const inputRootVerified = recomputedInputRoot === manifest.acceptedRootChecksum;
  const rows = results.reduce((n, result) => n + (result?.rows ?? 0), 0);
  const rejected = results.reduce((n, result) => n + (result?.rejected ?? 0), 0);
  const complete = selected.length === all.length;
  let ordinalContinuity = true;
  for (let i = 1; i < results.length; i++) {
    if (results[i - 1]?.lastOrdinal === null || results[i]?.firstOrdinal !== results[i - 1].lastOrdinal + 1) ordinalContinuity = false;
  }
  const conservation = complete && inputRootVerified && ordinalContinuity && rows === expectedTotal && rejected === 0 && results.every((result) => result?.ok);
  const classCounts = {};
  for (const result of results) for (const [key, count] of Object.entries(result.classes ?? {})) classCounts[key] = (classCounts[key] ?? 0) + count;
  const receipt = {
    schema: 'atlas.summary-fanout-receipt.v1', status: conservation ? 'FANOUT_CONSERVED' : 'FANOUT_PARTIAL_OR_FAILED',
    canonicalAuthority: false, inputManifest: path.relative(root, manifestPath).replaceAll('\\', '/'), inputRootChecksum: manifest.acceptedRootChecksum,
    requestedPercent: percent, selectedShards: selected.length, totalShards: all.length, concurrency,
    rowsRead: rows, expectedRows: expectedTotal, rejected, classificationCounts: classCounts,
    conservation, inputRootVerified, recomputedInputRoot, inputRootFailure, ordinalContinuity, perShard: results,
    checkpoint: { path: path.relative(root, checkpointPath).replaceAll('\\', '/'), runIdentity, resumedShards, verifiedShardCount: verifiedCheckpoint.size },
    startedAt, completedAt: new Date().toISOString(),
    writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0, modelCalls: 0 },
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ status: receipt.status, rowsRead: rows, expectedRows: expectedTotal, rejected, shards: `${selected.length}/${all.length}`, concurrency, receipt: path.relative(root, out).replaceAll('\\', '/') }, null, 2));
  process.exitCode = conservation ? 0 : 1;
}
