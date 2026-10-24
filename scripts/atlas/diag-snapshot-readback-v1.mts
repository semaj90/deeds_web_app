#!/usr/bin/env tsx
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { relative, resolve, sep } from 'node:path';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';
import { buildWorkspaceLiveReadbackReceiptV1, verifyWorkspaceLiveReadbackReceiptV1 } from './lib/workspace-live-readback-receipt-v1.mjs';

const root = process.cwd();
const admissionRelativePath = 'docs/reports/workspace-revision-tournament-admission-v1.json';
const admissionBytes = readFileSync(resolve(root, admissionRelativePath));
const admission = JSON.parse(admissionBytes.toString('utf8'));
const snapshotPath = resolve(admission.manifestPath);
const scratchRoot = resolve(root, '.tmp/atlas/workspace-snapshot-scratch-v1');
const snapshotRelativePath = relative(scratchRoot, snapshotPath);
if (!snapshotRelativePath || snapshotRelativePath.startsWith(`..${sep}`) || snapshotRelativePath === '..') {
  throw new Error('ADMISSION_MANIFEST_OUTSIDE_SCRATCH_ROOT');
}
const snapshotBytes = readFileSync(snapshotPath);
const manifestSha256 = `sha256:${createHash('sha256').update(snapshotBytes).digest('hex')}`;
if (manifestSha256 !== admission.manifestSha256) throw new Error('ADMISSION_MANIFEST_DIGEST_MISMATCH');
const snapshot = JSON.parse(snapshotBytes.toString('utf8'));
const readback = validateSnapshot(snapshot);
const manifestPath = relative(root, snapshotPath).split(sep).join('/');
const receipt = buildWorkspaceLiveReadbackReceiptV1({
  admission,
  admissionReceiptSha256: `sha256:${createHash('sha256').update(admissionBytes).digest('hex')}`,
  manifestPath,
  manifestSha256,
  snapshot,
  readback,
  capturedAt: new Date().toISOString(),
});
const receiptDirectory = resolve(root, '.tmp/atlas/workspace-snapshot-scratch-v1/live-readback');
mkdirSync(receiptDirectory, { recursive: true });
const receiptName = `readback-${receipt.capturedAt.replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID()}.json`;
const receiptPath = resolve(receiptDirectory, receiptName);
const descriptor = openSync(receiptPath, 'wx');
try {
  writeFileSync(descriptor, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  fsyncSync(descriptor);
} finally {
  closeSync(descriptor);
}
const savedBytes = readFileSync(receiptPath);
const savedReceipt = JSON.parse(savedBytes.toString('utf8'));
verifyWorkspaceLiveReadbackReceiptV1(savedReceipt);
if (savedReceipt.receiptChecksum !== receipt.receiptChecksum) throw new Error('READBACK_RECEIPT_READBACK_MISMATCH');
console.log(JSON.stringify({
  path: relative(root, receiptPath).split(sep).join('/'),
  receiptChecksum: savedReceipt.receiptChecksum,
  manifestPath,
  manifestSha256,
  snapshotRevision: snapshot.snapshotRevision,
  status: readback.status,
  sourceCount: readback.sourceCount,
  exactMatches: readback.exactMatches,
  violationCounts: readback.violationCounts,
  workspaceAuthority: savedReceipt.verdict.workspaceAuthority,
  firstFailingBoundary: savedReceipt.verdict.firstFailingBoundary,
}, null, 2));
