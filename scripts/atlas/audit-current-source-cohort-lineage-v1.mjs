#!/usr/bin/env node

/**
 * Verify revision lineage for the bounded exact source cohort; read-only.
 *
 * CURRENT-WORKSPACE-FRAME-AUTHORITY-SEMANTICS-01: "current workspace revision" is now resolved
 * through `resolveCurrentWorkspaceFrameV1()` (recovered prior art, see
 * openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md) rather than reading
 * `workspace-revision-tournament-admission-v1.json` inline. This is not a cosmetic swap: the
 * selector also checks `current-graphify-snapshot-authority-v1.json` for an authority conflict
 * and fails closed (`CURRENT_REVISION_SELECTOR_CONFLICT`) if the two authoritative receipts
 * disagree — the inline version below this comment used to trust the admission receipt alone.
 * `workspace-source-binding-observation.json` is demoted to corroborating evidence only: it is
 * still read and reported (`observationWorkspaceRevision`, `observationMatchesSelectedFrame`)
 * but never selects the comparison revision.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { resolveCurrentWorkspaceFrameV1, computeWorkspaceFrameAuthorityV1 } from './lib/current-workspace-frame-selector-v1.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cohortPath = path.join(root, 'docs/reports/current-source-projection-cohort-v1.json');
const observationPath = path.join(root, 'docs/reports/workspace-source-binding-observation.json');
const reportPath = path.join(root, 'docs/reports/current-source-cohort-lineage-v1.json');
const sourceOwnerPath = path.join(root, 'docs/reports/current-source-owner-reconciliation-v1.json');
const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
let sourceOwner = null;
try {
  sourceOwner = JSON.parse(fs.readFileSync(sourceOwnerPath, 'utf8'));
} catch {
  // Source-owner evidence is required for promotion, but absence is represented
  // in the receipt rather than treated as permission to proceed.
}
let observation = {};
try {
  observation = JSON.parse(fs.readFileSync(observationPath, 'utf8'));
} catch {
  // Corroborating evidence only; its absence does not block the authoritative frame selection.
}
const revisionArgIndex = process.argv.indexOf('--workspace-revision');
const explicitWorkspaceRevisionArg = revisionArgIndex >= 0 ? process.argv[revisionArgIndex + 1] : undefined;
if (explicitWorkspaceRevisionArg !== undefined && !/^sha256:[0-9a-f]{64}$/i.test(explicitWorkspaceRevisionArg)) {
  throw new Error('INVALID_EXPLICIT_WORKSPACE_REVISION');
}

const workspaceFrame = resolveCurrentWorkspaceFrameV1({ root, argv: process.argv.slice(2), env: process.env });
const workspaceFrameAuthority = computeWorkspaceFrameAuthorityV1(workspaceFrame);

const observationWorkspaceRevision = observation.workspaceRevision
  ?? observation.workspace_revision
  ?? observation.record?.workspaceRevision
  ?? observation.record?.workspace_revision
  ?? null;
const observationMatchesSelectedFrame = observationWorkspaceRevision !== null
  && observationWorkspaceRevision === workspaceFrame.selectedWorkspaceRevision;

// Gate the comparison itself on frame resolution before touching Postgres. A frame that
// couldn't be selected, wasn't authoritative, or was authoritative-but-conflicted must not
// silently fall through to a cohort comparison against a non-canonical revision.
let earlyStatus = null;
if (workspaceFrame.status !== 'CURRENT_WORKSPACE_FRAME_SELECTED') {
  earlyStatus = 'CURRENT_WORKSPACE_FRAME_UNRESOLVED';
} else if (workspaceFrame.authorityConflict) {
  earlyStatus = 'CURRENT_WORKSPACE_FRAME_CONFLICT';
} else if (!workspaceFrameAuthority.frameAuthoritative) {
  earlyStatus = 'CURRENT_WORKSPACE_FRAME_NON_AUTHORITATIVE';
}

const currentWorkspaceRevision = workspaceFrame.selectedWorkspaceRevision;
const rows = cohort.cohort ?? [];
const refs = rows.map((row) => String(row.relativePath ?? '').trim()).filter(Boolean);
const prefixedRefs = refs.map((ref) => ref.startsWith('sveltekit-frontend/') ? ref : `sveltekit-frontend/${ref}`);
let graphifyRows = [];
let liveBindingWorkspaceRevisions = [];
let error = null;
if (earlyStatus === null) {
  // Only query Postgres once the workspace frame is resolved, authoritative, and conflict-free —
  // a comparison run against an unresolved/non-authoritative/conflicted frame would produce a
  // misleading cohort verdict, per CURRENT-WORKSPACE-FRAME-AUTHORITY-SEMANTICS-01.
  const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 120000 });
  try {
    liveBindingWorkspaceRevisions = (await pool.query(
      `select distinct workspace_revision::text as workspace_revision
       from public.atlas_workspace_source_bindings
       where repo_id = 'deeds-web-app'
       order by workspace_revision::text`,
    )).rows.map((row) => String(row.workspace_revision ?? '').trim()).filter(Boolean);
    graphifyRows = (await pool.query(
      `select source_ref, content_hash, workspace_revision, code_source_revision, source_revision
       from public.graphify_files
       where source_ref = any($1::text[]) or source_ref = any($2::text[])
       order by source_ref`,
      [refs, prefixedRefs],
    )).rows;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    await pool.end();
  }
}
const byRef = new Map();
for (const row of graphifyRows) {
  const key = String(row.source_ref ?? '').replaceAll('\\', '/').toLowerCase();
  const list = byRef.get(key) ?? [];
  list.push(row);
  byRef.set(key, list);
}
const resultRows = rows.map((row) => {
  const ref = String(row.relativePath ?? '').replaceAll('\\', '/').toLowerCase();
  const matches = [...(byRef.get(ref) ?? []), ...(byRef.get(`sveltekit-frontend/${ref}`) ?? [])];
  const unique = [...new Map(matches.map((match) => [JSON.stringify(match), match])).values()];
  const current = unique.filter((match) => match.workspace_revision === currentWorkspaceRevision && String(match.workspace_revision ?? '').startsWith('sha256:'));
  const expectedSourceRevision = String(row.sourceRevision ?? '').trim();
  const expectedContentHash = String(row.filesystemHash ?? '').trim().toLowerCase().replace(/^sha256:/, '');
  const qualified = unique.filter((match) => {
    const actualRevision = String(match.code_source_revision ?? match.source_revision ?? '').trim();
    const actualHash = String(match.content_hash ?? '').trim().toLowerCase().replace(/^sha256:/, '');
    return Boolean(actualRevision)
      && (!expectedSourceRevision || actualRevision === expectedSourceRevision)
      && (!expectedContentHash || actualHash === expectedContentHash);
  });
  const workspaceQualified = qualified.filter((match) => match.workspace_revision === currentWorkspaceRevision && String(match.workspace_revision ?? '').startsWith('sha256:'));
  return {
    relativePath: row.relativePath,
    graphifyRows: unique.length,
    currentWorkspaceRows: current.length,
    sourceRevisionQualifiedRows: qualified.length,
    revisionQualifiedRows: qualified.length,
    workspaceRevisionQualifiedRows: workspaceQualified.length,
    sourceRevision: qualified[0]?.code_source_revision ?? qualified[0]?.source_revision ?? row.sourceRevision ?? null,
    workspaceRevision: qualified[0]?.workspace_revision ?? null,
    classification: qualified.length === 1 && workspaceQualified.length === 1
      ? 'CURRENT_REVISION_QUALIFIED'
      : qualified.length === 1
        ? 'SOURCE_REVISION_QUALIFIED_WORKSPACE_MISMATCH'
        : unique.length === 0
          ? 'GRAPHIFY_SOURCE_MISSING'
          : current.length === 0
            ? 'WORKSPACE_REVISION_MISMATCH'
            : 'AMBIGUOUS_REVISION_BINDING',
  };
});
const counts = {
  cohortRows: resultRows.length,
  currentWorkspaceRevision,
  liveBindingWorkspaceRevisions,
  workspaceRevisionSourceAligned: liveBindingWorkspaceRevisions.length === 1
    && liveBindingWorkspaceRevisions[0] === currentWorkspaceRevision,
  graphifyMatched: resultRows.filter((row) => row.graphifyRows > 0).length,
  currentWorkspaceMatched: resultRows.filter((row) => row.currentWorkspaceRows > 0).length,
  sourceRevisionQualified: resultRows.filter((row) => row.sourceRevisionQualifiedRows > 0).length,
  revisionQualified: resultRows.filter((row) => row.classification === 'CURRENT_REVISION_QUALIFIED').length,
  workspaceMismatchAfterSourceQualification: resultRows.filter((row) => row.classification === 'SOURCE_REVISION_QUALIFIED_WORKSPACE_MISMATCH').length,
  missing: resultRows.filter((row) => row.classification === 'GRAPHIFY_SOURCE_MISSING').length,
  mismatched: resultRows.filter((row) => row.classification === 'WORKSPACE_REVISION_MISMATCH').length,
  ambiguous: resultRows.filter((row) => row.classification === 'AMBIGUOUS_REVISION_BINDING').length,
};
const laterStatus = earlyStatus ?? (error
  ? 'LINEAGE_AUDIT_ERROR'
  : !counts.workspaceRevisionSourceAligned
    ? 'WORKSPACE_REVISION_SOURCE_MISMATCH'
  : counts.revisionQualified > 0
    ? 'CURRENT_LINEAGE_COHORT_FOUND'
    : counts.sourceRevisionQualified > 0
      ? 'SOURCE_LINEAGE_COHORT_FOUND_WORKSPACE_MISMATCH'
      : 'CURRENT_LINEAGE_COHORT_EMPTY');
const laterNextGate = earlyStatus === 'CURRENT_WORKSPACE_FRAME_UNRESOLVED'
  ? 'CURRENT_WORKSPACE_FRAME_ADMISSION_REQUIRED'
  : earlyStatus === 'CURRENT_WORKSPACE_FRAME_CONFLICT'
    ? 'CURRENT_WORKSPACE_FRAME_CONFLICT_RECONCILIATION_REQUIRED'
      : earlyStatus === 'CURRENT_WORKSPACE_FRAME_NON_AUTHORITATIVE'
      ? 'CURRENT_WORKSPACE_FRAME_AUTHORITATIVE_RECEIPT_REQUIRED'
      : sourceOwner?.workspace?.admittedSnapshotDelta?.requiresSnapshotRefresh === true
        ? 'CURRENT_SOURCE_AUTHORITY_RECONCILIATION_REQUIRED'
      : !counts.workspaceRevisionSourceAligned
        ? 'WORKSPACE_REVISION_SOURCE_RECONCILIATION_REQUIRED'
        : counts.sourceRevisionQualified > 0
          ? 'SOURCE_PROJECTION_EXACT_BYTES_ADMISSION_REVIEW'
          : 'GRAPHIFY_REVISION_RECONCILIATION_REQUIRED';

const report = {
  schema: 'atlas.current-source-cohort-lineage.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_LINEAGE_AUDIT',
  inputs: {
    cohortChecksum: cohort.cohortChecksum ?? null,
    observationPath: path.relative(root, observationPath).replaceAll('\\', '/'),
    sourceOwnerPath: path.relative(root, sourceOwnerPath).replaceAll('\\', '/'),
    workspaceRevisionSource: workspaceFrame.selectedSource,
  },
  workspaceFrame: {
    status: workspaceFrame.status,
    selectedWorkspaceRevision: workspaceFrame.selectedWorkspaceRevision,
    selectedSource: workspaceFrame.selectedSource,
    selectedAuthority: workspaceFrame.selectedAuthority,
    authorityConflict: workspaceFrame.authorityConflict,
    blockers: workspaceFrame.blockers,
    frameAuthoritative: workspaceFrameAuthority.frameAuthoritative,
    canonicalAuthority: workspaceFrameAuthority.canonicalAuthority,
    promotionEligible: workspaceFrameAuthority.promotionEligible,
  },
  observationWorkspaceRevision,
  observationMatchesSelectedFrame,
  sourceAuthority: {
    status: sourceOwner?.admission?.status ?? 'NOT_PROVEN',
    safeToPromote: sourceOwner?.admission?.safeToPromote === true,
    requiresSnapshotRefresh: sourceOwner?.workspace?.admittedSnapshotDelta?.requiresSnapshotRefresh === true,
    deltaChecksum: sourceOwner?.workspace?.admittedSnapshotDelta?.deltaChecksum ?? null,
  },
  counts,
  rows: resultRows,
  databaseError: error,
  sourceRevisionRequired: true,
  canonicalAuthority: false,
  postgresWrites: false,
  graphifyWrites: false,
  qdrantWrites: false,
  status: laterStatus,
  nextGate: laterNextGate,
};
report.reportChecksum = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
// The workstation may read this receipt while the audit is producing it. Use
// an atomic sibling replacement so readers never see partial JSON and Windows
// does not race a direct truncate/write against an open report.
const reportTempPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
try {
  fs.writeFileSync(reportTempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(reportTempPath, reportPath);
} finally {
  try { fs.unlinkSync(reportTempPath); } catch {}
}
console.log(JSON.stringify({ status: report.status, counts, reportPath: 'docs/reports/current-source-cohort-lineage-v1.json' }, null, 2));
