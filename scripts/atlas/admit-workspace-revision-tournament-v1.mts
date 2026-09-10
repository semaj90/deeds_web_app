#!/usr/bin/env node

/** Bounded, explicit snapshot admission for the tournament control plane. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PREFLIGHT = resolve(ROOT, 'docs/reports/workspace-revision-tournament-source-authority-v1.json');
const REPORT = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const REQUIRED = 'AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1';
const confirm = process.argv.slice(2).find((value) => value.startsWith('--confirm='))?.slice('--confirm='.length)
  ?? (process.argv.includes('--confirm') ? process.argv[process.argv.indexOf('--confirm') + 1] : null);
if (confirm !== REQUIRED) throw new Error(`EXPLICIT_CONFIRMATION_REQUIRED:${REQUIRED}`);
const preflight = JSON.parse(await readFile(PREFLIGHT, 'utf8'));
const workspaceRevision = process.argv.slice(2).find((value) => value.startsWith('--workspace-revision='))?.slice('--workspace-revision='.length) ?? null;
const manifestPath = typeof preflight.manifestPath === 'string' ? resolve(ROOT, preflight.manifestPath) : null;
let snapshot = null;
let snapshotBindingError = null;
if (!manifestPath) {
  snapshotBindingError = 'PREFLIGHT_MANIFEST_PATH_MISSING';
} else {
  try {
    snapshot = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    snapshotBindingError = 'PREFLIGHT_MANIFEST_UNREADABLE';
  }
}
const snapshotBindingValid = snapshotBindingError === null
  && snapshot?.snapshotRevision === preflight.snapshotRevision
  && Array.isArray(snapshot?.sources)
  && snapshot.sources.length === preflight.sourceCount
  && snapshot?.sourceMembershipChecksum === preflight.snapshotMembershipChecksum;
const ready = preflight.status === 'CANDIDATE_READY_FOR_EXPLICIT_TOURNAMENT_ADMISSION'
  && preflight.authority === false
  && preflight.workspaceRevision === null
  && typeof preflight.workspaceRevisionCandidate === 'string'
  && typeof workspaceRevision === 'string'
  && /^sha256:[0-9a-f]{64}$/i.test(workspaceRevision)
  && workspaceRevision === preflight.workspaceRevisionCandidate
  && snapshotBindingValid
  && preflight.approvalRequired === true;
if (!ready) {
  const blocker = snapshotBindingError
    ?? (workspaceRevision !== preflight.workspaceRevisionCandidate
      ? 'WORKSPACE_REVISION_DOES_NOT_MATCH_PREFLIGHT_CANDIDATE'
      : (!snapshotBindingValid ? 'PREFLIGHT_SNAPSHOT_BINDING_MISMATCH' : 'SNAPSHOT_REVISION_IS_NOT_WORKSPACE_REVISION'));
  const correction = {
    schema: 'atlas.workspace-revision-tournament-admission.v1', generatedAt: new Date().toISOString(),
    mode: 'EXPLICIT_BOUNDED_ADMISSION_RECEIPT', status: 'WORKSPACE_REVISION_TOURNAMENT_ADMISSION_BLOCKED_REVISION_KIND_MISMATCH',
    proofLevel: 'BLOCKED', authority: false, workspaceRevision: null,
    snapshotRevision: preflight.snapshotRevision ?? null,
    workspaceRevisionCandidate: null, approvalRequired: true, autoApply: false, training: false,
    writesPerformed: false, datastoreWritesPerformed: false, preflightPath: PREFLIGHT,
    blocker,
    suppliedWorkspaceRevision: workspaceRevision,
    preflightWorkspaceRevisionCandidate: preflight.workspaceRevisionCandidate ?? null,
    manifestPath,
    nextGate: 'WORKSPACE-REVISION-ORIGIN-RECONCILIATION-01',
  };
  await mkdir(dirname(REPORT), { recursive: true });
  await writeFile(REPORT, `${JSON.stringify(correction, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: correction.schema, status: correction.status, proofLevel: correction.proofLevel, authority: false, workspaceRevision: null, firstBlockingInvariant: correction.blocker, reportPath: REPORT }, null, 2));
  process.exitCode = 3;
} else {
const report = {
  schema: 'atlas.workspace-revision-tournament-admission.v1',
  generatedAt: new Date().toISOString(),
  mode: 'EXPLICIT_BOUNDED_ADMISSION_RECEIPT',
  status: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED',
  proofLevel: 'BOUNDED_LIVE_PROVEN',
  authority: true,
  workspaceRevision,
  snapshotRevision: preflight.snapshotRevision,
  sourceCount: preflight.sourceCount,
  sourceSelectionChecksum: preflight.sourceSelectionChecksum,
  snapshotMembershipChecksum: preflight.snapshotMembershipChecksum,
  manifestPath,
  approval: { confirmation: REQUIRED, scope: 'TOURNAMENT_SOURCE_AUTHORITY_ONLY' },
  graphifyExecutionAuthorized: false,
  projectionWritesAuthorized: false,
  autoApply: false,
  training: false,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  preflightPath: PREFLIGHT,
  nextGate: 'GRAPHIFY-BOUNDED-TOURNAMENT-CANARY-01',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, proofLevel: report.proofLevel, authority: true, workspaceRevision: report.workspaceRevision, graphifyExecutionAuthorized: false, projectionWritesAuthorized: false, reportPath: REPORT }, null, 2));
}
