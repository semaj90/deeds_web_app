#!/usr/bin/env node

/** Read-only scale-admission audit; never invokes the latent writer. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const bundlePath = resolve(ROOT, 'docs/reports/sem768-corpus-bundle-01.json');
const replayPath = resolve(ROOT, 'docs/reports/latent-phase16-frozen-cohort-apply-replay-v1.json');
const reportPath = resolve(ROOT, 'docs/reports/latent-phase16-scale-admission-v1.json');
const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));
const replay = JSON.parse(await readFile(replayPath, 'utf8'));
const eligibleIds = Array.isArray(bundle.eligibleIds) ? bundle.eligibleIds : [];
const canaryProven = replay.status === 'FROZEN_COHORT_APPLY_REPLAY_PROVEN' && replay.idempotentReplay === true && replay.sameFrozenCohort === true;
const report = {
  schema: 'atlas.latent-phase16-scale-admission.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
  status: canaryProven ? 'SCALE_ADMISSION_BLOCKED_AUTHORITY_AND_CAPACITY' : 'SCALE_ADMISSION_BLOCKED_CANARY',
  proofLevel: canaryProven ? 'PARTIAL_PROVEN' : 'BLOCKED', authority: false, writesPerformed: false, workspaceRevision: null,
  input: { corpusBundle: 'docs/reports/sem768-corpus-bundle-01.json', corpusBundleChecksum: bundle.bundle?.checksum ?? null, representationRevision: bundle.bundle?.representationRevision ?? null, sourceAuthorityStatus: bundle.bundle?.sourceAuthorityStatus ?? null, admittedCohortCount: eligibleIds.length, admittedCohortChecksum: bundle.bundle?.populationChecksum ?? null },
  boundedCanary: { report: 'docs/reports/latent-phase16-frozen-cohort-apply-replay-v1.json', proven: canaryProven, cohortSize: replay.cohortSize ?? null, sameFrozenCohort: replay.sameFrozenCohort ?? false, idempotentReplay: replay.idempotentReplay ?? false, outsideCohortMutations: null },
  scalePredicates: { currentSourceAuthority: false, workspaceRevisionAdmitted: false, representationLedgerAdmitted: false, capacityReceiptPresent: false, restartRecoveryReceiptPresent: false, independentFullCohortReadbackPlanPresent: false, unboundedApplyAuthorized: false },
  blockers: ['WORKSPACE_REVISION_AUTHORITY_NOT_ADMITTED', 'SOURCE_AUTHORITY_STATUS_NOT_FULL', 'CAPACITY_AND_RECOVERY_RECEIPT_MISSING', 'UNBOUNDED_APPLY_REMAINS_BLOCKED'],
  nextGate: 'GRAPHIFY-SNAPSHOT-BINDING-01', safeNextCommand: 'npm run atlas:graphify:snapshot-binding:audit',
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, admittedCohortCount: eligibleIds.length, canaryProven, authority: false, writesPerformed: false, reportPath }, null, 2));
