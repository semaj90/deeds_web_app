#!/usr/bin/env node

/**
 * Read-only bridge between the admitted-source mismatch list and git status.
 * This explains whether a mismatch is visible as local worktree state; it
 * does not decide that the worktree is authoritative.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const parityPath = path.join(ROOT, 'docs/reports/ast-source-parity-disposition-v1.json');
const outputPath = path.join(ROOT, 'docs/reports/ast-source-parity-worktree-v1.json');
const parity = JSON.parse(fs.readFileSync(parityPath, 'utf8'));
const normalize = (value) => String(value).replaceAll('\\', '/').replace(/^\.\//, '');
const rel = (filePath) => path.relative(ROOT, filePath).replaceAll('\\', '/');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const names = (args) => execFileSync('git', args, {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
})
  .split(/\r?\n/).map(normalize).filter(Boolean);

const modified = new Set(names(['diff', '--name-only']));
const staged = new Set(names(['diff', '--cached', '--name-only']));
const untracked = new Set(names(['ls-files', '--others', '--exclude-standard']));
const deleted = new Set(names(['ls-files', '--deleted']));
// The disposition receipt stores the count/checksum, not the full list. Use
// the original KNOW-09 receipt as the complete reference source.
const sourceSnapshotPath = path.join(ROOT, '.tmp/knowledge-source-snapshot-live-v1.json');
const sourceSnapshot = JSON.parse(fs.readFileSync(sourceSnapshotPath, 'utf8'));
const refs = (sourceSnapshot.worktreeMismatchRefs ?? []).map(normalize);
const classify = (ref) => {
  if (deleted.has(ref) || !fs.existsSync(path.join(ROOT, ref))) return 'MISSING_OR_DELETED';
  if (untracked.has(ref)) return 'UNTRACKED';
  if (modified.has(ref) || staged.has(ref)) return 'WORKTREE_MODIFIED';
  return 'NOT_VISIBLE_IN_GIT_STATUS';
};
const classifications = refs.map((sourceRef) => ({ sourceRef, disposition: classify(sourceRef) }));
const byDisposition = Object.fromEntries(Object.entries(Object.groupBy(classifications, (row) => row.disposition))
  .map(([key, rows]) => [key, rows.length]));
const receipt = {
  schema: 'atlas.ast-source-parity-worktree.v1',
  generatedAt: new Date().toISOString(),
  input: {
    sourceParityReceipt: rel(parityPath),
    sourceSnapshot: rel(sourceSnapshotPath),
    mismatchCount: refs.length,
    mismatchReferenceChecksum: sha256(JSON.stringify([...refs].sort())),
    gitModifiedCount: modified.size,
    gitStagedCount: staged.size,
    gitUntrackedCount: untracked.size,
    gitDeletedCount: deleted.size,
  },
  byDisposition,
  samples: Object.fromEntries(Object.keys(byDisposition).map((key) => [key, classifications.filter((row) => row.disposition === key).slice(0, 20)])),
  status: refs.length === Number(parity.input?.declaredMismatchCount ?? -1) ? 'MISMATCH_COHORT_RECONCILED' : 'MISMATCH_COHORT_INCOMPLETE',
  authority: 'DIAGNOSTIC_ONLY',
  canonicalAuthority: false,
  writesPerformed: false,
};
receipt.checksum = sha256(JSON.stringify({ ...receipt, generatedAt: undefined, checksum: undefined }));
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ reportPath: outputPath, status: receipt.status, byDisposition, writesPerformed: false }, null, 2));
