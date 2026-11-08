#!/usr/bin/env node
// READ-ONLY delta between two crosswalk.jsonl files (see crosswalk-lowrank-cohort-to-tasks-v1.mjs), so a re-run emits only what changed
// instead of rewriting the whole crosswalk.
//
// Identity of a row = its workboard `stableKey` when resolved (a content hash that survives line shifts), otherwise its
// `<path>#L<line>` task id. The ORDINAL IS DELIBERATELY NOT PART OF A ROW'S IDENTITY OR DIGEST: it is a position in one frozen cohort file,
// so inserting one task early would otherwise "change" thousands of unrelated rows. Ordinals are re-derived from the cohort order on read.
// A row whose identity switches (unresolved -> resolved) is reported as REMOVED(old key) + ADDED(new key), never as an in-place edit.
// The delta is verified by applying it to PREV and comparing digests with NEXT before it is reported as good.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256Hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const rowIdentity = (row) => (row.stableKey ? `sk:${row.stableKey}` : `tid:${row.taskId}`);
// Canonical, ordinal-free digest of everything that describes the mapping.
export const rowDigest = (row) => sha256Hex(JSON.stringify([row.taskId, row.source ?? null, row.line ?? null, row.stableKey ?? null, row.workboardState ?? null, row.status, row.candidates ?? null]));

function indexRows(rows, label) {
  const map = new Map();
  for (const r of rows) {
    const id = rowIdentity(r);
    if (map.has(id)) throw new Error(`CROSSWALK_DUPLICATE_IDENTITY_${label}:${id}`);
    map.set(id, r);
  }
  return map;
}

export function diffCrosswalk(prevRows, nextRows) {
  const prev = indexRows(prevRows, 'PREV'), next = indexRows(nextRows, 'NEXT');
  const ops = [];
  let unchanged = 0;
  for (const [id, after] of next) {
    const before = prev.get(id);
    if (!before) ops.push({ op: 'ADDED', key: id, after: stripOrdinal(after) });
    else if (rowDigest(before) !== rowDigest(after)) ops.push({ op: 'CHANGED', key: id, before: stripOrdinal(before), after: stripOrdinal(after) });
    else unchanged++;
  }
  for (const [id, before] of prev) if (!next.has(id)) ops.push({ op: 'REMOVED', key: id, before: stripOrdinal(before) });
  return { ops, unchanged };
}
const stripOrdinal = ({ ordinal, ...rest }) => rest;

/** Applies a delta to PREV rows; returns a Map identity -> ordinal-free row. */
export function applyDelta(prevRows, ops) {
  const map = new Map(prevRows.map((r) => [rowIdentity(r), stripOrdinal(r)]));
  for (const o of ops) {
    if (o.op === 'REMOVED') { if (!map.delete(o.key)) throw new Error(`DELTA_REMOVE_MISSING:${o.key}`); }
    else if (o.op === 'ADDED') { if (map.has(o.key)) throw new Error(`DELTA_ADD_EXISTS:${o.key}`); map.set(o.key, o.after); }
    else if (o.op === 'CHANGED') { if (!map.has(o.key)) throw new Error(`DELTA_CHANGE_MISSING:${o.key}`); map.set(o.key, o.after); }
    else throw new Error(`DELTA_UNKNOWN_OP:${o.op}`);
  }
  return map;
}

export function verifyDelta(prevRows, nextRows, ops) {
  const applied = applyDelta(prevRows, ops);
  const expected = new Map(nextRows.map((r) => [rowIdentity(r), rowDigest(r)]));
  if (applied.size !== expected.size) return false;
  for (const [id, row] of applied) if (expected.get(id) !== rowDigest(row)) return false;
  return true;
}

function main() {
  const argOf = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const prevPath = argOf('--prev'), nextPath = argOf('--next');
  if (!prevPath || !nextPath) { console.error('usage: --prev <crosswalk.jsonl> --next <crosswalk.jsonl> [--out-dir <dir>]'); process.exit(1); }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const outDir = path.resolve(argOf('--out-dir') ?? path.join(root, '.tmp', 'atlas', `crosswalk-delta-${stamp}`));
  const read = (p) => { const raw = fs.readFileSync(path.resolve(p)); return { raw, rows: raw.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) }; };
  const prev = read(prevPath), next = read(nextPath);
  const { ops, unchanged } = diffCrosswalk(prev.rows, next.rows);
  const verified = verifyDelta(prev.rows, next.rows, ops);
  const body = ops.map((o) => JSON.stringify(o)).join('\n') + (ops.length ? '\n' : '');
  const counts = ops.reduce((a, o) => ({ ...a, [o.op]: (a[o.op] ?? 0) + 1 }), {});
  const receipt = {
    schema: 'atlas.crosswalk-delta-receipt.v1', generatedAt: new Date().toISOString(),
    prevSha256: `sha256:${sha256Hex(prev.raw)}`, nextSha256: `sha256:${sha256Hex(next.raw)}`, deltaSha256: `sha256:${sha256Hex(body)}`,
    prevRows: prev.rows.length, nextRows: next.rows.length, unchanged, opCounts: counts, opTotal: ops.length,
    deltaBytes: Buffer.byteLength(body), nextBytes: next.raw.length, applyVerifiedAgainstNext: verified,
    ordinalNote: 'Ordinals are not part of a row identity or digest; they are re-derived from cohort order.',
    canonicalAuthority: false, writesPerformed: false, localArtifactsWritten: true,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'crosswalk-delta.jsonl'), body, { flag: 'wx' });
  fs.writeFileSync(path.join(outDir, 'crosswalk-delta-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(`delta: ${ops.length} ops (${JSON.stringify(counts)}), ${unchanged} unchanged, verified=${verified} -> ${outDir}`);
  process.exit(verified ? 0 : 3);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
