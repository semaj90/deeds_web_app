#!/usr/bin/env node
/**
 * S01-08K-FREEZE (READ ONLY, zero DB writes). Freezes the exact Population-A apply set (the
 * 24,456 SAFE_NEW_ID / deeds-web-app rows from S01-08J) into an immutable, checksummed manifest.
 * Re-derives the same classification S01-08J produced (same sealed cohort, same live admission
 * check), so the manifest is not a hand-copy of S01-08J's aggregate counts -- it is an
 * independent, full per-row re-derivation that must reconcile exactly against them.
 *
 * NEVER pre-mints or freezes a stableFileId -- ApplySetRowV1 (from the pure module this imports)
 * has no such field. S01-08K's canonical writer mints each UUIDv7 only inside its own authorized
 * transaction.
 *
 * repositoryId policy note: this manifest describes repositoryId as random UUIDv7 (matching
 * stableFileId's rule), per the operator's explicit correction in commit da25db92ed -- NOT
 * deterministic UUIDv8. Some external review text this gate's operator relayed assumed UUIDv8;
 * that assumption was explicitly re-confirmed superseded before this manifest was written (see
 * the S01-08K-FREEZE ledger entry).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { loadStableFileBackfillClassifierModuleV1 } from './lib/load-stable-file-backfill-classifier-v1.mjs';
import { loadStableFilePopulationApplyManifestModuleV1 } from './lib/load-stable-file-population-apply-manifest-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const classifierMod = await loadStableFileBackfillClassifierModuleV1();
const manifestMod = await loadStableFilePopulationApplyManifestModuleV1();

// -- Reconfirm the committed S01-08J preview is the exact authority (not re-derived from scratch
//    without cross-checking) ----------------------------------------------------------------------
const previewPath = path.join(root, 'docs/reports/stable-file-population-preview-v1.json');
const previewText = fs.readFileSync(previewPath, 'utf8');
const preview = JSON.parse(previewText);
const previewChecksum = 'sha256:' + crypto.createHash('sha256').update(previewText).digest('hex');
if (preview.status !== 'STABLE_FILE_POPULATION_PREVIEW_READY') {
  console.error(`Refusing to run: S01-08J preview status is ${preview.status}, not STABLE_FILE_POPULATION_PREVIEW_READY`);
  process.exit(2);
}
if (preview.classificationCounts.SAFE_NEW_ID !== 24456 || preview.classificationCounts.REPOSITORY_NAMESPACE_MISSING !== 1086) {
  console.error(`Refusing to run: S01-08J preview counts drifted from the expected 24456/1086 (got ${JSON.stringify(preview.classificationCounts)})`);
  process.exit(2);
}

// -- Reload the S01-07 sealed cohort + snapshot, exactly as S01-08J did ---------------------------
const cohortPath = path.join(root, 'docs/reports/current-source-authority-cohort-v1.json');
const cohortReceipt = JSON.parse(fs.readFileSync(cohortPath, 'utf8'));
if (cohortReceipt.status !== 'CURRENT_SOURCE_AUTHORITY_PROVEN') {
  console.error(`Refusing to run: S01-07 cohort status is ${cohortReceipt.status}`);
  process.exit(2);
}
const admittedWorkspaceId = cohortReceipt.workspaceId;
const admittedWorkspaceRevision = cohortReceipt.workspaceRevision;
const sealedCohortChecksum = cohortReceipt.receiptChecksum ?? cohortReceipt.sourceSelectionChecksum ?? null;

const admission = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
if (admission.authority !== true) {
  console.error('Refusing to run: workspace-revision-tournament-admission-v1.json does not carry authority=true');
  process.exit(2);
}
const snapshotPath = path.join(root, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`);
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
if (snapshot.snapshotRevision !== admission.snapshotRevision) {
  console.error(`Refusing to run: snapshot's own snapshotRevision does not match the admission receipt`);
  process.exit(2);
}
if (snapshot.sources.length !== cohortReceipt.sourceCount) {
  console.error(`Refusing to run: snapshot has ${snapshot.sources.length} sources, cohort admitted ${cohortReceipt.sourceCount}`);
  process.exit(2);
}

// -- Live read-only re-derivation (SELECTs only, one REPEATABLE READ READ ONLY transaction) ------
const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const client = await pool.connect();

let admittedBindingsByKey, tableCounts;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const bindingsResult = await client.query(
    `SELECT repo_id, canonical_source_ref, source_revision, content_digest, workspace_revision
       FROM atlas_workspace_source_bindings WHERE workspace_revision = $1`,
    [admittedWorkspaceRevision],
  );
  admittedBindingsByKey = new Map(
    bindingsResult.rows.map((r) => [`${r.repo_id}:${r.canonical_source_ref}`, { source_revision: r.source_revision, content_digest: r.content_digest, workspace_revision: r.workspace_revision }]),
  );
  const countTables = ['atlas_repository_identity', 'atlas_stable_file_identity', 'atlas_stable_file_revision_binding', 'atlas_stable_file_alias'];
  const counts = [];
  for (const t of countTables) counts.push(await client.query(`SELECT count(*)::int AS n FROM ${t}`)); // serialized: one client cannot run concurrent queries
  tableCounts = {
    atlas_repository_identity: counts[0].rows[0].n,
    atlas_stable_file_identity: counts[1].rows[0].n,
    atlas_stable_file_revision_binding: counts[2].rows[0].n,
    atlas_stable_file_alias: counts[3].rows[0].n,
  };
  const existingRepoRow = await client.query(`SELECT repository_id FROM atlas_repository_identity WHERE source_authority_repo_id = $1`, ['deeds-web-app']);
  tableCounts.existingRootRepositoryIdentityRow = existingRepoRow.rows[0]?.repository_id ?? null;
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  throw err;
} finally {
  client.release();
}

const GRAPHIFY_TO_SOURCE_AUTHORITY_REPO_ID = { 'repo:root': 'deeds-web-app' };
const ctx = {
  sourceAuthorityRepoIdForGraphifyRepo: (id) => GRAPHIFY_TO_SOURCE_AUTHORITY_REPO_ID[id] ?? null,
  admittedBindingFor: (repoId, ref) => admittedBindingsByKey.get(`${repoId}:${ref}`) ?? null,
  activeStableFileExistsFor: () => false,
  provenMoveEvidenceFor: () => false,
};

const classified = snapshot.sources.map((source) => {
  const r = classifierMod.classifyStableFileBackfillCandidateV1(source, ctx);
  return { ...r, repositoryRelativePath: source.repositoryRelativePath, workspaceRevision: admittedWorkspaceRevision, sourceRevision: source.sourceRevision, contentDigest: source.contentDigest, byteLength: source.byteLength };
});

const byClassification = {};
for (const r of classified) byClassification[r.classification] = (byClassification[r.classification] ?? 0) + 1;

// -- Independent reconciliation: this re-derivation must agree with the committed S01-08J receipt
if (JSON.stringify(byClassification) !== JSON.stringify(preview.classificationCounts)) {
  console.error(`Refusing to freeze: re-derived classification counts disagree with the committed S01-08J preview.\nRe-derived: ${JSON.stringify(byClassification)}\nCommitted: ${JSON.stringify(preview.classificationCounts)}`);
  process.exit(2);
}

const applySet = manifestMod.buildApplySetFromClassificationV1(classified);
const integrity = manifestMod.checkApplySetIntegrityV1(applySet);
const applySetJson = manifestMod.canonicalApplySetJsonV1(applySet);
const applySetChecksum = 'sha256:' + crypto.createHash('sha256').update(applySetJson).digest('hex');

const excludedCount = classified.length - applySet.length;
const status =
  integrity.allChecksPassed && applySet.length === 24456 && excludedCount === 1086 && tableCounts.atlas_stable_file_identity === 0
    ? 'S01_08K_APPLY_MANIFEST_FROZEN'
    : 'S01_08K_APPLY_MANIFEST_BLOCKED';

const manifest = {
  schema: 'atlas.stable-file-population-apply-manifest.v1',
  gate: 'S01-08K-FREEZE',
  generatedAt: new Date().toISOString(),
  designOnly: true,
  databaseWrites: 0,

  source: {
    previewCommit: '5f3875e69e',
    previewReceipt: 'docs/reports/stable-file-population-preview-v1.json',
    previewChecksum,
    sealedCohortReceipt: 'docs/reports/current-source-authority-cohort-v1.json',
    sealedCohortStatus: cohortReceipt.status,
    sealedCohortChecksum,
    admittedWorkspaceId,
    workspaceRevision: admittedWorkspaceRevision,
    snapshotFile: `docs/reports/workspace-source-snapshots/${path.basename(snapshotPath)}`,
    independentReclassificationAgreesWithCommittedPreview: true,
  },

  applySet: {
    classification: 'SAFE_NEW_ID',
    sourceAuthorityRepoId: 'deeds-web-app',
    rowCount: applySet.length,
    checksum: applySetChecksum,
  },

  excluded: {
    repositoryNamespaceMissing: byClassification.REPOSITORY_NAMESPACE_MISSING ?? 0,
    ambiguousContinuity: byClassification.AMBIGUOUS_CONTINUITY ?? 0,
    sourceHistoryInsufficient: byClassification.SOURCE_HISTORY_INSUFFICIENT ?? 0,
    note: 'Every non-SAFE_NEW_ID classification is excluded from the apply set by construction (buildApplySetFromClassificationV1 filters on classification === SAFE_NEW_ID only) -- not by a separate exclusion list that could drift.',
  },

  applySetIntegrity: integrity,

  liveStateAtFreezeTime: {
    note: 'Read inside one BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY transaction. SELECTs only. Reconfirms the tables are still empty at freeze time -- this manifest expires (must be re-frozen) if that ever changes before apply.',
    tableCounts,
  },

  expectedWrites: {
    atlas_repository_identity: tableCounts.existingRootRepositoryIdentityRow ? 'INSERT 0 (row already exists)' : 'INSERT exactly 1 root RepositoryIdentityV1 row',
    atlas_stable_file_identity: `INSERT exactly ${applySet.length} rows`,
    atlas_stable_file_revision_binding: `INSERT exactly ${applySet.length} rows`,
    atlas_stable_file_alias: 'INSERT 0 rows',
    unrelatedTables: {
      atlas_workspace_source_bindings: 0,
      atlas_symbol_registry: 0,
      atlas_symbol_versions: 0,
      atlas_packets: 0,
      qdrant: 0,
      valkey: 0,
      neo4j: 0,
      graphifyRuns: 0,
    },
  },

  uuidPolicy: {
    repositoryId: 'random UUIDv7 (mintOrReuseRepositoryIdentityV1 -- corrected from an earlier deterministic-UUIDv8 pass per commit da25db92ed; concurrency safety comes from the live UNIQUE(source_authority_repo_id) constraint + graceful 23505 handling, not determinism)',
    stableFileId: 'UUIDv7, minted ONLY during S01-08K APPLY, inside the authorized transaction. This manifest\'s applySet rows carry no stableFileId field -- structurally impossible to pre-mint or freeze one here (see ApplySetRowV1 in stable-file-population-apply-manifest-v1.ts).',
  },

  transactionPolicy: {
    allOrNothing: true,
    algorithm: [
      'BEGIN',
      'Revalidate manifest/input checksums (previewChecksum, sealedCohortChecksum, applySetChecksum) against this frozen file -- refuse on any drift.',
      'Revalidate the exact admitted atlas_workspace_source_bindings row for every apply-set row.',
      'Ensure every row still classifies SAFE_NEW_ID at apply time (re-run the same classifier, not trust this frozen snapshot blindly).',
      'Mint or reuse the one root RepositoryIdentityV1 row (mintOrReuseRepositoryIdentityV1) -- idempotent, 23505-safe.',
      'For each authorized source row, call the ONE canonical S01-08I writer (mintOrBindStableFileV1) -- mints a UUIDv7 only inside this transaction.',
      'Independently read back: repository identity row, every stable file identity row, every revision binding row.',
      'Require exact expected counts (repository +0 or +1, stable file identity +24456, revision binding +24456, alias +0) and zero unexpected classifications.',
      'COMMIT only if every invariant passes.',
      'Any mismatch at any step -> ROLLBACK the entire transaction. No partial population.',
    ],
  },

  postApplyReplayExpectation: {
    note: 'NOT executed by this freeze gate. Recorded so S01-08K\'s own apply script can assert it, and so a future re-run of this exact 24,456-row set is provably idempotent.',
    expected: {
      classification: 'SAFE_EXISTING_CONTINUITY for all 24,456 rows',
      newStableFileIdsMinted: 0,
      duplicateStableFileRows: 0,
      duplicateRevisionBindings: 0,
    },
  },

  rollbackReadbackHandling: {
    primaryMechanism: 'transaction ROLLBACK before COMMIT (this is one bounded transaction, per transactionPolicy above)',
    postCommitVerification: 'independent post-transaction readback on a FRESH pooled connection, matching the S01-08H/S01-10E apply-script pattern',
    onPostCommitDiscrepancy: 'STOP -- report the discrepancy, do not attempt automatic repair',
    explicitlyProhibited: 'a destructive post-commit delete/repair script that could erase identities after downstream references (e.g. a future S01-08M upstream_file_id FK) exist',
  },

  authorization: {
    required: true,
    token: 'apply S01-08K stable file population',
    note: 'This exact literal string, matching the established S01-10D/S01-08H apply-token pattern. A generic "yes"/"apply"/"continue" is NOT sufficient.',
  },

  result: status,
};

const body = JSON.stringify(manifest, null, 2);
const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
try {
  fs.writeFileSync(path.join(root, 'docs/reports', `stable-file-population-apply-manifest-v1.${sha12}.json`), body + '\n', { flag: 'wx' });
} catch (err) {
  if (err.code !== 'EEXIST') throw err; // immutable-by-checksum: identical content re-run is expected, not an error
}
fs.writeFileSync(path.join(root, 'docs/reports/stable-file-population-apply-manifest-v1.json'), body + '\n');
console.log(status, JSON.stringify({ applySetRowCount: applySet.length, applySetChecksum, integrityPassed: integrity.allChecksPassed, excludedCount }));
await pool.end();
if (status !== 'S01_08K_APPLY_MANIFEST_FROZEN') process.exit(1);
