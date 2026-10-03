#!/usr/bin/env node
/** Aggregate extractor receipts into a derived gap census; no service calls or canonical writes. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateSymbolBatchPlan, buildSymbolBaselineShards } from './lib/graphify-symbol-batch-plan-v1.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const option = key => args[args.indexOf(key) + 1];
if (!args.includes('--manifest') || !option('--manifest')) throw new Error('BASELINE_REPORT_MANIFEST_REQUIRED');
const manifestPath = path.resolve(root, option('--manifest'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
validateSymbolBatchPlan(manifest, manifest);
const expectedShards = buildSymbolBaselineShards(manifest).shards;
const directory = path.join(root, 'docs/reports');
const latest = new Map();
for (const name of fs.readdirSync(directory).filter(name => /^graphify-symbol-extractor-v1-\d+\.json$/.test(name))) {
  const bytes = fs.readFileSync(path.join(directory, name));
  const receipt = JSON.parse(bytes);
  if (receipt.frozenManifestChecksum !== manifest.planChecksum) continue;
  const shard = expectedShards.find(shard => shard.shardId === receipt.shard?.shardId);
  if (!shard || shard.shardChecksum !== receipt.shard.shardChecksum
    || receipt.shard.extractorRevision !== manifest.producerRevision) throw new Error('BASELINE_REPORT_SHARD_BINDING_INVALID');
  const previous = latest.get(shard.shardId);
  if (!previous || receipt.generatedAt > previous.receipt.generatedAt) latest.set(shard.shardId,
    { receipt, path: path.relative(root, path.join(directory, name)), checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}` });
}

const members = new Map();
for (const shard of expectedShards) {
  const record = latest.get(shard.shardId);
  if (!record) continue;
  const allowed = new Map(manifest.rows.slice(shard.offset, shard.offset + shard.maxFiles).map(row => [row.fileId, row]));
  for (const member of record.receipt.frozenMemberChecks ?? []) {
    const expected = allowed.get(member.fileId);
    if (!expected || expected.sourceRef !== member.sourceRef || expected.sourceRevision !== member.sourceRevision
      || members.has(member.fileId)) throw new Error('BASELINE_REPORT_MEMBER_BINDING_INVALID');
    const observation = record.receipt.plan.find(row => row.fileId === member.fileId);
    const readback = record.receipt.readbacks.find(row => row.fileId === member.fileId);
    let outcome = member.extractionOutcome;
    if (!outcome) outcome = member.byteCheck === false ? 'REVISION_DRIFTED'
      : member.byteCheck === 'MISSING' ? 'SOURCE_MISSING'
      : member.byteCheck === 'READ_ERROR' ? 'SOURCE_READ_ERROR'
      : record.receipt.fatalError ? 'NOT_ATTEMPTED_BATCH_FAILURE' : member.status;
    members.set(member.fileId, { ...expected, shardId: shard.shardId, outcome,
      readbackProven: member.readbackProven === true && readback?.proven === true,
      reason: observation?.error ?? record.receipt.fatalError ?? null,
      readbackRejects: readback?.rejects ?? [], receiptPath: record.path });
  }
}
const rows = manifest.rows.map(row => members.get(row.fileId) ?? { ...row, outcome: 'SHARD_NOT_VISITED', readbackProven: false });
const gaps = rows.filter(row => !row.readbackProven);
const outcomeCounts = {};
for (const row of rows) outcomeCounts[row.outcome] = (outcomeCounts[row.outcome] ?? 0) + 1;
const summary = {
  schema: 'atlas.graphify-symbol-baseline-report.v1', generatedAt: new Date().toISOString(),
  basis: 'EXTRACTOR_RECEIPT_READBACK_SNAPSHOTS_NOT_FRESH_DATABASE_AUDIT',
  manifestPath: path.relative(root, manifestPath), manifestChecksum: manifest.planChecksum,
  workspaceRevision: manifest.workspaceRevision, producerRevision: manifest.producerRevision,
  rowCount: manifest.rowCount, visitedMembers: members.size,
  independentlyVerifiedMembers: rows.length - gaps.length, unresolvedMembers: gaps.length,
  shardCount: expectedShards.length, shardsWithReceipts: latest.size,
  shardsReadbackProven: [...latest.values()].filter(record => record.receipt.shardCompletionProven).length,
  baselineSealProven: gaps.length === 0 && members.size === manifest.rowCount,
  outcomeCounts, receipts: [...latest.values()].map(({ path, checksum }) => ({ path, checksum })),
  canonicalAuthority: false, datastoreWrites: false, projectionAdmissionPromoted: false,
};
const output = path.join(directory, `graphify-symbol-baseline-report-${Date.now()}`);
fs.mkdirSync(output);
fs.writeFileSync(path.join(output, 'gaps.json'), JSON.stringify({
  schema: 'atlas.graphify-symbol-baseline-gaps.v1', manifestChecksum: manifest.planChecksum, gaps,
}, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...summary, receipts: undefined, reportDirectory: path.relative(root, output) }, null, 2));
