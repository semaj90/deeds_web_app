#!/usr/bin/env node
/**
 * Artifact-only full legacy-summary hint embedding fanout.
 * Eligible input is limited to clean, non-quarantined legacy HINT rows.
 * PostgreSQL is read-only; output is sealed local NDJSON shards. No
 * canonical vector writes, RabbitMQ, Qdrant, Valkey, or retrieval votes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
const censusPath = path.resolve(REPO_ROOT, args.get('census') ?? '.tmp/atlas/summary-search-census-v1/20260926T063220Z/accepted-00001.ndjson');
const censusDir = args.get('census-dir') ? path.resolve(REPO_ROOT, args.get('census-dir')) : path.dirname(censusPath);
const endpoint = args.get('endpoint') ?? 'http://127.0.0.1:8097/embed';
const batchSize = Number(args.get('batch-size') ?? 32);
const shardRows = Number(args.get('shard-rows') ?? 1000);
const concurrency = Number(args.get('concurrency') ?? 1);
const runId = args.get('run-id');
const planOnly = args.has('plan-only');
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 32 || !Number.isInteger(shardRows) || shardRows < 1 || shardRows > 5000 || !Number.isInteger(concurrency) || concurrency !== 1) throw new Error('BOUNDS_INVALID: batch-size 1..32, shard-rows 1..5000, concurrency currently 1 (CPU inference endpoint)');
if (!runId || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(runId)) throw new Error('RUN_ID_REQUIRED: supply --run-id=<stable-id> for resumable shard output');
const outputDir = path.join(REPO_ROOT, '.tmp/atlas/legacy-summary-hint-vectors-v1', runId);
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const NL = String.fromCharCode(10);
const eligibleClasses = new Set(['LEGACY_HINT_LINEAGE_BOUND', 'LEGACY_HINT_UNQUALIFIED']);

async function* lines(file) {
  const input = fs.createReadStream(file, { encoding: 'utf8' }); let carry = '';
  for await (const part of input) { carry += part; let at; while ((at = carry.indexOf(NL)) >= 0) { const line = carry.slice(0, at); carry = carry.slice(at + 1); if (line.trim()) yield line; } }
  if (carry.trim()) yield carry;
}
const selected = [];
for (const name of fs.readdirSync(censusDir).filter((n) => /^accepted-\d+\.ndjson$/.test(n)).sort()) {
  for await (const line of lines(path.join(censusDir, name))) {
    const row = JSON.parse(line);
    if (eligibleClasses.has(row.summary?.state) && row.summary.quarantined === false && row.summary.qualityClean === true) selected.push({ ...row, chunkRowId: row.identity.chunkRowId, chunkId: row.identity.canonicalChunkId, summaryDigest: row.summary.digest, hintClass: row.summary.state });
  }
}
selected.sort((a, b) => a.chunkRowId.localeCompare(b.chunkRowId));
const eligibleDigest = sha(selected.map((r) => `${r.chunkRowId}\t${r.summaryDigest}\n`).join(''));
let existing = new Map();
if (fs.existsSync(outputDir)) {
  const old = path.join(outputDir, 'manifest.json');
  if (fs.existsSync(old)) {
    const m = JSON.parse(fs.readFileSync(old, 'utf8'));
    if (m.inputRootSha256 !== args.get('input-root') || m.eligibleSetSha256 !== eligibleDigest || m.endpoint !== endpoint || m.schema !== 'atlas.summary-hint-vector-fanout.v1') throw new Error('RESUME_MANIFEST_MISMATCH');
    for (const sh of m.shards ?? []) existing.set(sh.path, sh);
    for (const sh of existing.values()) {
      const bytes = fs.readFileSync(path.join(outputDir, sh.path));
      if (sha(bytes) !== sh.sha256) throw new Error(`RESUME_SHARD_CHECKSUM_MISMATCH:${sh.path}`);
    }
  } else {
    for (const receiptName of fs.readdirSync(outputDir).filter((n) => /^hint-vectors-\d+\.receipt\.json$/.test(n))) {
      const receipt = JSON.parse(fs.readFileSync(path.join(outputDir, receiptName), 'utf8'));
      const vectorFile = path.join(outputDir, receipt.shard.path);
      if (receipt.eligibleSetSha256 !== eligibleDigest || receipt.inputRootSha256 !== args.get('input-root') || !fs.existsSync(vectorFile) || sha(fs.readFileSync(vectorFile)) !== receipt.shard.sha256) throw new Error(`RESUME_RECEIPT_INVALID:${receiptName}`);
      existing.set(receipt.shard.path, receipt.shard);
    }
    const unexpected = fs.readdirSync(outputDir).filter((n) => !existing.has(n) && !/^hint-vectors-\d+\.receipt\.json$/.test(n));
    if (unexpected.length) throw new Error(`RESUME_UNSEALED_OUTPUT:${unexpected.join(',')}`);
  }
}
const censusManifestPath = path.join(censusDir, 'manifest.json');
const censusManifest = JSON.parse(fs.readFileSync(censusManifestPath, 'utf8'));
if (args.get('input-root') !== censusManifest.acceptedRootChecksum) throw new Error(`INPUT_ROOT_REQUIRED_OR_MISMATCH:provided=${args.get('input-root')} manifest=${censusManifest.acceptedRootChecksum} manifestPath=${censusManifestPath}`);
if (fs.existsSync(path.join(outputDir, 'manifest.json'))) {
  const sealed = JSON.parse(fs.readFileSync(path.join(outputDir, 'manifest.json'), 'utf8'));
  console.log(JSON.stringify({ status: sealed.status, outputDir: path.relative(REPO_ROOT, outputDir).split(path.sep).join('/'), generatedRows: sealed.generatedRows, failedRows: sealed.failedRows, alreadySealed: true }, null, 2));
  process.exit(sealed.status === 'ARTIFACT_ONLY_PROVEN' ? 0 : 2);
}
const plan = { status: 'PLAN', eligibleRows: selected.length, eligibleSetSha256: eligibleDigest, classes: Object.fromEntries([...eligibleClasses].map((c) => [c, selected.filter((r) => r.hintClass === c).length])), alreadySealedShards: existing.size, outputDir: path.relative(REPO_ROOT, outputDir).split(path.sep).join('/'), shardRows, batchSize, concurrency, endpoint, estimatedFloat32Bytes: selected.length * 768 * 4, canonicalAuthority: false, writes: { postgres: 0, qdrant: 0, valkey: 0, rabbitmq: 0 } };
if (planOnly) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
if (selected.length === 0) throw new Error('NO_ELIGIBLE_HINT_ROWS');
fs.mkdirSync(outputDir, { recursive: true });
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60000 });
const client = await pool.connect();
let dbRows;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  dbRows = (await client.query('SELECT id::text AS id, summary FROM public.codebase_chunk_index WHERE id = ANY($1::uuid[])', [selected.map((r) => r.chunkRowId)])).rows;
  await client.query('ROLLBACK');
} finally { client.release(); await pool.end(); }
const textById = new Map(dbRows.map((r) => [r.id, r.summary]));
const checkedInputs = selected.map((r) => ({ ...r, text: textById.get(r.chunkRowId) ?? null }));
const inputRejects = checkedInputs.filter((r) => !r.text || sha(r.text) !== r.summaryDigest).map((r) => ({ ordinal: r.ordinal, chunkRowId: r.chunkRowId, reason: !r.text ? 'CANONICAL_TEXT_MISSING' : 'SUMMARY_DIGEST_MISMATCH' }));
const inputs = checkedInputs.filter((r) => r.text && sha(r.text) === r.summaryDigest);
const rejectedInput = inputRejects.length;
const embed = async (texts) => {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts }), signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`EMBED_HTTP_${response.status}`);
  const body = await response.json(); if (!Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) throw new Error('EMBED_RESPONSE_SHAPE');
  return body.embeddings;
};
const root = crypto.createHash('sha256'); const shards = [...existing.values()].sort((a, b) => a.firstOrdinal - b.firstOrdinal); let failures = [];
for (let start = 0; start < inputs.length; start += shardRows) {
  const number = Math.floor(start / shardRows) + 1; const name = `hint-vectors-${String(number).padStart(5, '0')}.ndjson`;
  if (existing.has(name)) { root.update(fs.readFileSync(path.join(outputDir, name))); continue; }
  const sourceSlice = inputs.slice(start, start + shardRows); const reps = [];
  for (let at = 0; at < sourceSlice.length; at += batchSize) {
    const batch = sourceSlice.slice(at, at + batchSize); let vectors;
    try { vectors = await embed(batch.map((r) => r.text)); }
    catch (e) { if (batch.length > 1) { vectors = []; for (const row of batch) { try { vectors.push((await embed([row.text]))[0]); } catch (err) { vectors.push(null); failures.push({ chunkRowId: row.chunkRowId, ordinal: start + at + batch.indexOf(row), reason: String(err.message) }); } } } else { vectors = [null]; failures.push({ chunkRowId: batch[0].chunkRowId, ordinal: start + at, reason: String(e.message) }); } }
    for (let j = 0; j < batch.length; j++) {
      const v = vectors[j]; if (!Array.isArray(v) || v.length !== 768 || v.some((x) => !Number.isFinite(x))) { if (v) failures.push({ chunkRowId: batch[j].chunkRowId, ordinal: start + at + j, reason: 'VECTOR_INVALID_DIMENSION_OR_NONFINITE' }); continue; }
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)); if (Math.abs(norm - 1) > 1e-3) { failures.push({ chunkRowId: batch[j].chunkRowId, ordinal: start + at + j, reason: 'VECTOR_NORM_INVALID' }); continue; }
      const vectorBytes = Buffer.from(Float32Array.from(v).buffer);
      reps.push({ schema: 'atlas.summary-hint-representation.v1', canonicalAuthority: false, retrievalVoteAdded: false, ordinal: start + at + j, chunkRowId: batch[j].chunkRowId, chunkId: batch[j].chunkId ?? null, hintClass: batch[j].hintClass, summaryDigest: batch[j].summaryDigest, representationId: 'semantic_768', representationRevision: null, modelRevision: null, executor: 'go-embedding-service:8097', dimension: 768, norm, vectorDigest: sha(vectorBytes), vector: v });
    }
  }
  const body = reps.map((r) => JSON.stringify(r)).join(NL) + NL; const bytes = Buffer.from(body); const shard = { path: name, firstOrdinal: start, lastOrdinal: start + sourceSlice.length - 1, rows: reps.length, attempted: sourceSlice.length, sha256: sha(bytes) };
  fs.writeFileSync(path.join(outputDir, name), bytes, { flag: 'wx' });
  fs.writeFileSync(path.join(outputDir, `hint-vectors-${String(number).padStart(5, '0')}.receipt.json`), JSON.stringify({ schema: 'atlas.summary-hint-vector-shard-receipt.v1', inputRootSha256: args.get('input-root'), eligibleSetSha256: eligibleDigest, shard }, null, 2) + NL, { flag: 'wx' });
  root.update(bytes); shards.push(shard);
  console.log(JSON.stringify({ progressPct: Math.floor(100 * Math.min(start + sourceSlice.length, inputs.length) / inputs.length), completed: Math.min(start + sourceSlice.length, inputs.length), total: inputs.length, shard: name, accepted: reps.length, failed: sourceSlice.length - reps.length }));
}
const acceptedRows = shards.reduce((s, x) => s + x.rows, 0); const manifest = { schema: 'atlas.summary-hint-vector-fanout.v1', status: failures.length || rejectedInput || acceptedRows !== inputs.length ? 'PARTIAL_REQUIRES_REPLAY' : 'ARTIFACT_ONLY_PROVEN', canonicalAuthority: false, retrievalVoteAdded: false, inputRootSha256: args.get('input-root'), eligibleSetSha256: eligibleDigest, eligibleRows: selected.length, textDigestAccepted: inputs.length, rejectedInputRows: rejectedInput, rejectedInputs: inputRejects, generatedRows: acceptedRows, failedRows: failures.length + (inputs.length - acceptedRows - failures.length), classCounts: plan.classes, endpoint, executor: 'go-embedding-service:8097', modelRevision: null, representationId: 'semantic_768', representationRevision: null, shardRows, batchSize, concurrency, shards, vectorRootSha256: `sha256:${root.digest('hex')}`, failures, databaseWrites: 0, qdrantWrites: 0, valkeyWrites: 0, rabbitmqPublishes: 0, generatedAt: new Date().toISOString() };
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + NL, { flag: 'wx' });
console.log(JSON.stringify({ ...plan, status: manifest.status, textDigestAccepted: inputs.length, generatedRows: acceptedRows, failureCount: failures.length, manifestPath: path.relative(REPO_ROOT, path.join(outputDir, 'manifest.json')).split(path.sep).join('/') }, null, 2));
