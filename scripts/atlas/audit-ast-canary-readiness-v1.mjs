#!/usr/bin/env node
/**
 * Read-only AST canary readiness composition.
 * A rollback rehearsal proves mechanics; this receipt separately checks
 * current-source authority, digest divergence, and identity conflicts before
 * allowing any persistent canary recommendation.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const paths = {
  know09: path.join(ROOT, '.tmp/knowledge-source-snapshot-live-v1.json'),
  sourceParity: path.join(ROOT, 'docs/reports/ast-source-parity-disposition-v1.json'),
  sourceWorktree: path.join(ROOT, 'docs/reports/ast-source-parity-worktree-v1.json'),
  rehearsal: path.join(ROOT, 'docs/reports/atlas-ast-canary-apply-v1.rehearsal.json'),
  offset: path.join(ROOT, 'docs/reports/ast-offset-basis-proof-v1.json'),
  digest: path.join(ROOT, 'docs/reports/ast-digest-divergence-v1.json'),
  conflicts: path.join(ROOT, 'docs/reports/ast-structural-conflicts-v1.json'),
  rekey: path.join(ROOT, 'docs/reports/atlas-ast-canary-rekey-v1.rehearsal.json'),
};
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const receipts = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(file)]));
const checks = [
  {
    id: 'ROLLBACK_REHEARSAL',
    passed: receipts.rehearsal.status === 'REHEARSAL_PROVEN' &&
      receipts.rehearsal.steps?.constraintCheck?.startsWith('PASS') &&
      receipts.rehearsal.steps?.readback?.persistentRowsAdded === 0 &&
      receipts.rehearsal.steps?.after?.persisted === false,
    detail: `status=${receipts.rehearsal.status}; persistentRowsAdded=${receipts.rehearsal.steps?.readback?.persistentRowsAdded}`,
  },
  {
    id: 'BOM_OFFSET_BASIS',
    passed: receipts.offset.status === 'BOM_OFFSET_BASIS_PROVEN',
    detail: receipts.offset.status,
  },
  {
    id: 'CURRENT_WORKTREE_PARITY',
    passed: receipts.sourceParity.disposition === 'SOURCE_PARITY_PROVEN' &&
      receipts.sourceParity.evidence?.completeMismatchReferences === true,
    detail: `status=${receipts.sourceParity.disposition}; mismatches=${receipts.sourceParity.input?.declaredMismatchCount}; missing=${receipts.sourceParity.input?.declaredMissingCount}; issueSampleOnly=${receipts.sourceParity.evidence?.issueArrayIsSampleOnly}; dirty=${receipts.sourceWorktree.byDisposition?.WORKTREE_MODIFIED ?? 0}; notDirty=${receipts.sourceWorktree.byDisposition?.NOT_VISIBLE_IN_GIT_STATUS ?? 0}`,
  },
  {
    id: 'DIGEST_DIVERGENCE_DISPOSITIONED',
    passed: Number(receipts.digest.sourceCount ?? 0) === 0 ||
      receipts.digest.sources.every((source) => source.classification === 'KNOW09_DRIFT_ALREADY_DECLARED' && source.declaredInKnow09 === true),
    detail: `divergentSources=${receipts.digest.sourceCount}; disposition=${receipts.digest.byClassification?.KNOW09_DRIFT_ALREADY_DECLARED === receipts.digest.sourceCount ? 'DECLARED_AND_EXCLUDED' : 'REVIEW_REQUIRED'}`,
  },
  {
    id: 'STRUCTURAL_CONFLICTS_CLOSED',
    passed: Number(receipts.conflicts.identityProof?.structuralKeyConflicts ?? 0) === 0,
    detail: `structuralKeyConflicts=${receipts.conflicts.identityProof?.structuralKeyConflicts ?? 'UNKNOWN'}`,
  },
  {
    id: 'REKEY_REHEARSAL',
    passed: receipts.rekey.status === 'REHEARSAL_PROVEN' &&
      receipts.rekey.mode === 'REHEARSAL_ROLLBACK' &&
      receipts.rekey.steps?.constraintCheck?.startsWith('PASS') &&
      receipts.rekey.steps?.after?.persisted === false,
    detail: `status=${receipts.rekey.status}; planned=${receipts.rekey.steps?.rekey?.planned}; updated=${receipts.rekey.steps?.rekey?.updated}; persisted=${receipts.rekey.steps?.after?.persisted}`,
  },
];
const blockers = checks.filter((check) => !check.passed).map((check) => check.id);
const inputChecksums = Object.fromEntries(Object.entries(receipts).map(([key, value]) => [key, `sha256:${crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`]));
const blockerFingerprint = `sha256:${crypto.createHash('sha256').update(JSON.stringify({ blockers, inputChecksums }), 'utf8').digest('hex')}`;
const receipt = {
  schema: 'atlas.ast-canary-readiness.v1',
  generatedAt: new Date().toISOString(),
  inputChecksums,
  checks,
  blockers,
  retry: {
    blockerFingerprint,
    allowed: blockers.length === 0,
    reason: blockers.length === 0 ? 'READY_FOR_OPERATOR_REVIEW' : 'UNCHANGED_BLOCKER_EVIDENCE_REQUIRES_STATE_CHANGE',
    retryWhen: ['workspaceRevisionChanges', 'sourceSnapshotRevisionChanges', 'structuralConflictDispositionChanges'],
  },
  status: blockers.length === 0 ? 'PERSISTENT_CANARY_READY_FOR_EXPLICIT_APPROVAL' : 'PERSISTENT_CANARY_BLOCKED',
  authorization: {
    persistentApplyAuthorized: false,
    operatorApprovalRequired: true,
    sourceAuthorityDecisionRequired: true,
    supersessionProposals: 0,
  },
  nextGate: {
    kind: 'EXTERNAL_SOURCE_AUTHORITY_DECISION',
    status: blockers.includes('CURRENT_WORKTREE_PARITY')
      ? 'WAITING_ON_SOURCE_ADMISSION'
      : blockers.includes('STRUCTURAL_CONFLICTS_CLOSED')
        ? 'WAITING_ON_IDENTITY_CONFLICT_DISPOSITION'
        : 'READY_FOR_OPERATOR_REVIEW',
    options: [
      'ADMIT_CURRENT_WORKTREE_AS_NEW_SOURCE_SNAPSHOT',
      'RESTORE_OR_REGENERATE_FROM_ADMITTED_SNAPSHOT',
    ],
    retryWhen: [
      'workspaceRevisionChanges',
      'sourceSnapshotRevisionChanges',
      'structuralConflictDispositionChanges',
    ],
    noAutomaticChoice: true,
  },
  canonicalAuthority: false,
  writesPerformed: false,
};
const reportPath = path.join(ROOT, 'docs/reports/ast-canary-readiness-v1.json');
fs.writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, status: receipt.status, blockers, writesPerformed: false }, null, 2));
process.exitCode = 0;
