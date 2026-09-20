#!/usr/bin/env node

/**
 * Read-only disposition view for post-admission worktree drift.
 * This is an operator/review aid, never a source-authority resolver.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.env.ATLAS_REPO_ROOT ?? process.cwd());
const sourceReport = path.resolve(root, process.env.ATLAS_KNOWLEDGE_SOURCE_SNAPSHOT_REPORT ?? '.tmp/knowledge-source-snapshot-live-v1.json');
const reportPath = path.resolve(root, process.env.ATLAS_KNOWLEDGE_SOURCE_DRIFT_REPORT ?? '.tmp/knowledge-source-drift-disposition-v1.json');
const live = JSON.parse(fs.readFileSync(sourceReport, 'utf8'));

const gitOptions = { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
const tracked = new Set(execFileSync('git', ['ls-files'], gitOptions).split(/\r?\n/).filter(Boolean));
const modified = new Set(execFileSync('git', ['diff', '--name-only'], gitOptions).split(/\r?\n/).filter(Boolean).map((value) => value.replaceAll('\\', '/')));
const untracked = new Set(execFileSync('git', ['ls-files', '--others', '--exclude-standard'], gitOptions).split(/\r?\n/).filter(Boolean));
const normalize = (value) => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
const refs = [
  ...(live.worktreeMismatchRefs ?? []).map((sourceRef) => ({ sourceRef, evidence: 'CONTENT_MISMATCH' })),
  ...(live.missingWorktreeRefs ?? []).map((sourceRef) => ({ sourceRef, evidence: 'SOURCE_MISSING' })),
].map((row) => ({ ...row, sourceRef: normalize(row.sourceRef) }));

function disposition(row) {
  if (row.evidence === 'SOURCE_MISSING') return 'MISSING_ADMITTED_SOURCE';
  if (modified.has(row.sourceRef)) return 'TRACKED_IMPLEMENTATION_DRIFT';
  if (untracked.has(row.sourceRef)) return 'UNTRACKED_IMPLEMENTATION_DRIFT';
  if (row.sourceRef.startsWith('docs/reports/') || row.sourceRef.startsWith('memory/reports/')) return 'GENERATED_REPORT_DRIFT';
  if (tracked.has(row.sourceRef)) return 'TRACKED_UNCOMMITTED_OR_SUBMODULE_DRIFT';
  return 'EXTERNAL_OR_UNCLASSIFIED_DRIFT';
}

const rows = refs.map((row) => ({ ...row, disposition: disposition(row) }));
const counts = rows.reduce((out, row) => {
  out[row.disposition] = (out[row.disposition] ?? 0) + 1;
  return out;
}, {});
const body = {
  schema: 'atlas.knowledge-source-drift-disposition.v1',
  mode: 'READ_ONLY_OPERATOR_REVIEW',
  sourceReport,
  sourceReceiptChecksum: live.receiptChecksum ?? null,
  workspaceRevision: live.workspaceRevision ?? null,
  sourceRegistryParity: live.sourceRegistryParity === true,
  worktreeFingerprintParity: live.worktreeFingerprintParity === true,
  status: live.status === 'PROVEN' ? 'NO_DRIFT' : 'REVIEW_REQUIRED',
  counts,
  rows,
  canonicalAuthority: false,
  writesPerformed: false,
  mutationAuthorized: false,
  nextGate: live.status === 'PROVEN' ? 'KNOW-10-PAGE-REPLAY' : 'OPERATOR_DISPOSITION_OF_ADMITTED_WORKTREE_DRIFT',
};
const stable = (value) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.keys(item).sort().reduce((out, key) => { out[key] = item[key]; return out; }, {})
  : item);
const report = { ...body, reportChecksum: `sha256:${crypto.createHash('sha256').update(stable(body), 'utf8').digest('hex')}` };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, counts, writesPerformed: false, reportPath }, null, 2));
