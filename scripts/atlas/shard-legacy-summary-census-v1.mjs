#!/usr/bin/env node
/**
 * SUMMARY-CENSUS-02 (offline, no DB/model/network): re-shards a legacy-summary census NDJSON into fixed-size sealed shards
 * with per-shard sha256 and a root checksum over the ordered shard checksums. Row order is preserved (census is keyset ordered).
 * Usage: node scripts/atlas/shard-legacy-summary-census-v1.mjs --census=<ndjson> [--rows-per-shard=5000]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO_ROOT } from './connection-config.mjs';

const args = new Map(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)]; }));
const censusPath = path.resolve(REPO_ROOT, args.get('census') ?? '.tmp/atlas/legacy-summary-census-v1/census-20260926T060809Z.ndjson');
const per = Number(args.get('rows-per-shard') ?? 5000);
const NL = String.fromCharCode(10);
const sha = (s) => `sha256:${crypto.createHash('sha256').update(s, 'utf8').digest('hex')}`;

const lines = fs.readFileSync(censusPath, 'utf8').split(NL).filter((l) => l.trim());
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const dir = path.join(REPO_ROOT, '.tmp/atlas/legacy-summary-census-shards-v1', stamp);
fs.mkdirSync(dir, { recursive: true });

const shards = [];
const seen = new Set();
let dup = 0;
for (let i = 0, n = 1; i < lines.length; i += per, n++) {
  const slice = lines.slice(i, i + per);
  for (const l of slice) { const id = JSON.parse(l).chunkRowId; if (seen.has(id)) dup++; seen.add(id); }
  const name = `census-shard-${String(n).padStart(5, '0')}.ndjson`;
  const body = slice.join(NL) + NL;
  fs.writeFileSync(path.join(dir, name), body, { flag: 'wx' });
  shards.push({ path: name, rows: slice.length, sha256: sha(body) });
}
const manifest = {
  schema: 'atlas.legacy-summary-census-shard-set.v1', source: path.relative(REPO_ROOT, censusPath).split(path.sep).join('/'), sourceSha256: sha(fs.readFileSync(censusPath, 'utf8')),
  rowsPerShard: per, totalRows: lines.length, uniqueChunkRowIds: seen.size, duplicateChunkRowIds: dup, shardCount: shards.length,
  rootChecksum: sha(shards.map((s) => s.sha256).join(NL)), shards, databaseWrites: 0, generatedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + NL, { flag: 'wx' });
console.log(JSON.stringify({ dir: path.relative(REPO_ROOT, dir).split(path.sep).join('/'), ...manifest, shards: undefined }, null, 1));
