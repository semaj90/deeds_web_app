#!/usr/bin/env node
/**
 * Multicore, bounded, read-only shard smoke runner (fanout 0-100%).
 * Fans NDJSON shards out to a worker_threads pool (default: cpus-1, max 8), each worker streams its shard and
 * validates rows; the parent aggregates counts, prints a 0-100% progress line per finished shard and writes a receipt.
 * No database, Qdrant or Valkey access. A failing shard is recorded (value null + reason) and the run continues; the
 * overall status is PASS only if every shard passed (null is never counted as pass).
 *
 * Usage: node scripts/atlas/run-parallel-shard-smoke-v1.mjs --dir=<shard dir> [--glob=.ndjson] [--concurrency=N]
 *        [--require=packet_key,source_ref] [--summary-field=summary] [--out=docs/reports/parallel-shard-smoke-v1.json]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { analyzeSummaryContaminationV1 } from './lib/summary-quality-v1.mjs';

const SELF = fileURLToPath(import.meta.url);

async function scanShard({ file, required, summaryField }) {
  const r = { file: path.basename(file), rows: 0, badJson: 0, missingRequired: 0, duplicateKeys: 0, summaries: 0, summariesClean: 0, ok: false, reason: null };
  const seen = new Set();
  try {
    const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      let o;
      try { o = JSON.parse(line); } catch { r.badJson++; continue; }
      r.rows++;
      if (required.some((k) => o[k] === undefined || o[k] === null || o[k] === '')) r.missingRequired++;
      const key = required.length ? required.map((k) => String(o[k])).join('|') : null;
      if (key) { if (seen.has(key)) r.duplicateKeys++; else seen.add(key); }
      const s = summaryField ? o[summaryField] : null;
      if (typeof s === 'string' && s.trim()) { r.summaries++; if (analyzeSummaryContaminationV1(s).clean) r.summariesClean++; }
    }
    r.ok = r.rows > 0 && r.badJson === 0 && r.missingRequired === 0 && r.duplicateKeys === 0;
    if (!r.ok) r.reason = r.rows === 0 ? 'EMPTY_SHARD' : 'ROW_VALIDATION_FAILED';
  } catch (e) {
    r.reason = `SHARD_READ_FAILURE:${String(e.message).slice(0, 80)}`;
  }
  return r;
}

if (!isMainThread) {
  scanShard(workerData).then((res) => parentPort.postMessage(res));
} else {
  const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
  const dir = args.get('dir');
  if (!dir) { console.error('--dir required'); process.exit(2); }
  const suffix = args.get('glob') ?? '.ndjson';
  const required = (args.get('require') ?? '').split(',').filter(Boolean);
  const summaryField = args.get('summary-field') ?? null;
  const concurrency = Math.max(1, Math.min(8, Number(args.get('concurrency') ?? Math.max(1, os.cpus().length - 1))));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(suffix)).sort().map((f) => path.join(dir, f));
  const started = Date.now();
  const results = new Array(files.length).fill(null);
  let next = 0; let done = 0;

  const runOne = (idx) => new Promise((resolve) => {
    const w = new Worker(SELF, { workerData: { file: files[idx], required, summaryField } });
    let settled = false;
    const finish = (res) => {
      if (settled) return; settled = true;
      results[idx] = res; done++;
      console.log(`[${String(Math.round((done / files.length) * 100)).padStart(3)}%] ${res.file} rows=${res.rows} ok=${res.ok}${res.reason ? ' reason=' + res.reason : ''}`);
      resolve();
    };
    w.once('message', finish);
    w.once('error', (e) => finish({ file: path.basename(files[idx]), rows: 0, ok: false, reason: `WORKER_ERROR:${String(e.message).slice(0, 80)}` }));
    w.once('exit', (c) => { if (c !== 0) finish({ file: path.basename(files[idx]), rows: 0, ok: false, reason: `WORKER_EXIT_${c}` }); });
  });
  const lane = async () => { while (next < files.length) await runOne(next++); };
  console.log(`shards=${files.length} concurrency=${concurrency}`);
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, lane));

  const sum = (k) => results.reduce((n, r) => n + (r?.[k] ?? 0), 0);
  const receipt = {
    schema: 'atlas.parallel-shard-smoke.v1', dir: path.resolve(dir), shards: files.length, concurrency,
    status: files.length > 0 && results.every((r) => r?.ok) ? 'PASS' : 'FAIL',
    passed: results.filter((r) => r?.ok).length, failed: results.filter((r) => r && !r.ok).length,
    totals: { rows: sum('rows'), badJson: sum('badJson'), missingRequired: sum('missingRequired'), duplicateKeysWithinShard: sum('duplicateKeys'), summaries: sum('summaries'), summariesClean: sum('summariesClean') },
    elapsedMs: Date.now() - started, perShard: results, databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0,
  };
  const out = args.get('out');
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, JSON.stringify(receipt, null, 2)); }
  console.log(JSON.stringify({ status: receipt.status, passed: receipt.passed, failed: receipt.failed, totals: receipt.totals, elapsedMs: receipt.elapsedMs }));
  process.exit(receipt.status === 'PASS' ? 0 : 1);
}
