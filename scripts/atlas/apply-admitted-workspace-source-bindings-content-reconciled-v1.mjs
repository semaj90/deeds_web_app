#!/usr/bin/env node
/**
 * Binds the tournament-admitted workspace revision (sha256:322ed1a6...) to real
 * atlas_workspace_source_bindings rows, using content-hash reconciliation against the live
 * Graphify owner run (workspace_revision sha256:e0dc2711..., 23,758 real graphify_files rows).
 *
 * Rationale (see openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md,
 * "Workspace-revision identity reconciliation" follow-up, 2026-09-13): a read-only comparison
 * found the admitted snapshot's repo:root sources are 98.4% content-hash-identical to the live
 * e0dc2711 cohort -- the same underlying codebase lineage ~2 days apart, not a different history.
 * This script binds ONLY the exact-content-match subset (never a fabricated or approximate match),
 * further restricted to sourceRefs that already exist in atlas_source_refs (the binding table's own
 * FK requires it). No row is bound on path-only, basename-only, or any fallback identity -- every
 * bound row is a live, byte-verified content match between the sealed admitted snapshot and a real
 * Graphify-observed file.
 *
 * Default: --dry-run (report only, no writes). Explicit --apply required to commit.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  planWorkspaceSourceBindingsV1,
  verifyWorkspaceSourceBindingReadbackV1,
} from './lib/workspace-source-binding-reconciliation-v1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
import { assertCanonicalWriteAuthorized } from './lib/admission-write-guard-v1.mjs';
const ADMISSION_PATH = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const REPO_ID = 'deeds-web-app';
const ownerArg = process.argv.find((v) => v.startsWith('--owner-run-revision='))?.slice('--owner-run-revision='.length);
const OWNER_RUN_WORKSPACE_REVISION = ownerArg ?? 'sha256:e0dc2711f632e38607cb19fe3ca74e9e37ff864027857062e6e4be6ac86241bb';
const APPLY = process.argv.includes('--apply');
const expectedCandidateSetSha256 = process.argv.find((v) => v.startsWith('--expected-candidate-set-sha256='))?.slice('--expected-candidate-set-sha256='.length) ?? null;
const expectedCandidateCountText = process.argv.find((v) => v.startsWith('--expected-candidate-count='))?.slice('--expected-candidate-count='.length) ?? null;

const admission = JSON.parse(readFileSync(ADMISSION_PATH, 'utf8'));
const admittedWorkspaceRevision = admission.workspaceRevision;
const confirmToken = '--confirm-canonical-source-bindings-v1=AUTHORIZE_CANONICAL_SOURCE_BINDING_WRITE_V1';
const reportArg = process.argv.find((v) => v.startsWith('--report='))?.slice('--report='.length);
const defaultReportPath = `docs/reports/apply-admitted-workspace-source-bindings-content-reconciled-${admittedWorkspaceRevision.slice(7, 19)}-v1.json`;
const REPORT_PATH = resolve(ROOT, reportArg ?? defaultReportPath);
if (reportArg) {
  const scratchRoot = resolve(ROOT, '.tmp/atlas');
  const relativeReport = relative(scratchRoot, REPORT_PATH);
  if (!relativeReport || relativeReport.startsWith('..') || isAbsolute(relativeReport)) {
    throw new Error('SCRATCH_REPORT_PATH_REQUIRED');
  }
}
let snapshot;
if (APPLY) {
  ({ manifest: snapshot } = assertCanonicalWriteAuthorized({ root: ROOT, admission, apply: true, argv: process.argv.slice(2), confirmToken }));
  if (!/^sha256:[0-9a-f]{64}$/i.test(expectedCandidateSetSha256 ?? '')
    || !Number.isInteger(Number(expectedCandidateCountText)) || Number(expectedCandidateCountText) < 1) {
    throw new Error('EXACT_CANDIDATE_SET_APPROVAL_REQUIRED');
  }
} else {
  if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
    throw new Error('ADMITTED_WORKSPACE_REVISION_RECEIPT_NOT_AUTHORITATIVE');
  }
  if (typeof admission.manifestPath !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(String(admission.manifestSha256 ?? ''))) {
    throw new Error('ADMISSION_MANIFEST_BINDING_MISSING');
  }
  const manifestPath = resolve(ROOT, admission.manifestPath);
  const manifestBytes = readFileSync(manifestPath);
  const actualManifestSha256 = `sha256:${createHash('sha256').update(manifestBytes).digest('hex')}`;
  if (actualManifestSha256 !== admission.manifestSha256) throw new Error('ADMISSION_MANIFEST_SHA256_MISMATCH');
  snapshot = JSON.parse(manifestBytes.toString('utf8'));
  if (snapshot.snapshotRevision !== admission.snapshotRevision) throw new Error('ADMISSION_SNAPSHOT_REVISION_MISMATCH');
}
if (snapshot.snapshotRevision !== admission.snapshotRevision) throw new Error('SEALED_SNAPSHOT_MISMATCH');
const rootSources = snapshot.sources.filter((s) => s.repositoryId === 'repo:root');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let report;
try {
  const graphRowsResult = await pool.query(
    `SELECT source_ref, content_hash, byte_length FROM public.graphify_files WHERE workspace_revision = $1`,
    [OWNER_RUN_WORKSPACE_REVISION],
  );
  const registryResult = await pool.query(
    `SELECT source_ref_key, source_type::text, content_hash FROM public.atlas_source_refs
      WHERE repo_id = $1 AND source_ref_key = ANY($2::text[])`,
    [REPO_ID, rootSources.map((source) => source.sourceRef)],
  );
  const existingResult = await pool.query(
    `SELECT canonical_source_ref, source_revision, content_digest, byte_length,
            source_manifest_ordinal, producer_revision, binding_checksum
       FROM public.atlas_workspace_source_bindings
      WHERE repo_id = $1 AND workspace_revision = $2 AND canonical_source_ref = ANY($3::text[])`,
    [REPO_ID, admittedWorkspaceRevision, rootSources.map((source) => source.sourceRef)],
  );
  const producerRevision = `workspace-revision-content-reconciliation.v1:${OWNER_RUN_WORKSPACE_REVISION.slice(7, 15)}-vs-${admittedWorkspaceRevision.slice(7, 15)}`;
  const plan = planWorkspaceSourceBindingsV1({
    snapshotSources: snapshot.sources,
    graphRows: graphRowsResult.rows,
    registryRows: registryResult.rows,
    existingBindings: existingResult.rows,
    repoId: REPO_ID,
    workspaceRevision: admittedWorkspaceRevision,
    producerRevision,
  });
  const bindingRows = plan.rows;

  if (APPLY && (expectedCandidateSetSha256 !== plan.candidateBindingSetSha256
    || Number(expectedCandidateCountText) !== bindingRows.length)) {
    throw new Error('APPROVED_CANDIDATE_SET_MISMATCH');
  }

  report = {
    schema: 'atlas.apply-admitted-workspace-source-bindings-content-reconciled.v1',
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    admittedWorkspaceRevision,
    ownerRunWorkspaceRevision: OWNER_RUN_WORKSPACE_REVISION,
    admittedRootSources: rootSources.length,
    counts: {
      ...plan.counts,
      candidateBindings: bindingRows.length,
    },
    candidateBindingSetSha256: plan.candidateBindingSetSha256,
    candidateBindingSamples: bindingRows.slice(0, 5).map((row) => ({
      repoId: row.repoId,
      workspaceRevision: row.workspaceRevision,
      sourceRef: row.sourceRef,
      sourceRevision: row.sourceRevision,
      contentDigest: row.contentDigest,
      byteLength: row.byteLength,
      sourceManifestOrdinal: row.sourceManifestOrdinal,
      producerRevision: row.producerRevision,
      bindingChecksum: row.bindingChecksum,
    })),
    committed: false,
    insertedCount: 0,
    readbackCount: 0,
    status: 'PLANNED',
  };

  if (APPLY && bindingRows.length > 0) {
    await pool.query('BEGIN');
    try {
      const insertResult = await pool.query(
        `INSERT INTO public.atlas_workspace_source_bindings
           (repo_id, workspace_revision, canonical_source_ref, source_revision,
            content_digest, byte_length, source_manifest_ordinal, producer_revision,
            binding_checksum)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
                              $6::bigint[], $7::integer[], $8::text[], $9::text[])
         ON CONFLICT (repo_id, workspace_revision, canonical_source_ref) DO NOTHING`,
        [bindingRows.map((row) => row.repoId), bindingRows.map((row) => row.workspaceRevision),
          bindingRows.map((row) => row.sourceRef), bindingRows.map((row) => row.sourceRevision),
          bindingRows.map((row) => row.contentDigest), bindingRows.map((row) => row.byteLength),
          bindingRows.map((row) => row.sourceManifestOrdinal), bindingRows.map((row) => row.producerRevision),
          bindingRows.map((row) => row.bindingChecksum)],
      );
      const readback = await pool.query(
        `SELECT canonical_source_ref, source_revision, content_digest, byte_length,
                source_manifest_ordinal, producer_revision, binding_checksum
           FROM public.atlas_workspace_source_bindings
          WHERE repo_id = $1 AND workspace_revision = $2 AND canonical_source_ref = ANY($3::text[])
          ORDER BY canonical_source_ref`,
        [REPO_ID, admittedWorkspaceRevision, bindingRows.map((row) => row.sourceRef)],
      );
      const verified = verifyWorkspaceSourceBindingReadbackV1(bindingRows, readback.rows);
      await pool.query('COMMIT');
      report.committed = true;
      report.insertedCount = insertResult.rowCount;
      report.readbackCount = verified.verifiedCount;
      report.status = 'BINDINGS_INSERT_AND_ROW_READBACK_PROVEN';
    } catch (error) {
      await pool.query('ROLLBACK').catch(() => {});
      report.status = 'APPLY_FAILED';
      report.error = error instanceof Error ? error.message : String(error);
    }
  } else {
    report.status = APPLY ? 'NO_CANDIDATE_ROWS' : 'DRY_RUN_PLANNED';
  }
} finally {
  await pool.end();
}

mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
