#!/usr/bin/env node
/**
 * S01-10D (fresh freeze against the current authoritative S01-10C preview, supersedes the manifest frozen from the
 * superseded lighter preview). READ ONLY: independently re-selects the exact-repairable population from the live DB
 * (not merely copying the preview's candidate list), verifies it against the preview's own counts, and freezes a
 * checksummed manifest. Performs ZERO writes to atlas_symbol_registry / atlas_symbol_versions.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-revision-placeholder-repair-manifest.v1';
const REPO_ID = 'deeds-web-app';

const previewPointer = path.join(root, 'docs/reports/symbol-revision-placeholder-repair-preview-v1.json');
const preview = JSON.parse(fs.readFileSync(previewPointer, 'utf8'));
if (preview.status !== 'SYMBOL_REVISION_REPAIR_PREVIEW_READY') { console.error('S01-10C preview is not READY; refusing to freeze'); process.exit(2); }
const previewBody = fs.readFileSync(previewPointer, 'utf8');
const previewChecksum = 'sha256:' + crypto.createHash('sha256').update(previewBody).digest('hex');
const ADMITTED_WORKSPACE_REVISION = preview.inputAuthority.admittedWorkspaceRevision;
const cohort = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/current-source-authority-cohort-v1.json'), 'utf8'));
const cohortBody = fs.readFileSync(path.join(root, 'docs/reports/current-source-authority-cohort-v1.json'), 'utf8');
const sealedCohortChecksum = 'sha256:' + crypto.createHash('sha256').update(cohortBody).digest('hex');
if (cohort.status !== 'CURRENT_SOURCE_AUTHORITY_PROVEN') { console.error('S01-07 cohort is not PROVEN'); process.exit(2); }

const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
try {
  const bad = (await pool.query(`SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision, workspace_revision FROM atlas_symbol_versions WHERE source_revision ~ '^workspace:\\d+$' OR source_revision ~ '^[0-9a-f]{40}$'`)).rows;
  const refs = [...new Set(bad.map((r) => r.source_ref).filter(Boolean))];
  const bindingRows = refs.length ? (await pool.query(`SELECT canonical_source_ref, source_revision, content_digest FROM atlas_workspace_source_bindings WHERE repo_id = $1 AND canonical_source_ref = ANY($2::text[]) AND workspace_revision = $3`, [REPO_ID, refs, ADMITTED_WORKSPACE_REVISION])).rows : [];
  const byRef = new Map(bindingRows.map((r) => [r.canonical_source_ref, r]));

  const manifestRows = [];
  let sourceUnavailable = 0;
  for (const row of bad) {
    const b = byRef.get(row.source_ref);
    if (!b) { sourceUnavailable += 1; continue; }
    const proposedSourceRevision = `sha256:${b.content_digest}`;
    if (!/^[0-9a-f]{64}$/.test(b.content_digest) || b.source_revision !== proposedSourceRevision) { sourceUnavailable += 1; continue; }
    manifestRows.push({
      symbolVersionId: row.symbol_version_id, stableSymbolId: row.stable_symbol_id, sourceRef: row.source_ref,
      precondition: { symbolVersionId: row.symbol_version_id, oldSourceRevision: row.source_revision, oldWorkspaceRevision: row.workspace_revision },
      proposed: { sourceRevision: proposedSourceRevision, workspaceRevision: ADMITTED_WORKSPACE_REVISION },
      updateTemplate: 'UPDATE atlas_symbol_versions SET source_revision = $newSourceRevision, workspace_revision = $newWorkspaceRevision WHERE symbol_version_id = $symbolVersionId AND source_revision = $oldSourceRevision AND workspace_revision = $oldWorkspaceRevision',
    });
  }
  const reconciles = manifestRows.length === (preview.versionClassificationCounts.EXACT_REPAIR ?? -1)
    && sourceUnavailable === (preview.versionClassificationCounts.SOURCE_NOT_IN_COHORT ?? -1)
    && manifestRows.length + sourceUnavailable === bad.length;

  const dupCheck = manifestRows.length ? (await pool.query(
    `SELECT v.stable_symbol_id, v.source_revision, count(*) c
       FROM atlas_symbol_versions v
       JOIN (SELECT unnest($1::text[]) AS stable_symbol_id, unnest($2::text[]) AS source_revision) proposed
         ON v.stable_symbol_id = proposed.stable_symbol_id AND v.source_revision = proposed.source_revision
      WHERE v.symbol_version_id != ALL($3::text[])
      GROUP BY 1, 2`,
    [manifestRows.map((r) => r.stableSymbolId), manifestRows.map((r) => r.proposed.sourceRevision), manifestRows.map((r) => r.symbolVersionId)],
  )).rows : [];

  const manifestCore = { schema: SCHEMA, previewChecksum, sealedCohortChecksum, admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION, rows: manifestRows };
  const manifestChecksum = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(manifestCore)).digest('hex');

  const status = reconciles && dupCheck.length === 0 ? 'REPAIR_MANIFEST_FROZEN' : 'REPAIR_MANIFEST_BLOCKED';
  const receipt = {
    schema: SCHEMA, generatedAt: new Date().toISOString(),
    supersedes: 'docs/reports/symbol-revision-repair-manifest-v1.json (frozen from the superseded lighter S01-10C preview; do not use for apply)',
    previewChecksum, previewSource: 'docs/reports/symbol-revision-placeholder-repair-preview-v1.json',
    sealedCohortChecksum, sealedCohortSource: 'docs/reports/current-source-authority-cohort-v1.json',
    admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION,
    reconciliation: { manifestRowCount: manifestRows.length, sourceUnavailableCount: sourceUnavailable, totalBadVersionRows: bad.length, matchesPreview: reconciles, preexistingTargetIdentityCollisions: dupCheck.length },
    manifestChecksum, rows: manifestRows,
    safety: { databaseWrites: 0, historicalRowsChanged: 0, versionRowsUpdated: 0, graphifyRun: false, stableFileIdCreated: false, readerCutover: false },
    applyAuthorization: { required: true, note: 'This manifest is frozen and READ-ONLY. It authorizes nothing on its own.', tokenSuppliedThisRun: false },
    status,
  };
  const body = JSON.stringify(receipt, null, 2);
  const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
  const immutable = path.join(root, 'docs/reports', `symbol-revision-placeholder-repair-manifest-v1.${sha12}.json`);
  const pointer = path.join(root, 'docs/reports/symbol-revision-placeholder-repair-manifest-v1.json');
  fs.writeFileSync(immutable, body + '\n', { flag: 'wx' });
  fs.writeFileSync(pointer, body + '\n');
  console.log(status, immutable);
  console.log('rows:', manifestRows.length, 'sourceUnavailable:', sourceUnavailable, 'dupCollisions:', dupCheck.length, 'manifestChecksum:', manifestChecksum);
} finally {
  await pool.end();
}
