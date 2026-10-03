#!/usr/bin/env node
// WB-REPORT-MANIFEST-01: split the large Workboard ledger into deterministic shards plus a
// manifest (SHA-256, byte and row counts). Read-only on the input; writes only under --out
// (default: gitignored .tmp/atlas/workboard-shards). Never edits docs/reports.
//
//   node scripts/atlas/build-workboard-report-manifest-v1.mjs [--in file] [--out dir]
//        [--shard-bytes N] [--dry-run]
//
// Layout: `core.json` holds every small top-level key; each key above --section-bytes becomes
// its own section shard; arrays of objects over the cap (taskInventory) become JSONL row shards.
// The round trip is checked against the canonical LF serialization (the source may be CRLF); both
// the raw and canonical SHA-256 are recorded.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST_SCHEMA = 'atlas.workboard-report-manifest.v1';
const DEFAULT_SHARD_BYTES = 4 * 1024 * 1024;
const DEFAULT_SECTION_BYTES = 256 * 1024;

const sha256 = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
const byteLength = (text) => Buffer.byteLength(text, 'utf8');

export function serializeLedger(ledger) {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}

/** Pure: split a parsed ledger into { shards: [{id,kind,key,file,content,...}], keyOrder }. */
export function splitLedger(ledger, { shardBytes = DEFAULT_SHARD_BYTES, sectionBytes = DEFAULT_SECTION_BYTES } = {}) {
  const keyOrder = Object.keys(ledger);
  const core = {};
  const shards = [];
  for (const key of keyOrder) {
    const value = ledger[key];
    const compact = JSON.stringify(value);
    if (byteLength(compact) <= sectionBytes) {
      core[key] = value;
      continue;
    }
    const isRowArray = Array.isArray(value) && value.every((row) => row && typeof row === 'object' && !Array.isArray(row));
    if (isRowArray && byteLength(compact) > shardBytes) {
      let part = 0;
      let rows = [];
      let size = 0;
      const flush = () => {
        if (!rows.length) return;
        const content = `${rows.join('\n')}\n`;
        shards.push({
          id: `${key}.${String(part).padStart(4, '0')}`,
          kind: 'ROWS_JSONL',
          key,
          file: `${key}.${String(part).padStart(4, '0')}.jsonl`,
          content,
          rowCount: rows.length
        });
        part += 1;
        rows = [];
        size = 0;
      };
      for (const row of value) {
        const line = JSON.stringify(row);
        if (size + byteLength(line) + 1 > shardBytes) flush();
        rows.push(line);
        size += byteLength(line) + 1;
      }
      flush();
    } else {
      shards.push({ id: key, kind: 'SECTION_JSON', key, file: `${key}.json`, content: `${compact}\n`, rowCount: Array.isArray(value) ? value.length : null });
    }
  }
  shards.unshift({ id: 'core', kind: 'CORE_JSON', key: null, file: 'core.json', content: `${JSON.stringify(core)}\n`, rowCount: null });
  return { shards, keyOrder };
}

/** Pure: rebuild the ledger from shard contents (a map of id -> content) and the manifest. */
export function reassembleLedger(manifest, contentById) {
  const ledger = {};
  const sections = {};
  for (const shard of manifest.shards) {
    const content = contentById.get(shard.id);
    if (content === undefined) throw new Error(`missing shard ${shard.id}`);
    if (sha256(content) !== shard.sha256) throw new Error(`checksum mismatch ${shard.id}`);
    if (shard.kind === 'CORE_JSON') Object.assign(ledger, JSON.parse(content));
    else if (shard.kind === 'SECTION_JSON') ledger[shard.key] = JSON.parse(content);
    else {
      sections[shard.key] ??= [];
      for (const line of content.split('\n')) if (line) sections[shard.key].push(JSON.parse(line));
    }
  }
  Object.assign(ledger, sections);
  return Object.fromEntries(manifest.keyOrder.map((key) => [key, ledger[key]]));
}

export function buildManifest(sourceText, ledger, split, { inputPath = 'docs/reports/openspec-workboard-v1.json' } = {}) {
  return {
    schema: MANIFEST_SCHEMA,
    source: {
      path: inputPath,
      sha256: sha256(sourceText),
      bytes: byteLength(sourceText),
      eol: sourceText.includes('\r\n') ? 'CRLF' : 'LF',
      canonicalSha256: sha256(serializeLedger(ledger)),
      generatedAt: ledger.generatedAt ?? null
    },
    counts: {
      tasks: Array.isArray(ledger.taskInventory) ? ledger.taskInventory.length : 0,
      shards: split.shards.length
    },
    keyOrder: split.keyOrder,
    shards: split.shards.map(({ id, kind, key, file, content, rowCount }) => ({
      id, kind, key, file, rowCount, bytes: byteLength(content), sha256: sha256(content)
    })),
    canonicalAuthority: false,
    note: 'Audit artifact. Shards are rebuildable from the source ledger; the manifest is the committed index.'
  };
}

function parseArgs(argv) {
  const args = { in: 'docs/reports/openspec-workboard-v1.json', out: '.tmp/atlas/workboard-shards', shardBytes: DEFAULT_SHARD_BYTES, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--in') args.in = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--shard-bytes') args.shardBytes = Number(argv[++i]);
    else if (a === '--dry-run') args.dryRun = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!Number.isInteger(args.shardBytes) || args.shardBytes < 1024) throw new Error('--shard-bytes must be an integer >= 1024');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceText = readFileSync(resolve(args.in), 'utf8');
  const ledger = JSON.parse(sourceText);
  const split = splitLedger(ledger, { shardBytes: args.shardBytes });
  const manifest = buildManifest(sourceText, ledger, split, { inputPath: args.in.replace(/\\/g, '/') });
  const contents = new Map(split.shards.map((s) => [s.id, s.content]));
  const rebuilt = serializeLedger(reassembleLedger(manifest, contents));
  const roundTrip = sha256(rebuilt) === manifest.source.canonicalSha256;
  const oversize = manifest.shards.filter((s) => s.bytes > 10 * 1024 * 1024).map((s) => s.id);
  if (!args.dryRun) {
    const out = resolve(args.out);
    mkdirSync(out, { recursive: true });
    for (const shard of split.shards) writeFileSync(join(out, shard.file), shard.content, 'utf8');
    writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify({
    status: roundTrip && oversize.length === 0 ? 'OK' : 'FAILED',
    dryRun: args.dryRun,
    out: args.dryRun ? null : args.out,
    sourceBytes: manifest.source.bytes,
    shards: manifest.counts.shards,
    maxShardBytes: Math.max(...manifest.shards.map((s) => s.bytes)),
    oversizeShards: oversize,
    roundTripMatchesSource: roundTrip,
    writesOutsideOut: false
  }, null, 2));
  if (!roundTrip || oversize.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
