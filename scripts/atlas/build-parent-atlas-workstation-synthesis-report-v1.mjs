#!/usr/bin/env node

/** Assemble the bounded workstation synthesis handoff without invoking a model. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const board = read('docs/reports/parent-atlas-workstation-openspec-workboard-v2.json');
const context = read('docs/reports/parent-atlas-workstation-ace-context-v1.json');
const synthesis = read('docs/reports/parent-atlas-workstation-ornith-synthesis-dry-v1.json');
const residency = read('docs/reports/parent-atlas-workstation-residency-v1.json');
const planOnly = read('docs/reports/parent-atlas-workstation-plan-only-proof-v1.json');
const sourceAuthority = read('docs/reports/current-graphify-source-revision-v1.json');
const sourceNamespace = read('docs/reports/workspace-source-namespace-v1.json');
const sourceRegistry = read('docs/reports/current-source-registry-contract-v1.json');
const sourceProjection = read('docs/reports/current-source-projection-cohort-v1.json');
const sourceAlignment = read('docs/reports/source-selection-authority-alignment-v1.json');
const lifecycleOwner = read('docs/reports/graphify-lifecycle-owner-v1.json');
const runBinding = read('docs/reports/graphify-run-file-binding-v1.json');
const lifecycleEntrypoint = read('docs/reports/graphify-lifecycle-entrypoint-v1.json');
const readOptional = (relative) => {
  try {
    return read(relative);
  } catch {
    return null;
  }
};
const ornithFixtureProof = readOptional('docs/reports/parent-atlas-workstation-ornith-synthesis-fixture-proof-v1.json');
const residencyProof = readOptional('docs/reports/parent-atlas-workstation-residency-proof-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const reportBody = {
  schema: 'atlas.parent-atlas-workstation-synthesis-report.v1',
  status: 'BLOCKED_UPSTREAM_NO_EXECUTABLE_CANDIDATE',
  selectedAction: null,
  blockedActions: ['PKT-LINEAGE-08', 'current-workspace-source-cohort', 'current-packet-chunk-join', 'source-selection-authority'],
  workboardChecksum: board.workboardChecksum,
  taskPopulationChecksum: board.taskPopulationChecksum,
  planChecksum: board.workPlan?.planChecksum ?? null,
  contextChecksum: context.contextChecksum,
  residencyIdentityChecksum: residency.identityChecksum,
  synthesisStatus: synthesis.status,
  loadedModel: synthesis.loadedModel ?? null,
  evidenceRefs: context.selectedEvidenceRefs ?? [],
  nextGate: 'SOURCE-SELECTION-AUTHORITY-01',
  upstreamAuthority: {
    graphifySourceRevisionStatus: sourceAuthority.status,
    graphifySourceRevisionRows: sourceAuthority.rowCount ?? 0,
    workspaceNamespaceStatus: sourceNamespace.status,
    sourceRegistryStatus: sourceRegistry.status,
    selectedSourceCount: sourceRegistry.selectedSourceCount ?? 0,
    projectionCohortStatus: sourceProjection.status,
    projectionEligibleCurrentSources: sourceProjection.counts?.eligibleCurrentSources ?? 0,
    projectionCohortChecksum: sourceProjection.cohortChecksum ?? null,
    authorityAlignmentStatus: sourceAlignment.status,
    authorityAlignmentDecision: sourceAlignment.decision,
    lifecycleOwnerStatus: lifecycleOwner.lifecycleOwnerStatus,
    lifecycleEligibleForFreshRun: lifecycleOwner.eligibleForFreshRun,
    runBindingStatus: runBinding.status,
    runBindingCounts: runBinding.counts,
    lifecycleEntrypointStatus: lifecycleEntrypoint.status,
    lifecycleEntrypointWorkspaceRevision: lifecycleEntrypoint.workspaceRevision ?? null,
    lifecycleEntrypointBindingCount: lifecycleEntrypoint.bindingCount ?? 0,
    lifecycleEntrypointWrites: lifecycleEntrypoint.writes ?? false,
    requiredAction: 'REPAIR_SOURCE_SELECTION_AUTHORITY_BEFORE_PROMOTION',
  },
  mutationScope: 'NONE_UNTIL_EXPLICIT_AUTHORIZATION',
  liveCapabilityProofs: {
    gate: 'WORKSTATION-LIVE-CAPABILITY-PROOF-01',
    ornith: {
      gate: 'WORKSTATION-ORNITH-LIVE-FIXTURE-01',
      status: ornithFixtureProof?.status ?? 'NOT_RUN',
      loadedModel: ornithFixtureProof?.loadedModel ?? null,
      dryRunReceiptUntouched: ornithFixtureProof?.isolation?.dryRunReceiptUntouched ?? null,
    },
    bitfrost: {
      gate: 'WORKSTATION-BITFROST-LIVE-READ-01',
      status: residencyProof?.status ?? 'NOT_RUN',
      probeMode: residency.probeMode ?? 'REFERENCE_ONLY',
      cacheDecision: residency.cacheDecision ?? 'NOT_EXECUTED_REFERENCE_ONLY',
      cacheWritesPerformed: false,
      canonicalWritesPerformed: false,
    },
    productionAdoption: 'BLOCKED_CURRENT_LINEAGE',
    note: 'Live-capability proofs only; they do not select an executable task or affect nextGate/blockedActions.',
  },
  writes: planOnly.writes,
  provenance: {
    workboard: 'docs/reports/parent-atlas-workstation-openspec-workboard-v2.json',
    aceContext: 'docs/reports/parent-atlas-workstation-ace-context-v1.json',
    synthesis: 'docs/reports/parent-atlas-workstation-ornith-synthesis-dry-v1.json',
    residency: 'docs/reports/parent-atlas-workstation-residency-v1.json',
    planOnly: 'docs/reports/parent-atlas-workstation-plan-only-proof-v1.json',
    sourceAuthority: 'docs/reports/current-graphify-source-revision-v1.json',
    sourceNamespace: 'docs/reports/workspace-source-namespace-v1.json',
    sourceRegistry: 'docs/reports/current-source-registry-contract-v1.json',
    sourceProjection: 'docs/reports/current-source-projection-cohort-v1.json',
    sourceAlignment: 'docs/reports/source-selection-authority-alignment-v1.json',
    lifecycleOwner: 'docs/reports/graphify-lifecycle-owner-v1.json',
    runBinding: 'docs/reports/graphify-run-file-binding-v1.json',
    lifecycleEntrypoint: 'docs/reports/graphify-lifecycle-entrypoint-v1.json',
  },
};
const report = { ...reportBody, reportChecksum: sha256(JSON.stringify(reportBody)) };
const out = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-synthesis-report-v1.json');
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status: report.status, nextGate: report.nextGate, reportChecksum: report.reportChecksum, out }, null, 2));
