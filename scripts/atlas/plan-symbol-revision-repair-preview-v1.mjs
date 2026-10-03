#!/usr/bin/env node
/**
 * S01-10C — read-only repair preview for the frozen bad symbol-version population. SELECT-only: no BEGIN/UPDATE/INSERT anywhere.
 *
 * Scope (per the committed S01-10 handoff): the 285 bad atlas_symbol_versions rows (200 `workspace:N`, 85 carrying the raw
 * 40-hex Git commit id `1bb240fb20f1d4ba5651d8a4da9a10c9d6337aaf`). Each is resolved ONLY by exact provenance against the
 * frozen S01-07 cohort: same repo, same admitted workspaceRevision, an exact `atlas_workspace_source_bindings` row for that
 * row's `source_ref`, and `source_revision === sha256:content_digest` of that binding (the same identity the S01-10B
 * qualification contract requires going forward — this preview reuses it read-only, no separate rule).
 * No `latest`/HEAD substitution, no hashing a 40-hex id into a fake sha256, no cross-source guessing.
 *
 * The 10,220 + 90 bad atlas_symbol_registry rows are reported informationally (same provenance check) but are OUT OF SCOPE
 * for this preview's repair population — the handoff scopes S01-10C to the 285 version rows; registry-row treatment is a
 * separate question tied to S01-10-schema (whether a revision-less logical skeleton should even carry a fake revision).
 *
 * This script performs ZERO writes to atlas_symbol_registry / atlas_symbol_versions. It only reads and writes a receipt file.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { loadSymbolRevisionQualificationV1 } from './lib/load-symbol-revision-qualification-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-revision-repair-preview-v1';
const ADMITTED_WORKSPACE_REVISION = 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const ADMITTED_WORKSPACE_ID = '625743d2-092b-4fa8-abe0-9dc094920c80';
const OID = '1bb240fb20f1d4ba5651d8a4da9a10c9d6337aaf';

const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
if (!DATABASE_URL) { console.error('DATABASE_URL_MIGRATOR or DATABASE_URL is required'); process.exit(2); }
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const q = await loadSymbolRevisionQualificationV1();

function classify(sourceRef, sourceRevision, provenance) {
  if (!sourceRef) return { classification: 'SOURCE_REF_MISSING', reasons: ['SOURCE_REF_MISSING'] };
  const shape = q.sourceRevisionReasonV1(sourceRevision);
  const binding = provenance.find((b) => b.sourceRef === sourceRef && b.workspaceRevision === ADMITTED_WORKSPACE_REVISION);
  if (!binding) return { classification: 'SOURCE_UNAVAILABLE', reasons: ['NO_BINDING_UNDER_ADMITTED_REVISION'] };
  const proposedSourceRevision = `sha256:${binding.contentDigest}`;
  const contentDigestValid = /^[0-9a-f]{64}$/.test(binding.contentDigest) && binding.sourceRevision === proposedSourceRevision;
  if (!contentDigestValid) return { classification: 'BINDING_IDENTITY_INVALID', reasons: ['BINDING_SOURCE_REVISION_NOT_SHA256_OF_CONTENT_DIGEST'] };
  return {
    classification: 'EXACT_REPAIR',
    reasons: [],
    proposedSourceRevision,
    proposedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION,
    priorShape: shape ?? 'QUALIFIED_ALREADY',
    priorValue: sourceRevision,
    unchanged: sourceRevision === proposedSourceRevision,
  };
}

try {
  const [badVersions, badRegistry] = await Promise.all([
    pool.query(`SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision, workspace_revision FROM atlas_symbol_versions WHERE source_revision ~ '^workspace:\\d+$' OR source_revision ~ '^[0-9a-f]{40}$'`),
    pool.query(`SELECT stable_symbol_id, canonical_key, created_from_source_ref AS source_ref, created_from_source_revision AS source_revision FROM atlas_symbol_registry WHERE created_from_source_revision ~ '^workspace:\\d+$' OR created_from_source_revision ~ '^[0-9a-f]{40}$'`),
  ]);

  const refs = [...new Set([...badVersions.rows, ...badRegistry.rows].map((r) => r.source_ref).filter(Boolean))];
  const bindingRes = refs.length
    ? await pool.query(`SELECT canonical_source_ref, source_revision, workspace_revision, content_digest FROM atlas_workspace_source_bindings WHERE repo_id = 'deeds-web-app' AND canonical_source_ref = ANY($1::text[]) AND workspace_revision = $2`, [refs, ADMITTED_WORKSPACE_REVISION])
    : { rows: [] };
  const provenanceByRef = new Map();
  for (const r of bindingRes.rows) {
    const list = provenanceByRef.get(r.canonical_source_ref) ?? [];
    list.push({ sourceRef: r.canonical_source_ref, sourceRevision: r.source_revision, workspaceRevision: r.workspace_revision, contentDigest: r.content_digest });
    provenanceByRef.set(r.canonical_source_ref, list);
  }
  const provFor = (ref) => provenanceByRef.get(ref) ?? [];

  const versionRows = badVersions.rows.map((row) => {
    const priorPattern = /^[0-9a-f]{40}$/.test(row.source_revision) ? (row.source_revision === OID ? 'HISTORICAL_GIT_COMMIT_OID' : 'GIT_COMMIT_LIKE') : 'WORKSPACE_PLACEHOLDER';
    return { symbolVersionId: row.symbol_version_id, stableSymbolId: row.stable_symbol_id, sourceRef: row.source_ref, priorSourceRevision: row.source_revision, priorWorkspaceRevision: row.workspace_revision, priorPattern, ...classify(row.source_ref, row.source_revision, provFor(row.source_ref)) };
  });
  const registryRows = badRegistry.rows.map((row) => ({ stableSymbolId: row.stable_symbol_id, canonicalKey: row.canonical_key, sourceRef: row.source_ref, priorSourceRevision: row.source_revision, ...classify(row.source_ref, row.source_revision, provFor(row.source_ref)) }));

  const tally = (rows) => rows.reduce((a, r) => { a[r.classification] = (a[r.classification] ?? 0) + 1; return a; }, {});
  const versionTally = tally(versionRows);
  const registryTally = tally(registryRows);

  // Reconciliation: preview population must equal the frozen S01-09/S01-10 baseline exactly.
  const reconciles = badVersions.rows.length === 285 && (versionTally.EXACT_REPAIR ?? 0) + (versionTally.SOURCE_UNAVAILABLE ?? 0) + (versionTally.SOURCE_REF_MISSING ?? 0) + (versionTally.BINDING_IDENTITY_INVALID ?? 0) === 285
    && badVersions.rows.filter((r) => /^workspace:\d+$/.test(r.source_revision)).length === 200
    && badVersions.rows.filter((r) => /^[0-9a-f]{40}$/.test(r.source_revision)).length === 85
    && badRegistry.rows.length === 10220 + 90;

  const receipt = {
    schema: SCHEMA, generatedAt: new Date().toISOString(),
    scope: 'S01-10C: repair PREVIEW only, the 285 bad atlas_symbol_versions rows. atlas_symbol_registry rows (10,220 + 90) are reported informationally, out of repair scope pending S01-10-schema.',
    admittedWorkspace: { workspaceId: ADMITTED_WORKSPACE_ID, workspaceRevision: ADMITTED_WORKSPACE_REVISION, source: 'docs/reports/current-source-authority-cohort-v1.json (S01-07 CURRENT_SOURCE_AUTHORITY_PROVEN)' },
    resolutionRule: 'EXACT provenance only: one atlas_workspace_source_bindings row for (repo_id=deeds-web-app, source_ref, workspace_revision=admitted) whose source_revision === sha256:content_digest. No latest/HEAD substitution, no hashing a 40-hex id, no cross-source guessing.',
    reconciliation: { inputPopulationMatchesFrozenBaseline: reconciles, badVersionRowCount: badVersions.rows.length, badRegistryRowCount: badRegistry.rows.length, expectedVersionCount: 285, expectedRegistryCount: 10310 },
    versionPreview: { tally: versionTally, total: versionRows.length, sample: versionRows.slice(0, 10) },
    registryInformational: { tally: registryTally, total: registryRows.length, note: 'informational only; no repair proposed here', sample: registryRows.slice(0, 10) },
    safety: { databaseWrites: 0, historicalRowsChanged: 0, registryRowsUpdated: 0, versionRowsUpdated: 0, graphifyRun: false, stableFileIdCreated: false, readerCutover: false },
    status: reconciles ? 'REPAIR_PREVIEW_COMPLETE' : 'REPAIR_PREVIEW_RECONCILIATION_FAILED',
  };
  const body = JSON.stringify(receipt, null, 2);
  const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
  const immutable = path.join(root, 'docs/reports', `symbol-revision-repair-preview-v1.${sha12}.json`);
  const pointer = path.join(root, 'docs/reports/symbol-revision-repair-preview-v1.json');
  fs.writeFileSync(immutable, body + '\n', { flag: 'wx' });
  fs.writeFileSync(pointer, body + '\n');
  console.log(receipt.status, immutable);
  console.log('versions:', JSON.stringify(versionTally), 'registry(informational):', JSON.stringify(registryTally));
} finally {
  await pool.end();
}
