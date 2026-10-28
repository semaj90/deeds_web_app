#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outArg = process.argv.find((arg) => arg.startsWith('--out='));
if (!outArg) throw new Error('MISSING_OUTPUT_PATH');
const outputPath = path.resolve(root, outArg.slice('--out='.length));
const runRoot = path.resolve(root, '.tmp/atlas/canonical-gate-runs');
if (!outputPath.startsWith(`${runRoot}${path.sep}`)) throw new Error('OUTPUT_MUST_BE_RUN_SCOPED');
const broadAuditPath = `${outputPath}.broad-audit.json`;
const profilePath = `${outputPath}.profile-reconciliation.json`;
const digest = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const run = (args) => spawnSync(process.execPath, args, {
  cwd: root,
  encoding: 'utf8',
  timeout: 240000,
  maxBuffer: 8 * 1024 * 1024,
  windowsHide: true,
});

const broadResult = run(['scripts/atlas/audit-okf-v02-bundle-v1.mjs', '.okf', path.relative(root, broadAuditPath).replaceAll('\\', '/')]);
if (broadResult.status !== 0 || broadResult.error) throw new Error(`OKF_BROAD_AUDIT_FAILED:${broadResult.error?.message ?? broadResult.status}`);
const broad = readJson(broadAuditPath);
if (!Array.isArray(broad.files) || !Number.isInteger(broad.filesConsidered)) throw new Error('OKF_BROAD_AUDIT_MALFORMED');
const broadDigest = digest(fs.readFileSync(broadAuditPath));

const profileResult = run(['scripts/validate/okf-reconciliation-v1.mjs', `--in=${path.relative(root, broadAuditPath).replaceAll('\\', '/')}`, `--out=${path.relative(root, profilePath).replaceAll('\\', '/')}`]);
if (profileResult.status !== 0 || profileResult.error) throw new Error(`OKF_PROFILE_RECONCILIATION_FAILED:${profileResult.error?.message ?? profileResult.status}`);
const profile = readJson(profilePath);
if (profile.schema !== 'atlas.okf-reconciliation-by-cause.v1' || !profile.counts || !Array.isArray(profile.files)) throw new Error('OKF_PROFILE_RECEIPT_MALFORMED');
const { receiptSha256: profileReceiptSha256, ...profileBody } = profile;
if (profileReceiptSha256 !== digest(Buffer.from(JSON.stringify(profileBody), 'utf8'))) throw new Error('OKF_PROFILE_RECEIPT_CHECKSUM_MISMATCH');
if (profile.sourceAudit?.sha256 !== broadDigest || profile.counts.total !== broad.filesConsidered || profile.files.length !== broad.filesConsidered) {
  throw new Error('OKF_PROFILE_RECEIPT_INPUT_OR_INVENTORY_MISMATCH');
}

const profileClassification = profile.status === 'OKF_PROFILE_RECONCILIATION_READ_ONLY_VERIFIED'
  && profile.counts.reconciled === true
  && profile.counts.unclassified === 0
  ? 'PASS'
  : profile.status === 'OKF_PROFILE_RECONCILIATION_INCOMPLETE'
    && profile.counts.reconciled === true
    && profile.counts.unclassified === 0
    ? 'PARTIAL'
    : 'FAIL';
const body = {
  schema: 'atlas.canonical-gate-okf-profile-evidence.v1',
  status: profileClassification,
  broadProfileDiagnostic: {
    status: broad.status,
    filesConsidered: broad.filesConsidered,
    invalidUnderBroadProfile: broad.invalidFiles,
    excludedUnderBroadProfile: broad.excludedFiles,
    interpretation: 'Diagnostic only; broad-v0.2 flags do not establish invalidity without intended-profile evidence.',
    path: path.relative(root, broadAuditPath).replaceAll('\\', '/'),
    sha256: broadDigest,
  },
  profileReconciliation: {
    status: profile.status,
    firstBlocker: profile.firstUnresolvedBlocker ?? null,
    counts: profile.counts,
    byCause: profile.byCause,
    path: path.relative(root, profilePath).replaceAll('\\', '/'),
    sha256: digest(fs.readFileSync(profilePath)),
  },
  reasons: profileClassification === 'PASS' ? [] : profileClassification === 'PARTIAL'
    ? [profile.firstUnresolvedBlocker ?? 'OKF_PROFILE_OWNER_EVIDENCE_INCOMPLETE']
    : ['OKF_PROFILE_RECONCILIATION_INVALID_OR_UNRECONCILED'],
  canonicalAuthority: false,
  writesPerformed: false,
};
const receiptSha256 = digest(Buffer.from(JSON.stringify(body), 'utf8'));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ status: body.status, reasons: body.reasons, broadInvalidDiagnostic: broad.invalidFiles, profileCounts: profile.counts, output: path.relative(root, outputPath).replaceAll('\\', '/') }, null, 2));
