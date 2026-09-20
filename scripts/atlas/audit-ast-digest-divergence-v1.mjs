#!/usr/bin/env node
/**
 * AST_BF_18B read-only digest-divergence classifier.
 *
 * Separates admitted-snapshot mismatch from worktree status and KNOW-09 drift
 * metadata. It never stamps revisions or changes the admission receipt.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const inputPath = path.join(ROOT, 'docs/reports/ast-declaration-candidates-current-v1.json');
const know09Path = path.join(ROOT, '.tmp/knowledge-source-snapshot-live-v1.json');
const reportPath = path.join(ROOT, 'docs/reports/ast-digest-divergence-v1.json');
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const know09 = JSON.parse(fs.readFileSync(know09Path, 'utf8'));
const declaredDrift = new Set([
  ...(know09.worktreeMismatchRefs ?? []),
  ...(know09.missingWorktreeRefs ?? []),
].map((ref) => String(ref).toLowerCase()));

const gitStatus = (sourceRef) => {
  try {
    return execFileSync('git', ['status', '--porcelain=v1', '--', sourceRef], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'GIT_STATUS_UNAVAILABLE';
  }
};
const classify = (entry) => {
  const sourceRef = String(entry.sourceRef);
  const status = gitStatus(sourceRef);
  const statusCode = status.slice(0, 2);
  let classification = 'ADMITTED_SNAPSHOT_MISMATCH_REVIEW_REQUIRED';
  if (declaredDrift.has(sourceRef.toLowerCase())) classification = 'KNOW09_DRIFT_ALREADY_DECLARED';
  else if (statusCode && statusCode !== '??' && statusCode !== 'GIT') classification = 'WORKTREE_MODIFIED_SINCE_ADMITTED_SNAPSHOT';
  else if (statusCode === '??') classification = 'UNTRACKED_WORKTREE_SOURCE';
  else if (!fs.existsSync(path.join(ROOT, sourceRef))) classification = 'SOURCE_MISSING';
  return {
    ...entry,
    originalReceiptDeclaredDrift: entry.inKnow09DriftList === true,
    inKnow09DriftList: declaredDrift.has(sourceRef.toLowerCase()),
    classification,
    gitStatus: status || 'CLEAN',
    declaredInKnow09: declaredDrift.has(sourceRef.toLowerCase()),
  };
};

const sources = (input.digestDivergedSources ?? []).map(classify);
const byClassification = Object.groupBy ? Object.groupBy(sources, (row) => row.classification) : sources.reduce((acc, row) => {
  (acc[row.classification] ??= []).push(row); return acc;
}, {});
const report = {
  schema: 'atlas.ast-digest-divergence.v1',
  generatedAt: new Date().toISOString(),
  sourceReceipt: path.relative(ROOT, inputPath).replaceAll('\\', '/'),
  admittedSnapshotRevision: input.snapshotRevision,
  workspaceRevision: input.workspaceRevision,
  sourceCount: sources.length,
  byClassification: Object.fromEntries(Object.entries(byClassification).map(([key, value]) => [key, value.length])),
  sources,
  checksum: sha256(sources.map((row) => JSON.stringify(row)).sort().join('\n')),
  policy: {
    changedSinceAdmission: 'EXCLUDE_FROM_CANARY',
    know09Drift: 'RETAIN_AS_DECLARED_DRIFT; DO_NOT_STAMP',
    cleanButDivergent: 'REVIEW_REQUIRED',
    canonicalWritesAllowed: false,
  },
  canonicalAuthority: false,
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, sourceCount: report.sourceCount, byClassification: report.byClassification, writesPerformed: false }, null, 2));
