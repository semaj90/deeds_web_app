#!/usr/bin/env tsx

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const REPORT = resolve(ROOT, 'docs/reports/workspace-revision-admission-single-owner-v1.json');

const paths = {
  hygiene: resolve(ROOT, 'docs/reports/canonical-source-inventory-hygiene-v1.json'),
  plan: resolve(ROOT, 'docs/reports/graphify-source-selection-plan-v1.json'),
  derivation: resolve(ROOT, 'docs/reports/workspace-revision-from-sealed-multi-repo-snapshot-v1.json'),
  preflight: resolve(ROOT, 'docs/reports/workspace-revision-tournament-source-authority-v1.json'),
  admission: resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'),
  consumer: resolve(ROOT, 'docs/reports/graphify-snapshot-consumer-preflight-v1.json'),
  canary: resolve(ROOT, 'docs/reports/graphify-canary-expectation-v1.json'),
};

async function readJson(path: string, required = true): Promise<Record<string, any> | null> {
  if (!existsSync(path)) {
    if (required) throw new Error(`REQUIRED_RECEIPT_MISSING:${path}`);
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, any>;
}

const hygiene = await readJson(paths.hygiene);
const plan = await readJson(paths.plan);
const derivation = await readJson(paths.derivation);
const preflight = await readJson(paths.preflight);
const admission = await readJson(paths.admission, false);
const consumer = await readJson(paths.consumer, false);
const canary = await readJson(paths.canary, false);

const expected = {
  snapshotRevision: hygiene?.snapshotRevision ?? null,
  workspaceRevisionCandidate: derivation?.workspaceRevisionCandidate ?? null,
  sourceInventoryRevision: hygiene?.inventoryRevision ?? null,
  sourceInventoryChecksum: hygiene?.sourceInventoryChecksum ?? null,
  sourceSelectionChecksum: hygiene?.sourceSelectionChecksum ?? null,
  sourceCount: hygiene?.canonicalSourceCount ?? null,
  snapshotSourceCount: hygiene?.candidatePathCount ?? null,
};

const checks: Record<string, boolean> = {
  hygienePass: hygiene?.status === 'SOURCE_INVENTORY_HYGIENE_PASS'
    && hygiene?.recurrencePrevented === true
    && hygiene?.historicalJunkCleanupAuthorized === false,
  planReady: plan?.status === 'SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED',
  derivationReady: derivation?.status === 'WORKSPACE_REVISION_CANDIDATE_READY_FOR_ADMISSION',
  preflightReady: preflight?.status === 'CANDIDATE_READY_FOR_EXPLICIT_TOURNAMENT_ADMISSION',
  planSnapshotMatches: plan?.snapshotRevision === expected.snapshotRevision,
  derivationSnapshotMatches: derivation?.snapshotRevision === expected.snapshotRevision,
  preflightSnapshotMatches: preflight?.snapshotRevision === expected.snapshotRevision,
  planCandidateMatchesDerivation: plan?.workspaceRevisionCandidate === expected.workspaceRevisionCandidate,
  preflightCandidateMatchesDerivation: preflight?.workspaceRevisionCandidate === expected.workspaceRevisionCandidate,
  planInventoryRevisionMatches: plan?.sourceInventoryRevision === expected.sourceInventoryRevision,
  planInventoryChecksumMatches: plan?.sourceInventoryChecksum === expected.sourceInventoryChecksum,
  planSelectionChecksumMatches: plan?.sourceSelectionChecksum === expected.sourceSelectionChecksum,
  planSourceCountMatches: Number(plan?.sourceCount) === Number(expected.sourceCount),
  planSnapshotSourceCountMatches: Number(plan?.snapshotSourceCount) === Number(expected.snapshotSourceCount),
  preflightInventoryRevisionMatches: preflight?.sourceInventoryRevision === expected.sourceInventoryRevision,
  preflightInventoryChecksumMatches: preflight?.sourceInventoryChecksum === expected.sourceInventoryChecksum,
  preflightSelectionChecksumMatches: preflight?.sourceSelectionChecksum === expected.sourceSelectionChecksum,
  preflightSourceCountMatches: Number(preflight?.sourceCount) === Number(expected.sourceCount),
  preflightSnapshotSourceCountMatches: Number(preflight?.snapshotSourceCount) === Number(expected.snapshotSourceCount),
};

if (admission) {
  checks.admissionStatusValid = admission.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' && admission.authority === true;
  checks.admissionWorkspaceMatchesCandidate = admission.workspaceRevision === expected.workspaceRevisionCandidate;
  checks.admissionSnapshotMatches = admission.snapshotRevision === expected.snapshotRevision;
  checks.admissionInventoryRevisionMatches = admission.sourceInventoryRevision === expected.sourceInventoryRevision;
  checks.admissionInventoryChecksumMatches = admission.sourceInventoryChecksum === expected.sourceInventoryChecksum;
  checks.admissionSelectionChecksumMatches = admission.sourceSelectionChecksum === expected.sourceSelectionChecksum;
  checks.admissionSourceCountMatches = Number(admission.sourceCount) === Number(expected.sourceCount);
  checks.admissionSnapshotSourceCountMatches = Number(admission.snapshotSourceCount) === Number(expected.snapshotSourceCount);
  checks.admissionExecutionStillUnauthorized = admission.graphifyExecutionAuthorized === false;
  checks.admissionProjectionWritesStillUnauthorized = admission.projectionWritesAuthorized === false;
}

if (consumer) {
  checks.consumerWorkspaceMatches = !admission || consumer.workspaceRevision === admission.workspaceRevision;
  checks.consumerSnapshotMatches = consumer.snapshotRevision === expected.snapshotRevision;
  checks.consumerInventoryRevisionMatches = consumer.sourceInventoryRevision === expected.sourceInventoryRevision;
  checks.consumerInventoryChecksumMatches = consumer.sourceInventoryChecksum === expected.sourceInventoryChecksum;
  checks.consumerSelectionChecksumMatches = consumer.sourceSelectionChecksum === expected.sourceSelectionChecksum;
  checks.consumerSourceCountMatches = Number(consumer.sourceCount) === Number(expected.sourceCount);
}

if (canary) {
  checks.canaryWorkspaceMatches = !admission || canary.workspaceRevision === admission.workspaceRevision;
  checks.canarySnapshotMatches = canary.snapshotRevision === expected.snapshotRevision;
  checks.canaryInventoryRevisionMatches = canary.sourceInventoryRevision === expected.sourceInventoryRevision;
  checks.canaryInventoryChecksumMatches = canary.sourceInventoryChecksum === expected.sourceInventoryChecksum;
  checks.canarySelectionChecksumMatches = canary.sourceSelectionChecksum === expected.sourceSelectionChecksum;
  checks.canarySourceCountMatches = Number(canary.sourceCount) === Number(expected.sourceCount);
  checks.canaryExecutionStillUnauthorized = canary.graphifyExecutionAuthorized === false;
  checks.canaryCanonicalWritesStillUnauthorized = canary.canonicalWritesAuthorized === false;
}

const violations = Object.entries(checks)
  .filter(([, passed]) => passed !== true)
  .map(([name]) => name);
const status = violations.length === 0
  ? 'WORKSPACE_REVISION_ADMISSION_SINGLE_OWNER_PROVEN'
  : 'WORKSPACE_REVISION_ADMISSION_SINGLE_OWNER_BLOCKED';

const report = {
  schema: 'atlas.workspace-revision-admission-single-owner.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  status,
  authority: false,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  expected,
  receiptsPresent: {
    hygiene: true,
    plan: true,
    derivation: true,
    preflight: true,
    admission: Boolean(admission),
    consumer: Boolean(consumer),
    canary: Boolean(canary),
  },
  checks,
  violations,
  firstBlockingInvariant: violations[0] ?? null,
  nextGate: violations.length === 0
    ? (admission ? 'GRAPHIFY-SNAPSHOT-CONSUMER-PREFLIGHT-01' : 'EXPLICIT-WORKSPACE-REVISION-TOURNAMENT-ADMISSION-01')
    : 'WORKSPACE-REVISION-ADMISSION-SINGLE-OWNER-01',
};

await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (violations.length > 0) process.exitCode = 3;
