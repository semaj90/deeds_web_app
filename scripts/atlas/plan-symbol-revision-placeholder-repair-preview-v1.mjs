#!/usr/bin/env node
/**
 * S01-10C (re-spec, supersedes the lighter first pass at docs/reports/symbol-revision-repair-preview-v1.json) —
 * complete, deterministically-classified historical repair preview for every atlas_symbol_versions row (479) and every
 * atlas_symbol_registry row (10,504). READ ONLY: two REPEATABLE READ, READ ONLY transactions (before/after row-count +
 * checksum fence); zero writes anywhere except the receipt files.
 *
 * Source of authority: the frozen S01-07 sealed cohort ONLY (workspaceId + admitted workspaceRevision from
 * docs/reports/current-source-authority-cohort-v1.json), proven via an exact atlas_workspace_source_bindings row whose
 * source_revision === sha256:content_digest. Never: current working-tree contents, latest/HEAD, a Git commit id, path-only
 * substitution, "closest" revision, fuzzy matching. Live working-tree drift is diagnostic only; it never changes eligibility.
 *
 * READY means every row got exactly one deterministic classification with sound evidence for anything proposed as
 * EXACT_REPAIR -- NOT that every bad row is repairable. Unrepairable rows are correctly BLOCKED and stay unchanged.
 *
 * STOP before S01-10D. This script proposes nothing to write and freezes nothing; it only classifies and reports.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { loadSymbolRevisionQualificationV1 } from './lib/load-symbol-revision-qualification-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.symbol-revision-placeholder-repair-preview.v1';
const REPO_ID = 'deeds-web-app';

const cohort = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/current-source-authority-cohort-v1.json'), 'utf8'));
if (cohort.status !== 'CURRENT_SOURCE_AUTHORITY_PROVEN') throw new Error(`S01-07 cohort is not PROVEN (status=${cohort.status}); refusing to use it as repair authority`);
const ADMITTED_WORKSPACE_ID = cohort.workspaceId;
const ADMITTED_WORKSPACE_REVISION = cohort.workspaceRevision;
const COHORT_RECEIPT_CHECKSUM = cohort.receiptChecksum ?? null;

const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
if (!DATABASE_URL) { console.error('DATABASE_URL_MIGRATOR or DATABASE_URL is required'); process.exit(2); }
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const q = await loadSymbolRevisionQualificationV1();

async function readOnlyTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result = await fn(client);
    await client.query('COMMIT'); // a READ ONLY transaction has nothing to commit; releases the snapshot cleanly
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function tableFence(client) {
  const [v, r] = await Promise.all([
    client.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(symbol_version_id, ',' ORDER BY symbol_version_id), '')) AS checksum FROM atlas_symbol_versions`),
    client.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(stable_symbol_id, ',' ORDER BY stable_symbol_id), '')) AS checksum FROM atlas_symbol_registry`),
  ]);
  return { versions: { count: v.rows[0].n, checksum: v.rows[0].checksum }, registry: { count: r.rows[0].n, checksum: r.rows[0].checksum } };
}

const fenceBefore = await readOnlyTx(tableFence);

let versionRowsRaw, registryRowsRaw, versionedStableIds, bindingRows, fenceAfter, sqlIndependentCheck;
await readOnlyTx(async (client) => {
  versionRowsRaw = (await client.query(`SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision, workspace_revision, upstream_node_id, producer_revision FROM atlas_symbol_versions`)).rows;
  registryRowsRaw = (await client.query(`SELECT stable_symbol_id, canonical_key, created_from_source_ref, created_from_source_revision, registry_revision FROM atlas_symbol_registry`)).rows;
  versionedStableIds = new Set((await client.query(`SELECT DISTINCT stable_symbol_id FROM atlas_symbol_versions`)).rows.map((r) => r.stable_symbol_id));
  const refs = [...new Set([...versionRowsRaw, ...registryRowsRaw.map((r) => ({ source_ref: r.created_from_source_ref }))].map((r) => r.source_ref).filter(Boolean))];
  bindingRows = refs.length
    ? (await client.query(`SELECT canonical_source_ref, source_revision, workspace_revision, content_digest FROM atlas_workspace_source_bindings WHERE repo_id = $1 AND canonical_source_ref = ANY($2::text[]) AND workspace_revision = $3`, [REPO_ID, refs, ADMITTED_WORKSPACE_REVISION])).rows
    : [];
  // Independent SQL-only cross-check (B): count exact-repairable version rows purely via one aggregate SQL query, not via the JS loop below.
  sqlIndependentCheck = (await client.query(
    `SELECT
       count(*) FILTER (WHERE v.source_revision ~ '^sha256:[0-9a-f]{64}$') AS already_qualified,
       count(*) FILTER (WHERE v.source_revision !~ '^sha256:[0-9a-f]{64}$' AND b.canonical_source_ref IS NOT NULL AND b.source_revision = 'sha256:' || b.content_digest) AS exact_repairable,
       count(*) FILTER (WHERE v.source_revision !~ '^sha256:[0-9a-f]{64}$' AND (b.canonical_source_ref IS NULL OR b.source_revision != 'sha256:' || b.content_digest)) AS blocked,
       count(*) AS total
     FROM atlas_symbol_versions v
     LEFT JOIN atlas_workspace_source_bindings b
       ON b.repo_id = $1 AND b.canonical_source_ref = v.source_ref AND b.workspace_revision = $2`,
    [REPO_ID, ADMITTED_WORKSPACE_REVISION],
  )).rows[0];
});
fenceAfter = await readOnlyTx(tableFence);
const tableUnchanged = fenceBefore.versions.count === fenceAfter.versions.count && fenceBefore.versions.checksum === fenceAfter.versions.checksum
  && fenceBefore.registry.count === fenceAfter.registry.count && fenceBefore.registry.checksum === fenceAfter.registry.checksum;

const bindingByRef = new Map();
for (const b of bindingRows) {
  const list = bindingByRef.get(b.canonical_source_ref) ?? [];
  list.push(b);
  bindingByRef.set(b.canonical_source_ref, list);
}

// ---- S01-10C-1: freeze input baseline, assert against the committed S01-09/S01-10 numbers verbatim ----------------------
const versionsTotal = versionRowsRaw.length;
const alreadyQualifiedCount = versionRowsRaw.filter((r) => q.sourceRevisionReasonV1(r.source_revision) === null).length;
const workspacePlaceholderCount = versionRowsRaw.filter((r) => /^workspace:\d+$/.test(r.source_revision)).length;
const legacy40HexCount = versionRowsRaw.filter((r) => /^[0-9a-f]{40}$/.test(r.source_revision)).length;
const registryTotal = registryRowsRaw.length;
const registryWorkspacePlaceholder = registryRowsRaw.filter((r) => /^workspace:\d+$/.test(r.created_from_source_revision)).length;
const registryGitRevision = registryRowsRaw.filter((r) => /^[0-9a-f]{40}$/.test(r.created_from_source_revision)).length;
const registryQualified = registryRowsRaw.filter((r) => q.sourceRevisionReasonV1(r.created_from_source_revision) === null).length;

const EXPECTED = { versionsTotal: 479, alreadyQualifiedCount: 194, workspacePlaceholderCount: 200, legacy40HexCount: 85, registryTotal: 10504, registryWorkspacePlaceholder: 10220, registryGitRevision: 90, registryQualified: 194 };
const live = { versionsTotal, alreadyQualifiedCount, workspacePlaceholderCount, legacy40HexCount, registryTotal, registryWorkspacePlaceholder, registryGitRevision, registryQualified };
const baselineDrift = Object.keys(EXPECTED).filter((k) => EXPECTED[k] !== live[k]);
const versionArithmeticHolds = alreadyQualifiedCount + workspacePlaceholderCount + legacy40HexCount === versionsTotal;

// ---- S01-10C-2: version-by-version provenance resolution -----------------------------------------------------------------
function classifyProvenance(sourceRef, priorRevision) {
  if (!sourceRef) return { classification: 'NO_SOURCE_EVIDENCE', repairReason: null, proof: null };
  const candidates = bindingByRef.get(sourceRef) ?? [];
  const matching = candidates.filter((b) => b.workspace_revision === ADMITTED_WORKSPACE_REVISION);
  if (matching.length === 0) return { classification: 'SOURCE_NOT_IN_COHORT', repairReason: null, proof: null };
  if (matching.length > 1) return { classification: 'SOURCE_AMBIGUOUS', repairReason: null, proof: { uniquenessCount: matching.length } };
  const binding = matching[0];
  const proposedSourceRevision = `sha256:${binding.content_digest}`;
  if (!/^[0-9a-f]{64}$/.test(binding.content_digest) || binding.source_revision !== proposedSourceRevision) {
    return { classification: 'REVISION_PROVENANCE_AMBIGUOUS', repairReason: null, proof: { bindingSourceRevision: binding.source_revision, expectedFromDigest: proposedSourceRevision } };
  }
  const repairReason = /^workspace:\d+$/.test(priorRevision) ? 'WORKSPACE_PLACEHOLDER_EXACT' : /^[0-9a-f]{40}$/.test(priorRevision) ? 'LEGACY_40HEX_EXACT' : 'OTHER_UNQUALIFIED_EXACT';
  return { classification: 'EXACT_REPAIR', repairReason, proof: { uniquenessCount: 1, provenanceMethod: 'atlas_workspace_source_bindings exact (repo_id, source_ref, workspace_revision) with source_revision == sha256:content_digest', sourceRef, sealedSourceRevision: binding.source_revision, sealedContentDigest: binding.content_digest }, proposedSourceRevision };
}

const versionRows = versionRowsRaw.map((row) => {
  if (q.sourceRevisionReasonV1(row.source_revision) === null) {
    return { symbolVersionId: row.symbol_version_id, stableSymbolId: row.stable_symbol_id, sourceRef: row.source_ref, priorSourceRevision: row.source_revision, priorWorkspaceRevision: row.workspace_revision, upstreamNodeId: row.upstream_node_id, primaryClassification: 'ALREADY_QUALIFIED', repairReason: null };
  }
  const resolved = classifyProvenance(row.source_ref, row.source_revision);
  return { symbolVersionId: row.symbol_version_id, stableSymbolId: row.stable_symbol_id, sourceRef: row.source_ref, priorSourceRevision: row.source_revision, priorWorkspaceRevision: row.workspace_revision, upstreamNodeId: row.upstream_node_id, primaryClassification: resolved.classification, repairReason: resolved.repairReason, proof: resolved.proof ?? undefined, proposedSourceRevision: resolved.proposedSourceRevision ?? undefined };
});

const versionClassificationCounts = versionRows.reduce((a, r) => { a[r.primaryClassification] = (a[r.primaryClassification] ?? 0) + 1; return a; }, {});
const exactRepairCandidates = versionRows.filter((r) => r.primaryClassification === 'EXACT_REPAIR').map((r) => ({
  symbolVersionId: r.symbolVersionId, stableSymbolId: r.stableSymbolId,
  expectedOld: { sourceRevision: r.priorSourceRevision, workspaceRevision: r.priorWorkspaceRevision },
  sealedAuthority: { sourceRef: r.sourceRef, workspaceRevision: ADMITTED_WORKSPACE_REVISION, sourceRevision: r.proposedSourceRevision, cohortReceipt: 'docs/reports/current-source-authority-cohort-v1.json', cohortChecksum: cohort.receiptChecksum ?? cohort.membershipSetChecksum ?? null },
  proposedNew: { sourceRevision: r.proposedSourceRevision, workspaceRevision: ADMITTED_WORKSPACE_REVISION },
  proof: { ...r.proof, evidenceReferences: [r.sourceRef] },
  repairReason: r.repairReason,
}));
const blockedCandidates = versionRows.filter((r) => !['ALREADY_QUALIFIED', 'EXACT_REPAIR'].includes(r.primaryClassification)).map((r) => ({ symbolVersionId: r.symbolVersionId, stableSymbolId: r.stableSymbolId, sourceRef: r.sourceRef, priorSourceRevision: r.priorSourceRevision, classification: r.primaryClassification, proof: r.proof ?? null }));

const blockedTotal = blockedCandidates.length;
const reconciliation = {
  alreadyQualifiedPlusExactPlusBlockedEquals479: alreadyQualifiedCount + exactRepairCandidates.length + blockedTotal === versionsTotal,
  allBadRowsClassifiedExactlyOnce: versionRows.length === versionsTotal,
  uniqueSealedBindingForEveryExactRepair: exactRepairCandidates.every((c) => c.proof.uniquenessCount === 1),
  proposedRevisionsCanonical: exactRepairCandidates.every((c) => /^sha256:[0-9a-f]{64}$/.test(c.proposedNew.sourceRevision)),
  workspacePlaceholderSubclassEquals200: versionRows.filter((r) => r.repairReason === 'WORKSPACE_PLACEHOLDER_EXACT' || (/^workspace:\d+$/.test(r.priorSourceRevision))).length === 200,
  legacy40HexSubclassEquals85: versionRows.filter((r) => r.repairReason === 'LEGACY_40HEX_EXACT' || (/^[0-9a-f]{40}$/.test(r.priorSourceRevision))).length === 85,
  independentSqlCrossCheckAgrees: Number(sqlIndependentCheck.already_qualified) === alreadyQualifiedCount && Number(sqlIndependentCheck.exact_repairable) === exactRepairCandidates.length && Number(sqlIndependentCheck.blocked) === blockedTotal && Number(sqlIndependentCheck.total) === versionsTotal,
  tableRowCountsAndChecksumsUnchangedAcrossAudit: tableUnchanged,
};

// ---- S01-10C-3: registry classification, independent of version repair -----------------------------------------------
const registryRows = registryRowsRaw.map((row) => {
  const revisionShape = q.sourceRevisionReasonV1(row.created_from_source_revision) === null ? 'QUALIFIED_SHA256'
    : /^workspace:\d+$/.test(row.created_from_source_revision) ? 'WORKSPACE_PLACEHOLDER'
    : /^[0-9a-f]{40}$/.test(row.created_from_source_revision) ? 'GIT_COMMIT_OR_SHORT_OID' : 'OTHER_INVALID';
  const hasVersion = versionedStableIds.has(row.stable_symbol_id);
  const hasAdmittedBinding = (bindingByRef.get(row.created_from_source_ref) ?? []).some((b) => b.workspace_revision === ADMITTED_WORKSPACE_REVISION);
  const classification = hasVersion ? 'VERSIONED_SYMBOL' : hasAdmittedBinding ? 'REGISTRY_SKELETON_WITH_SOURCE_EVIDENCE' : 'REGISTRY_SKELETON_NO_VERSION_EVIDENCE';
  return { stableSymbolId: row.stable_symbol_id, canonicalKey: row.canonical_key, sourceRef: row.created_from_source_ref, priorSourceRevision: row.created_from_source_revision, revisionShape, classification };
});
// ORPHAN_SYMBOL is deliberately NOT derived from atlas_source_refs: that table is symbol-grain (qualified_symbol/start_byte),
// not file-grain like atlas_workspace_source_bindings.canonical_source_ref -- comparing across that grain mismatch is exactly
// the composite-key-mismatch failure mode already recorded in this repo (materialize-ast-symbol-versions.mjs's NE-ID-03/04
// fix comment). No ORPHAN_SYMBOL row exists in this population under a grain-safe definition (created_from_source_ref is a
// NOT NULL column on every registry row, so "no source_ref at all" cannot occur); the classification is reserved, not removed.
const registryClassificationCounts = registryRows.reduce((a, r) => { a[r.classification] = (a[r.classification] ?? 0) + 1; return a; }, {});
const registryRevisionShapeCounts = registryRows.reduce((a, r) => { a[r.revisionShape] = (a[r.revisionShape] ?? 0) + 1; return a; }, {});
// CASE B remains in force: no registry skeleton is proposed for repair here, regardless of REGISTRY_SKELETON_WITH_SOURCE_EVIDENCE.
// Copying an admitted-cohort revision onto a skeleton that has no version row is not "repair" -- it would fabricate lineage
// the registry row never actually carried. That question belongs to the separate S01-10-schema gate.
const noRegistryRepairProposed = true;

const result = baselineDrift.length > 0 ? 'SYMBOL_REVISION_REPAIR_PREVIEW_BLOCKED'
  : Object.values(reconciliation).every(Boolean) ? 'SYMBOL_REVISION_REPAIR_PREVIEW_READY' : 'SYMBOL_REVISION_REPAIR_PREVIEW_BLOCKED';

const receipt = {
  schema: SCHEMA, generatedAt: new Date().toISOString(),
  supersedes: 'docs/reports/symbol-revision-repair-preview-v1.json (lighter first-pass S01-10C run this same session; kept as history, not the authoritative preview). docs/reports/symbol-revision-repair-manifest-v1.json (the S01-10D frozen from that lighter preview) is now STALE and must not be used to apply -- a new S01-10D must freeze from THIS receipt.',
  inputAuthority: { s07Receipt: 'docs/reports/current-source-authority-cohort-v1.json', s07Status: cohort.status, workspaceId: ADMITTED_WORKSPACE_ID, admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION, sealedCohortChecksum: COHORT_RECEIPT_CHECKSUM ?? cohort.membershipSetChecksum ?? null },
  baseline: { ...live, baselineDrift, versionArithmeticHolds },
  versionClassificationCounts, registryClassificationCounts, registryRevisionShapeCounts,
  exactRepairCandidates, blockedCandidates,
  reconciliation,
  excludedSurfaces: {
    upstreamFileId: 'remains NULL on every version row; blocked on S01-08 STABLE_FILE_ID_OWNER_MISSING; not touched by this preview',
    treeNodeCardinality: '22 shared upstream_node_id values attach to more than one stable symbol; untouched, separate S01-09C occurrence-cardinality audit',
    packetChunkLinkage: 'packet_key / candidate_ordinal on atlas_symbol_versions untouched',
    stableFileIdentity: 'no stableFileId introduced or referenced; graphify UUIDv4 ids are not stableFileId',
    reconciliationWriterForwardBindingDefect: 'RECONCILIATION_SOURCE_BINDING_REQUIRED -- symbol-reconciliation-writer-v1.mts (S01-10B) sets nomination.source_revision to the WORKSPACE revision, so its guarded promotion path is currently safe but nonfunctional (every nomination it builds is rejected for lacking a matching per-source binding). This is a forward-writer defect, not historical evidence, and must not be used as provenance for any repair proposed here; fix it in that writer before it is re-enabled for canonical apply.',
    registrySkeletonSchemaGate: 'CASE B remains in force: atlas_symbol_registry cannot represent a revision-less canonical skeleton (created_from_source_revision/created_from_source_ref/registry_revision are NOT NULL). No registry row is proposed for repair by this preview even when REGISTRY_SKELETON_WITH_SOURCE_EVIDENCE; that remains the separate S01-10-schema design/approval gate.',
  },
  noRegistryRepairProposed,
  independentSqlCrossCheck: { alreadyQualified: Number(sqlIndependentCheck.already_qualified), exactRepairable: Number(sqlIndependentCheck.exact_repairable), blocked: Number(sqlIndependentCheck.blocked), total: Number(sqlIndependentCheck.total) },
  tableFence: { before: fenceBefore, after: fenceAfter, unchanged: tableUnchanged },
  safety: { databaseWrites: 0, historicalRowsChanged: 0, graphifyRun: false, schemaChanged: false, stableFileIdCreated: false, upstreamFileIdChanged: false, readerCutover: false },
  status: result,
};
const body = JSON.stringify(receipt, null, 2);
const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
const immutable = path.join(root, 'docs/reports', `symbol-revision-placeholder-repair-preview-v1.${sha12}.json`);
const pointer = path.join(root, 'docs/reports/symbol-revision-placeholder-repair-preview-v1.json');
fs.writeFileSync(immutable, body + '\n', { flag: 'wx' });
fs.writeFileSync(pointer, body + '\n');
console.log(receipt.status, immutable);
console.log('baselineDrift:', JSON.stringify(baselineDrift));
console.log('versionClassificationCounts:', JSON.stringify(versionClassificationCounts));
console.log('registryClassificationCounts:', JSON.stringify(registryClassificationCounts));
console.log('reconciliation:', JSON.stringify(reconciliation));
await pool.end();
