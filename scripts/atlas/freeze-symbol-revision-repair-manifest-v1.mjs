#!/usr/bin/env node
/**
 * S01-10D — freeze the S01-10C repair preview into an immutable, checksummed manifest of EXACT_REPAIR-only rows.
 * READ-ONLY: reads the S01-10C preview receipt and the live DB for an independent readback of the same rows (still SELECT-only),
 * writes ONLY receipt files. Performs ZERO writes to atlas_symbol_registry / atlas_symbol_versions.
 *
 * Scope: atlas_symbol_versions EXACT_REPAIR rows only, per S01-10C's scope (registry rows are informational there and stay out
 * of this manifest pending S01-10-schema). The manifest freezes: symbolVersionId, prior (source_revision, workspace_revision),
 * proposed (source_revision, workspace_revision), and a per-row precondition (`WHERE symbol_version_id = ? AND source_revision =
 * OLD AND workspace_revision = OLD`) that S01-10E must use unmodified — this script does not execute any UPDATE.
 *
 * This manifest does NOT authorize a write. Applying it requires the operator to type an explicit apply-authorization token for
 * this exact gate (a bare "continue" is not approval) before S01-10E runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-revision-repair-manifest-v1';
const previewPointer = path.join(root, 'docs/reports/symbol-revision-repair-preview-v1.json');
if (!fs.existsSync(previewPointer)) { console.error('S01-10C preview receipt missing; run plan-symbol-revision-repair-preview-v1.mjs first'); process.exit(2); }
const preview = JSON.parse(fs.readFileSync(previewPointer, 'utf8'));
if (preview.status !== 'REPAIR_PREVIEW_COMPLETE' || !preview.reconciliation?.inputPopulationMatchesFrozenBaseline) {
  console.error('S01-10C preview is not RECONCILED/COMPLETE; refusing to freeze a manifest from an unreconciled preview');
  process.exit(2);
}
const previewBody = fs.readFileSync(previewPointer, 'utf8');
const previewChecksum = 'sha256:' + crypto.createHash('sha256').update(previewBody).digest('hex');

const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
if (!DATABASE_URL) { console.error('DATABASE_URL_MIGRATOR or DATABASE_URL is required'); process.exit(2); }
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

try {
  // Re-select the full (not sampled) EXACT_REPAIR version population directly, independent of the preview's 10-row sample,
  // using the same resolution rule (exact provenance under the admitted workspace revision).
  const ADMITTED_WORKSPACE_REVISION = preview.admittedWorkspace.workspaceRevision;
  const bad = await pool.query(`SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision, workspace_revision FROM atlas_symbol_versions WHERE source_revision ~ '^workspace:\\d+$' OR source_revision ~ '^[0-9a-f]{40}$'`);
  const refs = [...new Set(bad.rows.map((r) => r.source_ref).filter(Boolean))];
  const bindingRes = refs.length
    ? await pool.query(`SELECT canonical_source_ref, source_revision, content_digest FROM atlas_workspace_source_bindings WHERE repo_id = 'deeds-web-app' AND canonical_source_ref = ANY($1::text[]) AND workspace_revision = $2`, [refs, ADMITTED_WORKSPACE_REVISION])
    : { rows: [] };
  const byRef = new Map(bindingRes.rows.map((r) => [r.canonical_source_ref, r]));

  const manifestRows = [];
  let sourceUnavailable = 0;
  for (const row of bad.rows) {
    const binding = byRef.get(row.source_ref);
    if (!binding) { sourceUnavailable += 1; continue; }
    const proposedSourceRevision = `sha256:${binding.content_digest}`;
    if (binding.source_revision !== proposedSourceRevision || !/^[0-9a-f]{64}$/.test(binding.content_digest)) { sourceUnavailable += 1; continue; }
    manifestRows.push({
      symbolVersionId: row.symbol_version_id,
      stableSymbolId: row.stable_symbol_id,
      sourceRef: row.source_ref,
      precondition: { symbolVersionId: row.symbol_version_id, oldSourceRevision: row.source_revision, oldWorkspaceRevision: row.workspace_revision },
      proposed: { sourceRevision: proposedSourceRevision, workspaceRevision: ADMITTED_WORKSPACE_REVISION },
      updateTemplate: 'UPDATE atlas_symbol_versions SET source_revision = $newSourceRevision, workspace_revision = $newWorkspaceRevision WHERE symbol_version_id = $symbolVersionId AND source_revision = $oldSourceRevision AND workspace_revision = $oldWorkspaceRevision',
    });
  }

  const reconciles = manifestRows.length === (preview.versionPreview.tally.EXACT_REPAIR ?? -1)
    && sourceUnavailable === (preview.versionPreview.tally.SOURCE_UNAVAILABLE ?? -1)
    && manifestRows.length + sourceUnavailable === bad.rows.length
    && bad.rows.length === preview.reconciliation.badVersionRowCount;

  // Duplicate-target guard: repairing must not produce two rows sharing (stable_symbol_id, proposed source_revision, declaration_hash-equivalent identity)
  // that would collide on symbol_version_id uniqueness. Cheap proxy check here: no two manifest rows propose the identical (symbolVersionId) — trivially true
  // since symbolVersionId is the primary key of the source set — and no manifest row's proposed identity already exists as a DIFFERENT live row.
  const dupCheck = manifestRows.length ? await pool.query(
    `SELECT v.stable_symbol_id, v.source_revision, count(*) c
       FROM atlas_symbol_versions v
       JOIN (SELECT unnest($1::text[]) AS stable_symbol_id, unnest($2::text[]) AS source_revision) proposed
         ON v.stable_symbol_id = proposed.stable_symbol_id AND v.source_revision = proposed.source_revision
      WHERE v.symbol_version_id != ALL($3::text[])
      GROUP BY 1, 2`,
    [manifestRows.map((r) => r.stableSymbolId), manifestRows.map((r) => r.proposed.sourceRevision), manifestRows.map((r) => r.symbolVersionId)],
  ) : { rows: [] };
  const preexistingTargetIdentity = dupCheck.rows.length;

  const manifestCore = { schema: SCHEMA, previewChecksum, admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION, rows: manifestRows };
  const manifestChecksum = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(manifestCore)).digest('hex');

  const receipt = {
    schema: SCHEMA, generatedAt: new Date().toISOString(),
    previewChecksum, previewSource: 'docs/reports/symbol-revision-repair-preview-v1.json',
    admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION,
    reconciliation: { manifestRowCount: manifestRows.length, sourceUnavailableCount: sourceUnavailable, totalBadVersionRows: bad.rows.length, matchesPreview: reconciles, preexistingTargetIdentityCollisions: preexistingTargetIdentity },
    manifestChecksum, rows: manifestRows,
    safety: { databaseWrites: 0, historicalRowsChanged: 0, versionRowsUpdated: 0, graphifyRun: false, stableFileIdCreated: false, readerCutover: false },
    applyAuthorization: { required: true, note: 'This manifest is frozen and READ-ONLY. It authorizes nothing. S01-10E may run ONLY after the operator supplies an explicit apply-authorization token for this exact gate (e.g. "apply S01-10 placeholder repair"); a generic "continue" is NOT approval.', tokenSuppliedThisRun: false },
    status: reconciles && preexistingTargetIdentity === 0 ? 'REPAIR_MANIFEST_FROZEN' : 'REPAIR_MANIFEST_BLOCKED',
  };
  const body = JSON.stringify(receipt, null, 2);
  const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
  const immutable = path.join(root, 'docs/reports', `symbol-revision-repair-manifest-v1.${sha12}.json`);
  const pointer = path.join(root, 'docs/reports/symbol-revision-repair-manifest-v1.json');
  fs.writeFileSync(immutable, body + '\n', { flag: 'wx' });
  fs.writeFileSync(pointer, body + '\n');
  console.log(receipt.status, immutable);
  console.log('rows:', manifestRows.length, 'sourceUnavailable:', sourceUnavailable, 'preexistingTargetIdentityCollisions:', preexistingTargetIdentity);
} finally {
  await pool.end();
}
