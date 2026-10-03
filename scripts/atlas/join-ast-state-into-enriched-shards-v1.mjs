#!/usr/bin/env node

/**
 * Local-only: derive a new sealed shard set from the latest enriched-index shards by joining
 * per-source AST capability rows (from audit-current-workspace-ast-lineage-v1 --emit-rows).
 * Exact sourceRef match. AST state is a feature lane; it never changes lineageState.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO_ROOT } from './connection-config.mjs';

const shardRoot = path.join(REPO_ROOT, '.tmp/atlas/current-enriched-index-shards-v1');
const srcDir = process.argv[2] ?? fs.readdirSync(shardRoot).sort().at(-1);
const rowsPath = path.join(REPO_ROOT, process.argv[3] ?? '.tmp/atlas/current-ast-capability-rows-v1.ndjson');
const manifest = JSON.parse(fs.readFileSync(path.join(shardRoot, srcDir, 'manifest.json'), 'utf8'));

const ast = new Map();
for (const line of fs.readFileSync(rowsPath, 'utf8').split('\n')) if (line) { const r = JSON.parse(line); ast.set(r.sourceRef, r); }

const STATE = {
  NOT_AST_ELIGIBLE: 'NOT_APPLICABLE',
  ELIGIBLE_PARSER_UNAVAILABLE: 'PARSER_UNAVAILABLE',
  ELIGIBLE_NOT_TRAVERSED: 'NOT_MATERIALIZED',
  TRAVERSED_PARSE_FAILED: 'PARSE_FAILED',
  LEGACY_PRODUCER_ROWS_UNQUALIFIED: 'LINEAGE_UNQUALIFIED',
  PARSED_NOT_REVISION_QUALIFIED: 'LINEAGE_UNQUALIFIED',
  REVISION_QUALIFIED_AST: 'REVISION_QUALIFIED',
  SYMBOL_RESOLVED: 'SYMBOL_RESOLVED',
};

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(shardRoot, stamp);
fs.mkdirSync(outDir, { recursive: true });
const shards = []; let total = 0; let unmatched = 0; const tally = {};
for (const s of manifest.shards) {
  const out = [];
  for (const line of fs.readFileSync(path.join(shardRoot, srcDir, s.path), 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    const a = ast.get(r.sourceRef);
    if (!a) { unmatched += 1; r.astState = 'NOT_JOINED_NO_MATCHING_ROW'; }
    else {
      const eligibility = a.capabilityOutcome === 'NOT_AST_ELIGIBLE' ? 'NOT_ELIGIBLE' : 'ELIGIBLE';
      if (eligibility !== r.astEligibility) throw new Error(`AST_ELIGIBILITY_DISAGREES:${r.sourceRef}`);
      r.astState = STATE[a.capabilityOutcome] ?? 'UNKNOWN_OUTCOME';
      r.astLineageClass = a.lineageClass;
    }
    tally[r.astState] = (tally[r.astState] ?? 0) + 1;
    out.push(JSON.stringify(r)); total += 1;
  }
  const body = out.join('\n') + '\n';
  fs.writeFileSync(path.join(outDir, s.path), body, { flag: 'wx' });
  shards.push({ path: s.path, records: out.length, sha256: crypto.createHash('sha256').update(body).digest('hex') });
}
const rootSha256 = crypto.createHash('sha256').update(shards.map((s) => `${s.path}:${s.sha256}`).join('\n')).digest('hex');
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ schema: 'atlas.enriched-index-shards-manifest.v1', workspaceRevision: manifest.workspaceRevision, executionId: manifest.executionId, records: total, shards, rootSha256, derivedFrom: { dir: srcDir, rootSha256: manifest.rootSha256 }, astRows: path.relative(REPO_ROOT, rowsPath) }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ outDir: path.relative(REPO_ROOT, outDir), records: total, unmatched, astStates: tally, rootSha256 }, null, 2));
