#!/usr/bin/env node

/**
 * Read-only disposition for the AST source-authority gate.
 * Distinguishes complete mismatch references from the bounded issue sample
 * emitted by the knowledge-source snapshot audit.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const inputPath = path.join(ROOT, '.tmp/knowledge-source-snapshot-live-v1.json');
const outputPath = path.join(ROOT, 'docs/reports/ast-source-parity-disposition-v1.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const rel = (filePath) => path.relative(ROOT, filePath).replaceAll('\\', '/');
const mismatchRefs = Array.isArray(input.worktreeMismatchRefs) ? input.worktreeMismatchRefs : [];
const missingRefs = Array.isArray(input.missingWorktreeRefs) ? input.missingWorktreeRefs : [];
const issueSample = Array.isArray(input.issues) ? input.issues : [];
const declaredMismatchCount = Number(input.worktreeMismatchCount ?? 0);
const declaredMissingCount = Number(input.missingWorktreeCount ?? 0);
const referencesComplete = mismatchRefs.length === declaredMismatchCount && missingRefs.length === declaredMissingCount;
const sampleIsBounded = issueSample.length < Number(input.issueCount ?? 0);
const parityProven = Boolean(input.worktreeFingerprintParity) && referencesComplete;

const receipt = {
  schema: 'atlas.ast-source-parity-disposition.v1',
  generatedAt: new Date().toISOString(),
  gate: 'AST_SOURCE_AUTHORITY_PARITY',
  input: {
    source: rel(inputPath),
    workspaceRevision: input.workspaceRevision ?? null,
    snapshotRevision: input.snapshotRevision ?? null,
    sourceCount: input.sourceCount ?? null,
    registryStatus: input.registryStatus ?? null,
    worktreeFingerprintParity: Boolean(input.worktreeFingerprintParity),
    declaredMismatchCount,
    declaredMissingCount,
    mismatchReferenceCount: mismatchRefs.length,
    missingReferenceCount: missingRefs.length,
    issueSampleCount: issueSample.length,
    declaredIssueCount: Number(input.issueCount ?? 0),
  },
  evidence: {
    completeMismatchReferences: referencesComplete,
    issueArrayIsSampleOnly: sampleIsBounded,
    mismatchReferenceChecksum: sha256(JSON.stringify([...mismatchRefs].sort())),
    missingReferenceChecksum: sha256(JSON.stringify([...missingRefs].sort())),
  },
  disposition: parityProven ? 'SOURCE_PARITY_PROVEN' : 'WAITING_ON_CURRENT_WORKTREE_PARITY',
  blockers: parityProven ? [] : ['CURRENT_WORKTREE_PARITY'],
  canonicalAuthority: false,
  writesPerformed: false,
};
receipt.checksum = sha256(JSON.stringify({
  gate: receipt.gate,
  input: receipt.input,
  evidence: receipt.evidence,
  disposition: receipt.disposition,
  blockers: receipt.blockers,
  canonicalAuthority: receipt.canonicalAuthority,
  writesPerformed: receipt.writesPerformed,
}));
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({
  reportPath: outputPath,
  status: receipt.disposition,
  declaredMismatchCount,
  mismatchReferenceCount: mismatchRefs.length,
  issueSampleCount: issueSample.length,
  issueArrayIsSampleOnly: sampleIsBounded,
  writesPerformed: false,
}, null, 2));
