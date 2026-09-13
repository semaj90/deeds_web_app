#!/usr/bin/env node

/**
 * Read-only preflight for the snapshot-to-tournament authority seam.
 * It validates a candidate revision but never promotes it or writes a store.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN = resolve(ROOT, 'docs/reports/graphify-source-selection-plan-v1.json');
const DERIVATION = resolve(ROOT, 'docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json');
const HYGIENE = resolve(ROOT, 'docs/reports/canonical-source-inventory-hygiene-v1.json');
const REPORT = resolve(ROOT, 'docs/reports/workspace-revision-tournament-source-authority-v1.json');
const plan = JSON.parse(await readFile(PLAN, 'utf8'));
const derivation = JSON.parse(await readFile(DERIVATION, 'utf8'));
const hygiene = JSON.parse(await readFile(HYGIENE, 'utf8'));
const snapshot = JSON.parse(await readFile(derivation.snapshotPath, 'utf8'));
const readback = validateSnapshot(snapshot);
const candidate = derivation.workspaceRevisionCandidate ?? null;
const checks = {
  derivationReady: derivation.status === 'WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION',
  snapshotReadback: readback.status === 'SNAPSHOT_BYTES_READBACK_PROVEN' && readback.violations.length === 0,
  candidateIsDerived: /^sha256:[0-9a-f]{64}$/i.test(candidate ?? ''),
  derivationMatchesSnapshot: derivation.snapshotRevision === snapshot.snapshotRevision,
  planMatchesDerivationCandidate: plan.workspaceRevisionCandidate === candidate,
  planMatchesSnapshot: plan.snapshotRevision === snapshot.snapshotRevision,
  sourceInventoryHygienePass: hygiene.status === 'SOURCE_INVENTORY_HYGIENE_PASS',
  sourceInventoryMatchesSnapshot: hygiene.snapshotRevision === snapshot.snapshotRevision
    && hygiene.snapshotMembershipChecksum === snapshot.sourceMembershipChecksum,
  recurrencePreventionProven: hygiene.recurrencePrevented === true
    && hygiene.writerUsesSharedExclusionPolicy === true
    && hygiene.recurrenceExclusionProof?.pass === true
    && plan.recurrencePreventionProven === true,
  planBindsSourceInventory: plan.sourceInventoryRevision === hygiene.inventoryRevision
    && plan.sourceInventoryChecksum === hygiene.sourceInventoryChecksum
    && plan.sourceSelectionChecksum === hygiene.sourceSelectionChecksum
    && plan.sourceCount === hygiene.canonicalSourceCount
    && plan.sourceInventoryWriterRevisionChecksum === hygiene.writerRevisionChecksum
    && plan.sourceInventoryWriterExclusionPolicyRevision === hygiene.writerExclusionPolicyRevision
    && plan.sourceInventoryWriterExclusionPolicyChecksum === hygiene.writerExclusionPolicyChecksum,
  knownJunkExcluded: hygiene.knownJunkMatches?.target === 0
    && hygiene.knownJunkMatches?.pythonRuntime === 0
    && hygiene.knownJunkMatches?.backup === 0
    && hygiene.knownJunkMatches?.generatedBuild === 0
    && hygiene.knownJunkMatches?.worktreeDuplicate === 0
    && plan.knownJunkExcluded === true,
  authorityStillFalse: derivation.authority === false && snapshot.canonicalAuthority === false,
  revisionStillNull: derivation.workspaceRevision === null && snapshot.workspaceRevision === null,
};
const ready = Object.values(checks).every(Boolean);
const report = {
  schema: 'atlas.workspace-revision-tournament-source-authority.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_PREAUTHORITY_PREFLIGHT',
  status: ready ? 'CANDIDATE_READY_FOR_EXPLICIT_TOURNAMENT_ADMISSION' : 'CANDIDATE_ADMISSION_PREFLIGHT_BLOCKED',
  proofLevel: ready ? 'CONTRACT_PROVEN' : 'BLOCKED',
  authority: false,
  workspaceRevision: null,
  workspaceRevisionCandidate: candidate,
  approvalRequired: true,
  autoApply: false,
  training: false,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  planPath: PLAN,
  derivationPath: DERIVATION,
  hygienePath: HYGIENE,
  manifestPath: derivation.snapshotPath,
  snapshotSourceCount: derivation.sourceCount ?? 0,
  sourceCount: plan.sourceCount ?? 0,
  sourceSelectionChecksum: plan.sourceSelectionChecksum ?? null,
  sourceInventoryRevision: hygiene.inventoryRevision ?? null,
  sourceInventoryChecksum: hygiene.sourceInventoryChecksum ?? null,
  sourceInventoryWriterRevisionChecksum: hygiene.writerRevisionChecksum ?? null,
  sourceInventoryWriterExclusionPolicyRevision: hygiene.writerExclusionPolicyRevision ?? null,
  sourceInventoryWriterExclusionPolicyChecksum: hygiene.writerExclusionPolicyChecksum ?? null,
  snapshotRevision: snapshot.snapshotRevision ?? null,
  snapshotMembershipChecksum: snapshot.sourceMembershipChecksum ?? null,
  checks,
  firstBlockingInvariant: ready ? null : Object.entries(checks).find(([, value]) => !value)?.[0] ?? 'UNKNOWN',
  nextGate: ready ? 'EXPLICIT-WORKSPACE-REVISION-TOURNAMENT-ADMISSION-01' : 'SOURCE-INVENTORY-HYGIENE-01',
  safeNextCommand: 'npm run atlas:graphify:tournament-admission:audit',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, authority: false, workspaceRevision: null, workspaceRevisionCandidate: candidate, sourceInventoryChecksum: report.sourceInventoryChecksum, sourceSelectionChecksum: report.sourceSelectionChecksum, recurrencePreventionProven: checks.recurrencePreventionProven, firstBlockingInvariant: report.firstBlockingInvariant, reportPath: REPORT }, null, 2));
if (!ready) process.exitCode = 3;
