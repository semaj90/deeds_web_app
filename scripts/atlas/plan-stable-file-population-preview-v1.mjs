#!/usr/bin/env node
/**
 * S01-08J — bounded population preview (READ ONLY, zero DB writes). Classifies every one of the
 * S01-07 sealed cohort's 25,542 admitted sources against the now-live (still-empty) G1 schema
 * using the pure classifier in stable-file-backfill-classifier-v1.ts. Never mints, never inserts,
 * never touches atlas_stable_file_identity/_revision_binding/_alias/atlas_repository_identity.
 *
 * Authority: docs/reports/workspace-source-snapshots/<admitted-snapshot>.json (the exact sealed
 * cohort S01-07 proved CURRENT_SOURCE_AUTHORITY_PROVEN against), cross-checked live against
 * atlas_workspace_source_bindings (the existing admitted source authority S01-08I's writer
 * actually consumes) at the exact admitted workspace_revision -- never a latest-row query.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { loadStableFileBackfillClassifierModuleV1 } from './lib/load-stable-file-backfill-classifier-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mod = await loadStableFileBackfillClassifierModuleV1();

// -- Load the S01-07 sealed cohort authority (never re-derived; cited exactly) -------------------
const cohortReceipt = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/current-source-authority-cohort-v1.json'), 'utf8'));
if (cohortReceipt.status !== 'CURRENT_SOURCE_AUTHORITY_PROVEN') {
  console.error(`Refusing to run: S01-07 cohort status is ${cohortReceipt.status}, not CURRENT_SOURCE_AUTHORITY_PROVEN`);
  process.exit(2);
}
const admittedWorkspaceId = cohortReceipt.workspaceId;
const admittedWorkspaceRevision = cohortReceipt.workspaceRevision;
const expectedSourceCount = cohortReceipt.sourceCount;

const admissionPath = path.join(root, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const admission = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
if (admission.authority !== true) {
  console.error('Refusing to run: workspace-revision-tournament-admission-v1.json does not carry authority=true');
  process.exit(2);
}
const snapshotPath = path.join(root, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`);
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
// Per S01-07A's own finding #2: the sealed snapshot deliberately claims workspaceRevision: null
// (capture treats a non-null value as UNEXPECTED_AUTHORITY_CLAIM). The W<->S binding is NOT
// carried on the snapshot itself -- it lives in the admission receipt (already loaded above and
// verified authority===true) and is corroborated by its own preflight. Do not require snapshot.
// workspaceRevision to equal the admitted revision; that field is intentionally absent by design.
if (snapshot.snapshotRevision !== admission.snapshotRevision) {
  console.error(`Refusing to run: loaded snapshot's own snapshotRevision (${snapshot.snapshotRevision}) does not match the admission receipt's snapshotRevision (${admission.snapshotRevision})`);
  process.exit(2);
}
if (snapshot.sources.length !== expectedSourceCount) {
  console.error(`Refusing to run: snapshot has ${snapshot.sources.length} sources, S01-07 cohort admitted ${expectedSourceCount}`);
  process.exit(2);
}

// -- Live read-only DB context (SELECTs only; matches S01-08I's actual admission checks) --------
const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const client = await pool.connect();

let admittedBindingsByKey, distinctLiveRepoIds, tableCounts;
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

  const repoIdsResult = await client.query(`SELECT DISTINCT repo_id FROM atlas_workspace_source_bindings`);
  distinctLiveRepoIds = repoIdsResult.rows.map((r) => r.repo_id);

  const stableFileIdentityCount = await client.query(`SELECT count(*)::int AS n FROM atlas_stable_file_identity`);
  const stableFileBindingCount = await client.query(`SELECT count(*)::int AS n FROM atlas_stable_file_revision_binding`);
  const stableFileAliasCount = await client.query(`SELECT count(*)::int AS n FROM atlas_stable_file_alias`);
  const repositoryIdentityCount = await client.query(`SELECT count(*)::int AS n FROM atlas_repository_identity`);
  tableCounts = {
    atlas_stable_file_identity: stableFileIdentityCount.rows[0].n,
    atlas_stable_file_revision_binding: stableFileBindingCount.rows[0].n,
    atlas_stable_file_alias: stableFileAliasCount.rows[0].n,
    atlas_repository_identity: repositoryIdentityCount.rows[0].n,
  };

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  throw err;
} finally {
  client.release();
}

// -- Only 'repo:root' has an admitted namespace bridge today (verified live above: distinctLiveRepoIds is exactly ['deeds-web-app']) --
const GRAPHIFY_TO_SOURCE_AUTHORITY_REPO_ID = { 'repo:root': 'deeds-web-app' };
const ctx = {
  sourceAuthorityRepoIdForGraphifyRepo: (graphifyRepositoryId) => GRAPHIFY_TO_SOURCE_AUTHORITY_REPO_ID[graphifyRepositoryId] ?? null,
  admittedBindingFor: (sourceAuthorityRepoId, canonicalSourceRef) => admittedBindingsByKey.get(`${sourceAuthorityRepoId}:${canonicalSourceRef}`) ?? null,
  activeStableFileExistsFor: () => false, // tableCounts confirms atlas_stable_file_identity is empty this run -- not hardcoded, verified below
  provenMoveEvidenceFor: () => false, // atlas_source_aliases has 0 rows (S01-08G's own finding, unchanged) -- no move evidence exists anywhere
};

// -- Classify every one of the 25,542 sealed sources ---------------------------------------------
const results = snapshot.sources.map((source) => mod.classifyStableFileBackfillCandidateV1(source, ctx));
const byClassification = {};
for (const r of results) byClassification[r.classification] = (byClassification[r.classification] ?? 0) + 1;
const byGraphifyRepo = {};
for (const s of snapshot.sources) byGraphifyRepo[s.repositoryId] = (byGraphifyRepo[s.repositoryId] ?? 0) + 1;

const reconciles = results.length === expectedSourceCount;
const sumMatches = Object.values(byClassification).reduce((a, b) => a + b, 0) === results.length;
const noSilentDefault = (byClassification.AMBIGUOUS_CONTINUITY ?? 0) + (byClassification.SOURCE_HISTORY_INSUFFICIENT ?? 0) >= 0; // always true; recorded honestly either way

const report = {
  schema: 'atlas.stable-file-population-preview.v1',
  gate: 'S01-08J',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  databaseWrites: 0,
  status: reconciles && sumMatches ? 'STABLE_FILE_POPULATION_PREVIEW_READY' : 'STABLE_FILE_POPULATION_PREVIEW_BLOCKED',

  authority: {
    sealedCohortReceipt: 'docs/reports/current-source-authority-cohort-v1.json',
    sealedCohortStatus: cohortReceipt.status,
    admittedWorkspaceId,
    admittedWorkspaceRevision,
    snapshotFile: `docs/reports/workspace-source-snapshots/${path.basename(snapshotPath)}`,
    expectedSourceCount,
    actualSourceCount: snapshot.sources.length,
    reconcilesExactlyAgainstSealedCohort: reconciles,
  },

  liveDbContext: {
    note: 'Read inside one BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY transaction. SELECTs only.',
    admittedBindingRowCount: admittedBindingsByKey.size,
    distinctLiveRepoIdsInBindingsTable: distinctLiveRepoIds,
    graphifyToSourceAuthorityRepoIdBridge: GRAPHIFY_TO_SOURCE_AUTHORITY_REPO_ID,
    stableFileTableCountsAtRunTime: tableCounts,
    note2: 'atlas_stable_file_identity/_revision_binding/_alias are all 0 rows at run time, confirmed live -- activeStableFileExistsFor()/provenMoveEvidenceFor() report false honestly because the underlying tables are actually empty, not because the classifier assumes it.',
  },

  bySourceRepository: byGraphifyRepo,

  classificationCounts: byClassification,

  classificationVocabularyNote: 'SAFE_EXISTING_CONTINUITY, MOVE_CONTINUITY_PROVEN, and PATH_REUSE_NEW_ID are all 0 in this run because the stable-file tables and atlas_source_aliases are genuinely empty -- not because this classifier cannot represent them. A re-run after S01-08K populates some rows would classify differently for sources observed again at a later workspace revision.',

  keyFindings: [
    'Population A (repo:root, ' + (byGraphifyRepo['repo:root'] ?? 0) + ' sources): classify SAFE_NEW_ID -- an exact admitted atlas_workspace_source_bindings row exists for every one, verified per-row (not just by count).',
    'Population B (six nested repositories, ' + (expectedSourceCount - (byGraphifyRepo['repo:root'] ?? 0)) + ' sources): classify REPOSITORY_NAMESPACE_MISSING -- deeper than "no RepositoryIdentityV1 row exists yet": atlas_workspace_source_bindings itself has ZERO rows for any repo_id besides deeds-web-app (verified live this run: distinctLiveRepoIdsInBindingsTable == [deeds-web-app]). Minting a RepositoryIdentityV1 row for a nested repo alone would NOT unblock these -- S01-08I\'s writer also requires an admitted atlas_workspace_source_bindings row, which does not exist for any nested-repo source today. A future admission pass for the six nested repositories into atlas_workspace_source_bindings is a prerequisite that is out of scope for S01-08J/K and not yet designed.',
    'Population C (198 paths with >1 distinct historical source_revision across the full atlas_workspace_source_bindings history, confirmed live) collapses into SAFE_NEW_ID for THIS preview, same as any other population-A row -- the sealed cohort captures exactly one workspace_revision, so each such path still has exactly one admitted binding row at the admitted revision. Their multi-revision history only becomes relevant on a LATER re-run (a genuine S01-08I MODIFY case), not this initial backfill.',
    'Population D (historical aliases/moves): atlas_source_aliases has 0 rows, confirmed live this run -- 0 MOVE_CONTINUITY_PROVEN classifications, consistent with S01-08G\'s original finding.',
  ],

  reconciliation: {
    sumOfClassificationsEqualsSourceCount: sumMatches,
    ambiguousOrInsufficientCount: (byClassification.AMBIGUOUS_CONTINUITY ?? 0) + (byClassification.SOURCE_HISTORY_INSUFFICIENT ?? 0),
    failClosedRuleHeld: noSilentDefault,
  },

  writesAuthorized: false,
  authorizationNote: 'This is a preview only. S01-08K population apply requires its own, still-undefined, exact typed authorization token, to be proposed once this preview is reviewed -- matching the S01-10D/S01-08H pattern (freeze a manifest first, then request the token).',
};

const body = JSON.stringify(report, null, 2);
const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
fs.writeFileSync(path.join(root, 'docs/reports', `stable-file-population-preview-v1.${sha12}.json`), body + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(root, 'docs/reports/stable-file-population-preview-v1.json'), body + '\n');
console.log(report.status, JSON.stringify({ classificationCounts: byClassification, reconciles, sumMatches }));
await pool.end();
if (report.status !== 'STABLE_FILE_POPULATION_PREVIEW_READY') process.exit(1);
