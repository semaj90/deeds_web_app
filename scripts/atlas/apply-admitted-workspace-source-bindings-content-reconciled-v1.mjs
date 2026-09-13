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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ADMISSION_PATH = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const REPORT_PATH = resolve(ROOT, 'docs/reports/apply-admitted-workspace-source-bindings-content-reconciled-v1.json');
const REPO_ID = 'deeds-web-app';
const OWNER_RUN_WORKSPACE_REVISION = 'sha256:e0dc2711f632e38607cb19fe3ca74e9e37ff864027857062e6e4be6ac86241bb';
const APPLY = process.argv.includes('--apply');

const admission = JSON.parse(readFileSync(ADMISSION_PATH, 'utf8'));
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
  throw new Error('ADMITTED_WORKSPACE_REVISION_RECEIPT_NOT_AUTHORITATIVE');
}
const admittedWorkspaceRevision = admission.workspaceRevision;
const snapshotPath = resolve(ROOT, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`);
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
if (snapshot.snapshotRevision !== admission.snapshotRevision) throw new Error('SEALED_SNAPSHOT_MISMATCH');
const rootSources = snapshot.sources.filter((s) => s.repositoryId === 'repo:root');

const digest = (row) => createHash('sha256')
  .update(`${REPO_ID}:${row.workspaceRevision}:${row.sourceRef}:${row.sourceRevision}:${row.contentDigest}:${row.byteLength}:${row.producerRevision}`, 'utf8')
  .digest('hex');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let report;
try {
  const graphRowsResult = await pool.query(
    `SELECT source_ref, content_hash, byte_length FROM public.graphify_files WHERE workspace_revision = $1`,
    [OWNER_RUN_WORKSPACE_REVISION],
  );
  const graphByRef = new Map();
  for (const row of graphRowsResult.rows) {
    if (!graphByRef.has(row.source_ref)) graphByRef.set(row.source_ref, row);
  }

  const registryResult = await pool.query(
    `SELECT source_ref_key FROM public.atlas_source_refs WHERE repo_id = $1`,
    [REPO_ID],
  );
  const registrySet = new Set(registryResult.rows.map((r) => r.source_ref_key));

  const existingResult = await pool.query(
    `SELECT canonical_source_ref FROM public.atlas_workspace_source_bindings WHERE repo_id = $1 AND workspace_revision = $2`,
    [REPO_ID, admittedWorkspaceRevision],
  );
  const alreadyBound = new Set(existingResult.rows.map((r) => r.canonical_source_ref));

  let notInGraph = 0;
  let contentMismatch = 0;
  let notInRegistry = 0;
  let alreadyBoundCount = 0;
  const candidates = [];
  for (const s of rootSources) {
    const graphRow = graphByRef.get(s.sourceRef);
    if (!graphRow) { notInGraph += 1; continue; }
    if (graphRow.content_hash !== s.contentDigest) { contentMismatch += 1; continue; }
    if (!registrySet.has(s.sourceRef)) { notInRegistry += 1; continue; }
    if (alreadyBound.has(s.sourceRef)) { alreadyBoundCount += 1; continue; }
    candidates.push({
      sourceRef: s.sourceRef,
      contentDigest: s.contentDigest,
      byteLength: Number(graphRow.byte_length),
    });
  }
  candidates.sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));

  const producerRevision = 'workspace-revision-content-reconciliation.v1:e0dc2711-vs-322ed1a6';
  const bindingRows = candidates.map((c, index) => {
    const row = {
      repoId: REPO_ID,
      workspaceRevision: admittedWorkspaceRevision,
      sourceRef: c.sourceRef,
      sourceRevision: `sha256:${c.contentDigest}`,
      contentDigest: c.contentDigest,
      byteLength: c.byteLength,
      sourceManifestOrdinal: index,
      producerRevision,
    };
    return { ...row, bindingChecksum: digest(row) };
  });

  report = {
    schema: 'atlas.apply-admitted-workspace-source-bindings-content-reconciled.v1',
    generatedAt: new Date().toISOString(),
    apply: APPLY,
    admittedWorkspaceRevision,
    ownerRunWorkspaceRevision: OWNER_RUN_WORKSPACE_REVISION,
    admittedRootSources: rootSources.length,
    counts: {
      notInGraph,
      contentMismatch,
      notInRegistry,
      alreadyBound: alreadyBoundCount,
      candidateBindings: bindingRows.length,
    },
    committed: false,
    insertedCount: 0,
    readbackCount: 0,
    status: 'PLANNED',
  };

  if (APPLY && bindingRows.length > 0) {
    await pool.query('BEGIN');
    try {
      for (const row of bindingRows) {
        await pool.query(
          `INSERT INTO public.atlas_workspace_source_bindings
             (repo_id, workspace_revision, canonical_source_ref, source_revision,
              content_digest, byte_length, source_manifest_ordinal, producer_revision,
              binding_checksum)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (repo_id, workspace_revision, canonical_source_ref) DO NOTHING`,
          [row.repoId, row.workspaceRevision, row.sourceRef, row.sourceRevision, row.contentDigest,
            row.byteLength, row.sourceManifestOrdinal, row.producerRevision, row.bindingChecksum],
        );
      }
      const readback = await pool.query(
        `SELECT count(*)::int AS n FROM public.atlas_workspace_source_bindings WHERE repo_id = $1 AND workspace_revision = $2`,
        [REPO_ID, admittedWorkspaceRevision],
      );
      await pool.query('COMMIT');
      report.committed = true;
      report.insertedCount = bindingRows.length;
      report.readbackCount = readback.rows[0].n;
      report.status = report.readbackCount >= bindingRows.length ? 'BINDINGS_INSERT_AND_READBACK_PROVEN' : 'READBACK_MISMATCH';
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
