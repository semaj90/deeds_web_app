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
import { compareCurrentSourceToHistoricalBindingsV1, validateCurrentSourceAuthorityInputsV1 } from './lib/current-source-lineage-readback-v1.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cohortPath = path.join(root, 'docs/reports/current-source-projection-cohort-v1.json');
const observationPath = path.join(root, 'docs/reports/workspace-source-binding-observation.json');
const argValue = (name) => {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const reportPath = path.resolve(root, argValue('output') ?? 'docs/reports/current-source-cohort-lineage-v1.json');
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

let sourceAuthorityInputs = null;
let sourceAuthorityInputPaths = null;
const admissionArg = argValue('admission-receipt');
if (admissionArg) {
  const admissionPath = path.resolve(root, admissionArg);
  const admissionBytes = fs.readFileSync(admissionPath);
  const admission = JSON.parse(admissionBytes.toString('utf8'));
  const preflightPath = path.resolve(root, admission.preflightPath ?? '');
  const manifestPath = path.resolve(root, argValue('manifest') ?? admission.manifestPath ?? '');
  const preflightBytes = fs.readFileSync(preflightPath);
  const manifestBytes = fs.readFileSync(manifestPath);
  const preflight = JSON.parse(preflightBytes.toString('utf8'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const sha256 = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
  sourceAuthorityInputs = validateCurrentSourceAuthorityInputsV1({
    admission, preflight, manifest,
    admissionReceiptSha256: sha256(admissionBytes),
    preflightSha256: sha256(preflightBytes),
    manifestSha256: sha256(manifestBytes),
  });
  sourceAuthorityInputs.manifest = manifest;
  sourceAuthorityInputPaths = {
    admission: path.relative(root, admissionPath).replaceAll('\\', '/'),
    preflight: path.relative(root, preflightPath).replaceAll('\\', '/'),
    manifest: path.relative(root, manifestPath).replaceAll('\\', '/'),
  };
}
const auditImplementation = [
  'scripts/atlas/audit-current-source-cohort-lineage-v1.mjs',
  'scripts/atlas/lib/current-source-lineage-readback-v1.mjs',
].map((sourceRef) => {
  const bytes = fs.readFileSync(path.join(root, sourceRef));
  const contentDigest = crypto.createHash('sha256').update(bytes).digest('hex');
  const manifestRow = sourceAuthorityInputs?.manifest?.sources?.find((row) => row.repositoryId === 'repo:root' && row.sourceRef === sourceRef);
  return { sourceRef, contentDigest, manifestContentDigest: manifestRow?.contentDigest ?? null, matchesAdmittedManifest: manifestRow?.contentDigest === contentDigest };
});

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
if (sourceAuthorityInputs && !sourceAuthorityInputs.valid) {
  earlyStatus = 'SOURCE_AUTHORITY_INPUTS_INVALID';
} else if (!sourceAuthorityInputs && workspaceFrame.status !== 'CURRENT_WORKSPACE_FRAME_SELECTED') {
  earlyStatus = 'CURRENT_WORKSPACE_FRAME_UNRESOLVED';
} else if (!sourceAuthorityInputs && workspaceFrame.authorityConflict) {
  earlyStatus = 'CURRENT_WORKSPACE_FRAME_CONFLICT';
} else if (!sourceAuthorityInputs && !workspaceFrameAuthority.frameAuthoritative) {
  earlyStatus = 'CURRENT_WORKSPACE_FRAME_NON_AUTHORITATIVE';
}

// A current revision is selected only from an exact-byte-bound, source-only admission receipt.
// Without that independent evidence the legacy selector is diagnostic, not currentness proof.
const currentWorkspaceRevision = sourceAuthorityInputs?.valid ? sourceAuthorityInputs.workspaceRevision : null;
const rows = cohort.cohort ?? [];
const refs = rows.map((row) => String(row.relativePath ?? '').trim()).filter(Boolean);
const prefixedRefs = refs.map((ref) => ref.startsWith('sveltekit-frontend/') ? ref : `sveltekit-frontend/${ref}`);
let graphifyRows = [];
let liveBindingWorkspaceRevisions = [];
let currentBindings = [];
let historicalBindings = [];
let historicalWorkspaceRevision = null;
let historicalFrameAmbiguous = false;
let sourceDelta = null;
let error = null;
if (earlyStatus === null && currentWorkspaceRevision !== null) {
  // Only query Postgres once the workspace frame is resolved, authoritative, and conflict-free —
  // a comparison run against an unresolved/non-authoritative/conflicted frame would produce a
  // misleading cohort verdict, per CURRENT-WORKSPACE-FRAME-AUTHORITY-SEMANTICS-01.
  const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 120000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    liveBindingWorkspaceRevisions = (await client.query(
      `select distinct workspace_revision::text as workspace_revision
       from public.atlas_workspace_source_bindings
       where repo_id = 'deeds-web-app'
       order by workspace_revision::text`,
    )).rows.map((row) => String(row.workspace_revision ?? '').trim()).filter(Boolean);
    currentBindings = (await client.query(
      `select repo_id, workspace_revision, canonical_source_ref, source_revision, content_digest, byte_length::text as byte_length, observed_at
       from public.atlas_workspace_source_bindings
       where repo_id = 'deeds-web-app' and workspace_revision = $1
       order by canonical_source_ref`,
      [currentWorkspaceRevision],
    )).rows;
    const historicalCandidates = (await client.query(
      `select workspace_revision, max(observed_at) as last_observed_at, count(*)::int as row_count
       from public.atlas_workspace_source_bindings
       where repo_id = 'deeds-web-app' and workspace_revision <> $1
       group by workspace_revision
       order by max(observed_at) desc, workspace_revision
       limit 2`,
      [currentWorkspaceRevision],
    )).rows;
    if (historicalCandidates.length > 0) {
      const latestAt = new Date(historicalCandidates[0].last_observed_at).getTime();
      const tied = historicalCandidates.filter((candidate) => new Date(candidate.last_observed_at).getTime() === latestAt);
      historicalFrameAmbiguous = tied.length > 1;
      if (!historicalFrameAmbiguous) {
        historicalWorkspaceRevision = String(historicalCandidates[0].workspace_revision);
        historicalBindings = (await client.query(
          `select repo_id, workspace_revision, canonical_source_ref, source_revision, content_digest, byte_length::text as byte_length, observed_at
           from public.atlas_workspace_source_bindings
           where repo_id = 'deeds-web-app' and workspace_revision = $1
           order by canonical_source_ref`,
          [historicalWorkspaceRevision],
        )).rows;
      }
    }
    graphifyRows = (await client.query(
      `select source_ref, content_hash, workspace_revision, code_source_revision, source_revision
       from public.graphify_files
       where source_ref = any($1::text[]) or source_ref = any($2::text[])
       order by source_ref`,
      [refs, prefixedRefs],
    )).rows;
    if (!historicalFrameAmbiguous && historicalWorkspaceRevision && sourceAuthorityInputs?.valid) {
      sourceDelta = compareCurrentSourceToHistoricalBindingsV1({
        snapshotSources: sourceAuthorityInputs.manifest.sources,
        historicalBindings,
        currentBindings,
        workspaceRevision: currentWorkspaceRevision,
      });
      sourceDelta.historicalWorkspaceRevision = historicalWorkspaceRevision;
      sourceDelta.historicalFrameAmbiguous = false;
    }
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    error = err instanceof Error ? err.message : String(err);
  } finally {
    client.release();
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
  const current = currentWorkspaceRevision === null
    ? null
    : unique.filter((match) => match.workspace_revision === currentWorkspaceRevision && String(match.workspace_revision ?? '').startsWith('sha256:'));
  const expectedSourceRevision = String(row.sourceRevision ?? '').trim();
  const expectedContentHash = String(row.filesystemHash ?? '').trim().toLowerCase().replace(/^sha256:/, '');
  const qualified = unique.filter((match) => {
    const actualRevision = String(match.code_source_revision ?? match.source_revision ?? '').trim();
    const actualHash = String(match.content_hash ?? '').trim().toLowerCase().replace(/^sha256:/, '');
    return Boolean(actualRevision)
      && (!expectedSourceRevision || actualRevision === expectedSourceRevision)
      && (!expectedContentHash || actualHash === expectedContentHash);
  });
  const workspaceQualified = currentWorkspaceRevision === null
    ? null
    : qualified.filter((match) => match.workspace_revision === currentWorkspaceRevision && String(match.workspace_revision ?? '').startsWith('sha256:'));
  return {
    relativePath: row.relativePath,
    graphifyRows: unique.length,
    currentWorkspaceRows: current?.length ?? null,
    sourceRevisionQualifiedRows: qualified.length,
    revisionQualifiedRows: qualified.length,
    workspaceRevisionQualifiedRows: workspaceQualified?.length ?? null,
    sourceRevision: qualified[0]?.code_source_revision ?? qualified[0]?.source_revision ?? row.sourceRevision ?? null,
    workspaceRevision: qualified[0]?.workspace_revision ?? null,
    classification: qualified.length === 1 && workspaceQualified?.length === 1
      ? 'CURRENT_REVISION_QUALIFIED'
      : qualified.length === 1 && currentWorkspaceRevision === null
        ? 'SOURCE_REVISION_QUALIFIED_WORKSPACE_CURRENTNESS_UNKNOWN'
        : qualified.length === 1
          ? 'SOURCE_REVISION_QUALIFIED_WORKSPACE_MISMATCH'
        : unique.length === 0
          ? 'GRAPHIFY_SOURCE_MISSING'
          : currentWorkspaceRevision !== null && current.length === 0
            ? 'WORKSPACE_REVISION_MISMATCH'
            : 'AMBIGUOUS_REVISION_BINDING',
  };
});
const counts = {
  cohortRows: resultRows.length,
  currentWorkspaceRevision,
  liveBindingWorkspaceRevisions,
  workspaceRevisionSourceAligned: currentWorkspaceRevision === null
    ? null
    : liveBindingWorkspaceRevisions.length === 1 && liveBindingWorkspaceRevisions[0] === currentWorkspaceRevision,
  graphifyMatched: resultRows.filter((row) => row.graphifyRows > 0).length,
  currentWorkspaceMatched: currentWorkspaceRevision === null
    ? null
    : resultRows.filter((row) => row.currentWorkspaceRows > 0).length,
  workspaceCurrentnessUnknown: currentWorkspaceRevision === null
    ? resultRows.filter((row) => row.sourceRevisionQualifiedRows > 0).length
    : 0,
  sourceRevisionQualified: resultRows.filter((row) => row.sourceRevisionQualifiedRows > 0).length,
  revisionQualified: resultRows.filter((row) => row.classification === 'CURRENT_REVISION_QUALIFIED').length,
  workspaceMismatchAfterSourceQualification: currentWorkspaceRevision === null
    ? null
    : resultRows.filter((row) => row.classification === 'SOURCE_REVISION_QUALIFIED_WORKSPACE_MISMATCH').length,
  missing: resultRows.filter((row) => row.classification === 'GRAPHIFY_SOURCE_MISSING').length,
  mismatched: resultRows.filter((row) => row.classification === 'WORKSPACE_REVISION_MISMATCH').length,
  ambiguous: resultRows.filter((row) => row.classification === 'AMBIGUOUS_REVISION_BINDING').length,
};
const laterStatus = earlyStatus ?? (error
  ? 'LINEAGE_AUDIT_ERROR'
  : currentWorkspaceRevision === null
    ? 'WORKSPACE_CURRENTNESS_UNAVAILABLE'
  : historicalFrameAmbiguous
    ? 'HISTORICAL_BINDING_FRAME_AMBIGUOUS'
  : !historicalWorkspaceRevision
    ? 'HISTORICAL_BINDING_FRAME_MISSING'
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
      : currentWorkspaceRevision === null
        ? 'WORKSPACE_CURRENTNESS_READBACK_REQUIRED'
      : historicalFrameAmbiguous || !historicalWorkspaceRevision
        ? 'HISTORICAL_BINDING_FRAME_REVIEW_REQUIRED'
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
    workspaceRevisionSource: sourceAuthorityInputs?.valid ? 'EXACT_HASH_BOUND_TOURNAMENT_ADMISSION' : workspaceFrame.selectedSource,
    sourceAuthorityInputPaths,
  },
  workspaceFrame: {
    status: workspaceFrame.status,
    selectedWorkspaceRevision: currentWorkspaceRevision ?? workspaceFrame.selectedWorkspaceRevision,
    selectedSource: sourceAuthorityInputs?.valid ? 'EXACT_HASH_BOUND_TOURNAMENT_ADMISSION' : workspaceFrame.selectedSource,
    selectedAuthority: sourceAuthorityInputs?.valid ? true : workspaceFrame.selectedAuthority,
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
  currentSourceReadback: {
    admissionScope: sourceAuthorityInputs?.admissionScope ?? null,
    inputValidation: sourceAuthorityInputs ? { valid: sourceAuthorityInputs.valid, reasons: sourceAuthorityInputs.reasons } : null,
    inputPaths: sourceAuthorityInputPaths,
    currentWorkspaceRevision,
    currentBindingRows: currentBindings.length,
    historicalWorkspaceRevision,
    historicalBindingRows: historicalBindings.length,
    historicalFrameAmbiguous,
    delta: sourceDelta,
    canonicalAuthority: false,
    writesPerformed: false,
  },
  auditImplementation,
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
console.log(JSON.stringify({ status: report.status, counts, reportPath: path.relative(root, reportPath).replaceAll('\\', '/') }, null, 2));
