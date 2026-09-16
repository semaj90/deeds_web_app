#!/usr/bin/env node

/**
 * CURRENT-WORKSPACE-FRAME-ADMISSION-01 (read-only).
 *
 * Combines the recovered `resolveCurrentWorkspaceFrameV1()` selector (originally built on
 * agent/current-revision-selector-convergence-20260913, never merged) with the existing,
 * already-live `audit-current-source-cohort-lineage-v1.mjs` cohort lineage output, into the
 * `CurrentWorkspaceFrameReceiptV1` shape recorded in
 * openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md (Gate 1).
 *
 * Writes nothing. Does not rerun the cohort lineage audit itself (that script talks to
 * Postgres); this script reads its most recent persisted receipt
 * (docs/reports/current-source-cohort-lineage-v1.json) and the workspace-frame selector inputs,
 * and classifies. Re-run `node scripts/atlas/audit-current-source-cohort-lineage-v1.mjs` first
 * if a fresher cohort lineage reading is needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCurrentWorkspaceFrameV1 } from './lib/current-workspace-frame-selector-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = (name) => path.resolve(root, 'docs/reports', name);
const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const frame = resolveCurrentWorkspaceFrameV1({ root });
const cohortLineage = readJson(reportPath('current-source-cohort-lineage-v1.json'));

function classify(frame, cohortLineage) {
  if (frame.status !== 'CURRENT_WORKSPACE_FRAME_SELECTED') {
    return 'EXECUTION_AUTHORITY_UNAVAILABLE';
  }
  if (!cohortLineage || !cohortLineage.counts) {
    return 'EXECUTION_AUTHORITY_UNAVAILABLE';
  }
  const c = cohortLineage.counts;
  if (c.currentWorkspaceRevision !== frame.selectedWorkspaceRevision) {
    // The persisted cohort-lineage receipt was generated against a different admitted
    // workspace revision than the selector resolves right now — stale receipt, not a
    // finding about the cohort itself. Caller should rerun the cohort lineage audit.
    return 'EXECUTION_AUTHORITY_UNAVAILABLE';
  }
  if (c.mismatched > 0 || c.missing > 0) {
    return 'SOURCE_CONFLICT';
  }
  if (c.sourceRevisionQualified === c.cohortRows && c.currentWorkspaceMatched === 0) {
    return 'STALE_WORKSPACE_PROJECTION';
  }
  if (c.currentWorkspaceMatched === c.cohortRows) {
    return 'CURRENT_WORKSPACE_FRAME_PROVEN';
  }
  return 'NON_CANONICAL_EXECUTION';
}

const status = classify(frame, cohortLineage);
const counts = cohortLineage?.counts ?? null;

const receipt = {
  schema: 'atlas.current-workspace-frame-receipt.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_GATE_1_ADMISSION',
  admittedExecutionId: null, // current-graphify-snapshot-authority-v1.json reports
                              // AMBIGUOUS_QUALIFYING_EXECUTIONS with ownerSelection: null —
                              // no single admitted executionId exists yet, tracked separately.
  admittedWorkspaceRevision: frame.selectedWorkspaceRevision,
  admittedSource: frame.selectedSource,
  admittedAuthority: frame.selectedAuthority,
  selectorAuthorityConflict: frame.authorityConflict,
  selectorBlockers: frame.blockers,
  cohortLineageReportGeneratedAt: cohortLineage?.generatedAt ?? null,
  cohortLineageWorkspaceRevisionMatchesSelector: counts
    ? counts.currentWorkspaceRevision === frame.selectedWorkspaceRevision
    : null,
  cohortRows: counts?.cohortRows ?? null,
  distinctCohortWorkspaceRevisions: counts?.liveBindingWorkspaceRevisions ?? null,
  exactSourceRevisionMatches: counts?.sourceRevisionQualified ?? null,
  currentWorkspaceMatches: counts?.currentWorkspaceMatched ?? null,
  workspaceMismatches: counts?.workspaceMismatchAfterSourceQualification ?? null,
  staleProjectionCandidates: status === 'STALE_WORKSPACE_PROJECTION' ? (counts?.workspaceMismatchAfterSourceQualification ?? null) : 0,
  conflictingSourceRows: (counts?.mismatched ?? 0) + (counts?.missing ?? 0),
  writesPerformed: false,
  status,
};

console.log(JSON.stringify(receipt, null, 2));

const outPath = reportPath('current-workspace-frame-admission-v1.json');
fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
console.error(`\nReceipt written (read-only report artifact, no datastore writes): ${outPath}`);
