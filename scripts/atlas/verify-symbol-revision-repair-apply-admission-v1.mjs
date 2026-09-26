#!/usr/bin/env node
/**
 * S01-10D-VERIFY — final read-only apply admission check, requested explicitly before S01-10E is permitted to run.
 * READ ONLY: re-validates every manifest row directly against the live DB (not trusting the frozen manifest's own
 * snapshot), checks checksum identity across preview/manifest/cohort, and checks for any duplicate-target collision
 * that may have appeared since the manifest was frozen. Zero writes anywhere except the receipt files.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-revision-repair-apply-admission.v1';
const REPO_ID = 'deeds-web-app';

const previewPath = path.join(root, 'docs/reports/symbol-revision-placeholder-repair-preview-v1.json');
const manifestPath = path.join(root, 'docs/reports/symbol-revision-placeholder-repair-manifest-v1.json');
const cohortPath = path.join(root, 'docs/reports/current-source-authority-cohort-v1.json');
const preview = JSON.parse(fs.readFileSync(previewPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const cohort = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
const previewChecksumNow = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(previewPath, 'utf8')).digest('hex');
const cohortChecksumNow = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(cohortPath, 'utf8')).digest('hex');
const manifestCoreNow = { schema: manifest.schema, previewChecksum: manifest.previewChecksum, sealedCohortChecksum: manifest.sealedCohortChecksum, admittedWorkspaceRevision: manifest.admittedWorkspaceRevision, rows: manifest.rows };
const manifestChecksumNow = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(manifestCoreNow)).digest('hex');

const previewChecksumMatch = manifest.previewChecksum === previewChecksumNow;
const cohortChecksumMatch = manifest.sealedCohortChecksum === cohortChecksumNow;
const manifestChecksumMatch = manifest.manifestChecksum === manifestChecksumNow;

const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
try {
  // Arithmetic contract on the full 479-row population, closing S01-10C explicitly.
  const versionsTotal = preview.baseline.versionsTotal;
  const alreadyQualified = preview.baseline.alreadyQualifiedCount;
  const exactRepair = preview.versionClassificationCounts.EXACT_REPAIR ?? 0;
  const blocked = preview.versionClassificationCounts.SOURCE_NOT_IN_COHORT ?? 0;
  const arithmeticHolds = alreadyQualified + exactRepair + blocked === versionsTotal && exactRepair + blocked === 285;

  const rowChecks = [];
  const refs = [...new Set(manifest.rows.map((r) => r.sourceRef))];
  const liveVersions = new Map((await pool.query(`SELECT symbol_version_id, stable_symbol_id, source_revision, workspace_revision, upstream_file_id FROM atlas_symbol_versions WHERE symbol_version_id = ANY($1::text[])`, [manifest.rows.map((r) => r.symbolVersionId)])).rows.map((r) => [r.symbol_version_id, r]));
  const bindingRes = refs.length ? await pool.query(`SELECT canonical_source_ref, source_revision, content_digest FROM atlas_workspace_source_bindings WHERE repo_id = $1 AND canonical_source_ref = ANY($2::text[]) AND workspace_revision = $3`, [REPO_ID, refs, manifest.admittedWorkspaceRevision]) : { rows: [] };
  const bindingByRef = new Map(bindingRes.rows.map((r) => [r.canonical_source_ref, r]));

  for (const row of manifest.rows) {
    const live = liveVersions.get(row.symbolVersionId);
    const exists = !!live;
    const oldRevisionMatches = exists && live.source_revision === row.precondition.oldSourceRevision && live.workspace_revision === row.precondition.oldWorkspaceRevision;
    const binding = bindingByRef.get(row.sourceRef);
    const resolvesToOneBinding = !!binding;
    const proposedShapeValid = /^sha256:[0-9a-f]{64}$/.test(row.proposed.sourceRevision);
    const proposedMatchesBindingDigest = !!binding && row.proposed.sourceRevision === `sha256:${binding.content_digest}` && binding.source_revision === row.proposed.sourceRevision;
    const proposedWorkspaceIsAdmitted = row.proposed.workspaceRevision === cohort.workspaceRevision;
    const upstreamFileIdUnchanged = exists && live.upstream_file_id === null;
    const ok = exists && oldRevisionMatches && resolvesToOneBinding && proposedShapeValid && proposedMatchesBindingDigest && proposedWorkspaceIsAdmitted && upstreamFileIdUnchanged;
    rowChecks.push({ symbolVersionId: row.symbolVersionId, ok, exists, oldRevisionMatches, resolvesToOneBinding, proposedShapeValid, proposedMatchesBindingDigest, proposedWorkspaceIsAdmitted, upstreamFileIdUnchanged });
  }
  const staleRows = rowChecks.filter((r) => r.exists && !r.oldRevisionMatches).length;
  const missingRows = rowChecks.filter((r) => !r.exists).length;
  const ambiguousRows = rowChecks.filter((r) => r.exists && r.oldRevisionMatches && !r.resolvesToOneBinding).length;
  const invalidProposalRows = rowChecks.filter((r) => r.exists && r.oldRevisionMatches && r.resolvesToOneBinding && (!r.proposedShapeValid || !r.proposedMatchesBindingDigest || !r.proposedWorkspaceIsAdmitted)).length;

  const dupCheck = manifest.rows.length ? (await pool.query(
    `SELECT v.stable_symbol_id, v.source_revision
       FROM atlas_symbol_versions v
       JOIN (SELECT unnest($1::text[]) AS stable_symbol_id, unnest($2::text[]) AS source_revision) proposed
         ON v.stable_symbol_id = proposed.stable_symbol_id AND v.source_revision = proposed.source_revision
      WHERE v.symbol_version_id != ALL($3::text[])`,
    [manifest.rows.map((r) => r.stableSymbolId), manifest.rows.map((r) => r.proposed.sourceRevision), manifest.rows.map((r) => r.symbolVersionId)],
  )).rows : [];
  const duplicateTargetRows = dupCheck.length;
  const noStableFileIdInvolved = manifest.rows.every((r) => !('stableFileId' in r));

  const allRowsOk = rowChecks.every((r) => r.ok);
  const admissionResult = arithmeticHolds && previewChecksumMatch && cohortChecksumMatch && manifestChecksumMatch
    && staleRows === 0 && missingRows === 0 && ambiguousRows === 0 && invalidProposalRows === 0 && duplicateTargetRows === 0 && noStableFileIdInvolved && allRowsOk
    ? 'S01_10_REPAIR_APPLY_READY' : 'S01_10_REPAIR_APPLY_BLOCKED';

  const receipt = {
    schema: SCHEMA, generatedAt: new Date().toISOString(),
    arithmetic: { versionsTotal, alreadyQualified, exactRepair, blocked, arithmeticHolds },
    checksums: { previewChecksum: manifest.previewChecksum, previewChecksumMatch, sealedCohortChecksum: manifest.sealedCohortChecksum, cohortChecksumMatch, manifestChecksum: manifest.manifestChecksum, manifestChecksumMatch },
    manifestRows: manifest.rows.length,
    admission: { staleRows, missingRows, ambiguousRows, invalidProposalRows, duplicateTargetRows, noStableFileIdInvolved, allRowsOk },
    failingRowSample: rowChecks.filter((r) => !r.ok).slice(0, 20),
    safety: { databaseWrites: 0, historicalRowsChanged: 0, readerCutover: false },
    result: admissionResult,
  };
  const body = JSON.stringify(receipt, null, 2);
  const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
  const immutable = path.join(root, 'docs/reports', `symbol-revision-repair-apply-admission-v1.${sha12}.json`);
  const pointer = path.join(root, 'docs/reports/symbol-revision-repair-apply-admission-v1.json');
  fs.writeFileSync(immutable, body + '\n', { flag: 'wx' });
  fs.writeFileSync(pointer, body + '\n');
  console.log(receipt.result, immutable);
  console.log(JSON.stringify({ arithmeticHolds, previewChecksumMatch, cohortChecksumMatch, manifestChecksumMatch, staleRows, missingRows, ambiguousRows, invalidProposalRows, duplicateTargetRows, allRowsOk }));
} finally {
  await pool.end();
}
