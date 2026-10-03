#!/usr/bin/env tsx
/**
 * @file scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts
 *
 * ORDINAL-CORPUS-01: Production Candidate Ordinal Corpus Materializer
 *
 * Consumes audited canonical candidates from PostgreSQL / lineage report
 * and materializes the production CandidateOrdinalMapV1.
 *
 * Usage:
 *   npx tsx scripts/atlas/materialize-candidate-ordinal-corpus-v1.mts --dry-run
 *     --workspace-revision <admitted-revision>
 *     --candidate-snapshot-revision <admitted-snapshot-revision>
 *
 * Outputs:
 *   docs/reports/candidate-ordinal-corpus-v1.json
 *   docs/reports/candidate-ordinal-corpus-receipt-v1.json
 *
 * (Lineage join now present; 2026-09-28 fixed the revision filter to workspace_revision_key.)
 * HISTORICAL (2026-09-15): the last receipt (2026-08-27) materialized 4,951 rows
 * directly from `atlas_packets` -- this query has NO join through
 * `atlas_packet_chunk_lineage`/`codebase_chunk_index`, so that 4,951-row corpus is NOT
 * lineage-qualified the way the separate 15-row canary (frozen in
 * openspec/changes/parent-atlas-candidate-feature-execution-fabric) is. Before using this
 * script to scale past 15 rows toward 128, add the lineage join (source_ref + source_revision
 * -> atlas_packet_chunk_lineage -> chunk_row_id) and filter to PROVEN rows only, or this
 * becomes exactly the "unqualified/aliased identity" scaling this repo's own tasks.md
 * explicitly forbids. The materializer therefore requires explicit admitted revisions and
 * direct source_revision/packet identity; it never infers graph, semantic, or workspace
 * revisions from packet fields.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import {
  assertCandidateOrdinalMapIntegrityV1,
  materializeCandidateOrdinalMap,
} from '../../sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTPUT_MAP_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'candidate-ordinal-corpus-v1.json');
const OUTPUT_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'candidate-ordinal-corpus-receipt-v1.json');
const ADMISSION_REPORT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'workspace-revision-tournament-admission-v1.json');
const SNAPSHOT_ROOT = path.join(REPO_ROOT, 'docs', 'reports', 'workspace-source-snapshots');

const sha256Json = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

async function loadAdmittedRootSourceCohort(workspaceRevision: string, candidateSnapshotRevision: string) {
  const admission = JSON.parse(await fs.readFile(ADMISSION_REPORT_PATH, 'utf8'));
  if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
    || admission.authority !== true
    || admission.workspaceRevision !== workspaceRevision
    || admission.snapshotRevision !== candidateSnapshotRevision
    || typeof admission.manifestPath !== 'string') {
    throw new Error('ORDINAL_ROOT_COHORT_ADMISSION_BINDING_MISMATCH');
  }

  const manifestPath = path.resolve(admission.manifestPath);
  const relativeManifestPath = path.relative(SNAPSHOT_ROOT, manifestPath);
  if (!relativeManifestPath || relativeManifestPath.startsWith('..') || path.isAbsolute(relativeManifestPath)) {
    throw new Error('ORDINAL_ROOT_COHORT_MANIFEST_OUTSIDE_SNAPSHOT_ROOT');
  }
  const snapshot = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const {
    schema,
    snapshotRevision,
    workspaceRevision: snapshotWorkspaceRevision,
    status,
    canonicalAuthority,
    datastoreWritesPerformed,
    ...body
  } = snapshot;

  if (schema !== 'atlas.workspace-source-snapshot-capture.v1'
    || snapshotRevision !== candidateSnapshotRevision
    || sha256Json(body) !== snapshotRevision
    || snapshot.sourceMembershipChecksum !== admission.snapshotMembershipChecksum
    || snapshot.workspaceRevision !== null
    || status !== 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK'
    || canonicalAuthority !== false
    || datastoreWritesPerformed !== false
    || !Array.isArray(snapshot.sources)
    || (snapshot.violations?.length ?? 0) !== 0) {
    throw new Error('ORDINAL_ROOT_COHORT_SNAPSHOT_INVALID');
  }

  const sourceIdentityKeys = snapshot.sources.map((source: any) =>
    source.sourceIdentityKey ?? `${source.repositoryId}:${source.repositoryRelativePath}`);
  if (sha256Json([...sourceIdentityKeys].sort()) !== snapshot.sourceMembershipChecksum
    || new Set(sourceIdentityKeys).size !== sourceIdentityKeys.length) {
    throw new Error('ORDINAL_ROOT_COHORT_MEMBERSHIP_CHECKSUM_MISMATCH');
  }
  const sourceContentRows = snapshot.sources.map((source: any) => [
    source.sourceIdentityKey ?? `${source.repositoryId}:${source.repositoryRelativePath}`,
    source.sourceRevision,
    source.byteLength,
  ]);
  if (sha256Json(sourceContentRows) !== snapshot.sourceContentChecksum) {
    throw new Error('ORDINAL_ROOT_COHORT_CONTENT_CHECKSUM_MISMATCH');
  }

  const rootSources = snapshot.sources.filter((source: any) => source.repositoryId === 'repo:root');
  const bySourceRef = new Map<string, string>();
  for (const source of rootSources) {
    if (typeof source.sourceRef !== 'string'
      || !source.sourceRef
      || source.sourceRef !== source.repositoryRelativePath
      || source.sourceIdentityKey !== `repo:root:${source.sourceRef}`
      || !/^sha256:[0-9a-f]{64}$/i.test(source.sourceRevision ?? '')
      || bySourceRef.has(source.sourceRef)) {
      throw new Error('ORDINAL_ROOT_COHORT_SOURCE_ENTRY_INVALID');
    }
    bySourceRef.set(source.sourceRef, source.sourceRevision);
  }
  if (bySourceRef.size === 0) throw new Error('ORDINAL_ROOT_COHORT_EMPTY');

  const rootSourceMembershipChecksum = sha256Json([...bySourceRef.keys()].map((sourceRef) => `repo:root:${sourceRef}`).sort());
  return { admission, snapshot, bySourceRef, rootSourceMembershipChecksum };
}

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

interface RawCandidateRow {
  packet_id: string;
  packet_key: string | null;
  source_ref: string | null;
  canonical_source_ref: string | null;
  tree_node_id: string | null;
  feature_id: string | null;
  workspace_revision: string | null;
  source_revision: string | null;
  representation_revision: string | null;
  content_hash: string | null;
  sha256: string | null;
  metadata: Record<string, any> | null;
  lineage_proven: boolean;
  lineage_present: boolean;
  lineage_revision_mismatch: boolean;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const shuffle = args.includes('--shuffle');
  const argValue = (name: string): string | null => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1].trim() : null;
  };
  const workspaceRevision = argValue('--workspace-revision');
  const candidateSnapshotRevision = argValue('--candidate-snapshot-revision');
  const artifactOutputDirArg = argValue('--artifact-output-dir');

  if (!workspaceRevision) throw new Error('CURRENT_WORKSPACE_REVISION_REQUIRED');
  if (!candidateSnapshotRevision) throw new Error('CANDIDATE_SNAPSHOT_REVISION_REQUIRED');
  const rootCohort = await loadAdmittedRootSourceCohort(workspaceRevision, candidateSnapshotRevision);
  if (!dryRun) {
    // Apply remains separately authorized even after the root cohort is verified.
    if (!args.includes('--authorize-current-cohort')) throw new Error('ORDINAL_CORPUS_APPLY_REQUIRES_AUTHORIZED_CURRENT_COHORT');
  }
  if (artifactOutputDirArg && !dryRun) throw new Error('LOCAL_ARTIFACT_OUTPUT_REQUIRES_DRY_RUN');

  console.log('── Materialize Candidate Ordinal Corpus V1 ───────────────');
  console.log(`Dry run: ${dryRun} | Shuffle test: ${shuffle}`);

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 5000,
    statement_timeout: 60_000,
  });

  const query = `
    SELECT 
      packet_id,
      packet_key,
      source_ref,
      canonical_source_ref,
      tree_node_id,
      feature_id,
      workspace_revision_key AS workspace_revision,
      source_revision,
      representation_revision,
      content_hash,
      sha256,
      metadata,
      COALESCE(lineage.lineage_proven, false) AS lineage_proven,
      COALESCE(lineage.lineage_present, false) AS lineage_present,
      (COALESCE(lineage.proven_other_revision, false)
        AND NOT COALESCE(lineage.lineage_proven, false)) AS lineage_revision_mismatch
    FROM atlas_packets p
    -- Compute all lineage diagnostics in one scan per packet. Keep the chunk join:
    -- chunk_row_id is NOT NULL but currently has no FK, so non-null alone does not
    -- prove that a physical codebase_chunk_index row exists.
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) > 0 AS lineage_present,
        BOOL_OR(
          l.revision_status = 'PROVEN'
          AND l.source_revision = p.source_revision
          AND cci.id IS NOT NULL
        ) AS lineage_proven,
        BOOL_OR(
          l.revision_status = 'PROVEN'
          AND l.source_revision IS DISTINCT FROM p.source_revision
          AND cci.id IS NOT NULL
        ) AS proven_other_revision
      FROM atlas_packet_chunk_lineage l
      LEFT JOIN codebase_chunk_index cci ON cci.id = l.chunk_row_id
      WHERE l.packet_key = p.packet_key
        -- Exact raw source_ref: canonical_source_ref strips a prefix and is not
        -- interchangeable with the spelling stored in lineage.
        AND l.source_ref = p.source_ref
    ) lineage ON TRUE
    WHERE p.workspace_revision_key = $1
    ORDER BY p.packet_id ASC
  `;

  let rows: RawCandidateRow[];
  let sourceBindingRows: Array<Pick<RawCandidateRow, 'packet_id' | 'packet_key' | 'source_ref' | 'workspace_revision' | 'source_revision'>>;
  try {
    const res = await pool.query(query, [workspaceRevision]);
    rows = res.rows;
    const sourceBindings = await pool.query(
      `SELECT packet_id, packet_key, source_ref, workspace_revision_key AS workspace_revision, source_revision
       FROM atlas_packets
       WHERE source_ref = ANY($1::text[])`,
      [[...rootCohort.bySourceRef.keys()]],
    );
    sourceBindingRows = sourceBindings.rows;
  } finally {
    await pool.end();
  }

  // The admitted repo:root snapshot is the source-cohort authority. Match the
  // packet's raw path and exact source revision; canonicalized/aliased paths
  // must not widen this set. Keep the broader workspace-revision count only as
  // a diagnostic denominator in the receipt.
  const revisionRows = rows;
  const rootCohortRows = revisionRows.filter((row) =>
    row.source_ref !== null
    && row.source_revision !== null
    && rootCohort.bySourceRef.get(row.source_ref) === row.source_revision);
  const rootSourceRows = revisionRows.filter((row) => row.source_ref !== null && rootCohort.bySourceRef.has(row.source_ref));

  // A packet row alone is not enough for CandidateOrdinal promotion. Require
  // an exact, revision-qualified source→packet→chunk bridge with a real chunk.
  const validRows = rootCohortRows.filter((r) => {
    const sRef = r.source_ref;
    const sRev = r.source_revision;
    return Boolean(
      r.workspace_revision === workspaceRevision &&
      r.packet_key?.trim() &&
      sRef?.trim() &&
      sRev?.trim() &&
      r.lineage_proven === true,
    );
  });

  console.log(`Admitted repo:root packet rows: ${rootCohortRows.length} / ${revisionRows.length} workspace-revision rows`);
  console.log(`Lineage-qualified repo:root rows: ${validRows.length} / ${rootCohortRows.length}`);

  let orderedRows = [...validRows];

  if (shuffle) {
    console.log('Applying reversed input order to test canonical ordinal-map sorting...');
    orderedRows = [...orderedRows].reverse();
  }

  const candidateInputs = orderedRows.map((row) => {
    // ORDINAL-LINEAGE-02: packet_id is a separate legacy/storage column and is never promoted as
    // identity here. Historical map rows whose canonicalId came from packet_id are retained only
    // in the rejection census; fresh candidate identity is always sourced from packet_key.
    // validRows (the source of orderedRows) already required packet_key?.trim() truthy above --
    // this is a defensive re-check, not a new filter, matching this repo's "reject rather than
    // fabricate identity" convention (see graph-snapshot-postgres.ts's normalizePacketRow).
    if (!row.packet_key?.trim()) throw new Error(`CANDIDATE_ROW_WITHOUT_PACKET_KEY: ${row.source_ref ?? 'unknown'}`);
    const canonicalId: string = row.packet_key;
    const packetKey = row.packet_key || null;
    const sourceRef = row.canonical_source_ref || row.source_ref || null;
    const treeNodeId = row.tree_node_id || (row.metadata && row.metadata.tree_node_id) || null;
    const symbolVersionId = (row.metadata && row.metadata.symbol_version_id) || null;
    const sourceRevision = row.source_revision as string;
    const semanticRevision = row.representation_revision || null;
    const graphRevision = null;

    return {
      canonicalId,
      packetKey,
      sourceRef,
      treeNodeId,
      symbolVersionId,
      workspaceRevision,
      sourceRevision,
      graphRevision,
      semanticRevision,
      degradedIdentity: false,
      evidenceRefs: [`atlas_packets:${canonicalId}`],
      representationBindings: [],
    };
  });

  const canonicalMap = materializeCandidateOrdinalMap({
    candidates: candidateInputs,
    candidateSnapshotRevision,
    workspaceRevision,
    producerRevision: 'materialize-candidate-ordinal-corpus-v1',
  });
  assertCandidateOrdinalMapIntegrityV1(canonicalMap);
  const candidates = canonicalMap.candidates;
  const ordinalMapChecksum = canonicalMap.ordinalMapChecksum;
  if (shuffle) {
    const replayMap = materializeCandidateOrdinalMap({
      candidates: [...candidateInputs].reverse(),
      candidateSnapshotRevision,
      workspaceRevision,
      producerRevision: 'materialize-candidate-ordinal-corpus-v1',
    });
    if (replayMap.ordinalMapChecksum !== ordinalMapChecksum) throw new Error('SHUFFLE_DETERMINISM_CHECKSUM_MISMATCH');
  }

  let legacyArtifact: { rows: any[]; available: boolean } = { rows: [], available: false };
  try {
    const value = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'docs', 'reports', 'candidate-ordinal-corpus-v1.json'), 'utf8'));
    if (value.workspaceRevision === workspaceRevision && value.candidateSnapshotRevision === candidateSnapshotRevision) {
      legacyArtifact = { rows: (value.candidates ?? []).filter((candidate: any) => candidate.canonicalId !== candidate.packetKey), available: true };
    }
  } catch {
    // A historical artifact is diagnostic only; absence cannot affect canonical cohort selection.
  }
  const freshCanonicalIds = new Set(candidates.map((candidate) => candidate.canonicalId));
  const legacyPacketKeysRebuiltFromCanonicalRows = legacyArtifact.rows.filter((row: any) =>
    typeof row.packetKey === 'string' && freshCanonicalIds.has(row.packetKey)).length;
  const legacyIdentityValuesCarriedForward = legacyArtifact.rows.filter((row: any) =>
    typeof row.canonicalId === 'string' && freshCanonicalIds.has(row.canonicalId)).length;
  const sourceRefsWithAnyPacket = new Set(sourceBindingRows.map((row) => row.source_ref).filter((value): value is string => Boolean(value)));
  const sourceSnapshotRevisionMismatch = rootSourceRows.filter((row) =>
    typeof row.source_revision === 'string' && row.source_revision.length > 0
    && rootCohort.bySourceRef.get(row.source_ref!) !== row.source_revision).length;
  const workspaceRevisionMismatch = sourceBindingRows.filter((row) =>
    rootCohort.bySourceRef.get(row.source_ref!) === row.source_revision
    && row.workspace_revision !== workspaceRevision).length;
  const missingSourceRevision = rootSourceRows.filter((row) =>
    typeof row.source_revision !== 'string' || row.source_revision.trim().length === 0).length;
  const foreignRepositoryRows = revisionRows.filter((row) =>
    !row.source_ref || !rootCohort.bySourceRef.has(row.source_ref)).length;
  const canonicalIdCounts = new Map<string, number>();
  for (const candidate of candidates) canonicalIdCounts.set(candidate.canonicalId, (canonicalIdCounts.get(candidate.canonicalId) ?? 0) + 1);
  const duplicateCanonicalId = [...canonicalIdCounts.values()].filter((count) => count > 1).length;
  const duplicateOrdinal = candidates.length - new Set(candidates.map((candidate) => candidate.candidateOrdinal)).size;
  const rejectionCensus = {
    excluded_legacy_identity: legacyArtifact.rows.length,
    missing_packet: [...rootCohort.bySourceRef.keys()].filter((sourceRef) => !sourceRefsWithAnyPacket.has(sourceRef)).length,
    missing_source_revision: missingSourceRevision,
    workspace_revision_mismatch: workspaceRevisionMismatch,
    duplicate_canonical_id: duplicateCanonicalId,
    duplicate_ordinal: duplicateOrdinal,
    foreign_repository: foreignRepositoryRows,
    source_revision_mismatch: rootCohortRows.filter((row) => row.lineage_revision_mismatch).length,
    source_snapshot_revision_mismatch: sourceSnapshotRevisionMismatch,
    missing_lineage: rootCohortRows.filter((row) => !row.lineage_present).length,
    lineage_unqualified_other: rootCohortRows.filter((row) => !row.lineage_proven && row.lineage_present && !row.lineage_revision_mismatch).length,
  };

  // Keep the map itself on the strict CandidateOrdinalMapV1 schema. Scope and
  // lineage diagnostics belong in the companion receipt, not extra map fields.
  const ordinalMap = canonicalMap;

  const receipt = {
    schema: 'atlas.candidate-ordinal-corpus-receipt.v1',
    workspaceRevision,
    packetRowsForRevision: revisionRows.length,
    packetRowsForAdmittedRootCohort: rootCohortRows.length,
    sourceScope: 'ADMITTED_REPO_ROOT',
    sourceManifestRevision: rootCohort.snapshot.snapshotRevision,
    rootSourceCount: rootCohort.bySourceRef.size,
    rootSourceMembershipChecksum: rootCohort.rootSourceMembershipChecksum,
    lineageQualifiedRowCount: validRows.length,
    lineageRequired: true,
    rejectionCensusScope: {
      candidateDenominator: 'atlas_packets rows at admitted workspaceRevision with exact repo:root sourceRef/sourceRevision membership',
      missing_packet: 'repo:root snapshot sources with no atlas_packets row at any workspace revision; diagnostic only, outside the candidate-row denominator',
      excluded_legacy_identity: 'historical same-revision ordinal rows whose canonicalId differs from packetKey; legacy ID values are not reused',
      missing_lineage: 'admitted repo:root packet rows without an exact PROVEN packet-to-chunk bridge',
    },
    rejectionCensus,
    legacyIdentityHandling: {
      historicalArtifactMatched: legacyArtifact.available,
      historicalLegacyIdentityRows: legacyArtifact.rows.length,
      historicalLegacyIdentityValuesCarriedForward: legacyIdentityValuesCarriedForward,
      legacyPacketKeysRebuiltFromCanonicalRows,
      identitySource: 'atlas_packets.packet_key',
      legacyIdentityAuthority: false,
    },
    fullAdmittedRootCoverage: validRows.length === rootCohortRows.length && rootCohortRows.length > 0,
    canonicalOrderingPolicy: 'CANONICAL_ID_ASCENDING',
    generatedAt: new Date().toISOString(),
    dryRun,
    shuffleTest: shuffle,
    localArtifactOnly: dryRun && Boolean(artifactOutputDirArg),
    datastoreWrites: 0,
    canonicalAuthority: false,
    rowCount: candidates.length,
    candidateSnapshotRevision,
    ordinalMapChecksum,
    sampleFirst5: candidates.slice(0, 5).map((c) => ({ ordinal: c.candidateOrdinal, id: c.canonicalId, sourceRef: c.sourceRef })),
    sampleLast5: candidates.slice(-5).map((c) => ({ ordinal: c.candidateOrdinal, id: c.canonicalId, sourceRef: c.sourceRef })),
  };

  if (!dryRun) {
    await fs.mkdir(path.dirname(OUTPUT_MAP_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_MAP_PATH, JSON.stringify(ordinalMap, null, 2), 'utf8');
    await fs.writeFile(OUTPUT_RECEIPT_PATH, JSON.stringify(receipt, null, 2), 'utf8');
    console.log(`✅ Wrote map to ${OUTPUT_MAP_PATH}`);
    console.log(`✅ Wrote receipt to ${OUTPUT_RECEIPT_PATH}`);
  } else if (artifactOutputDirArg) {
    const outputDir = path.resolve(REPO_ROOT, artifactOutputDirArg);
    const allowedRoot = path.resolve(REPO_ROOT, '.tmp/atlas/candidate-ordinal-corpus-v2');
    if (!outputDir.startsWith(`${allowedRoot}${path.sep}`)) throw new Error('ARTIFACT_OUTPUT_DIR_OUTSIDE_LOCAL_V2_ROOT');
    await fs.mkdir(path.dirname(outputDir), { recursive: true });
    await fs.mkdir(outputDir, { recursive: false });
    const mapPath = path.join(outputDir, 'candidate-ordinal-map-v1.json');
    const receiptPath = path.join(outputDir, 'receipt.json');
    const rejectedCandidates = rootCohortRows
      .filter((row) => row.lineage_proven !== true)
      .map((row) => ({
        packetKey: row.packet_key,
        sourceRef: row.source_ref,
        workspaceRevision: row.workspace_revision,
        sourceRevision: row.source_revision,
        classification: !row.lineage_present
          ? 'MISSING_LINEAGE'
          : row.lineage_revision_mismatch
            ? 'PROVEN_LINEAGE_REVISION_MISMATCH'
            : 'LINEAGE_PRESENT_NOT_EXACT_PROVEN',
        lineagePresent: row.lineage_present,
        lineageRevisionMismatch: row.lineage_revision_mismatch,
      }))
      .sort((a, b) => (a.packetKey ?? '').localeCompare(b.packetKey ?? '')
        || (a.sourceRef ?? '').localeCompare(b.sourceRef ?? ''));
    const rejectionDiagnosticBody = {
      schema: 'atlas.candidate-ordinal-rejection-diagnostics.v1',
      workspaceRevision,
      candidateSnapshotRevision,
      sourceManifestRevision: rootCohort.snapshot.snapshotRevision,
      rootSourceMembershipChecksum: rootCohort.rootSourceMembershipChecksum,
      candidateRowCount: rootCohortRows.length,
      rejectedCandidateCount: rejectedCandidates.length,
      rejectedCandidates,
      canonicalAuthority: false,
      datastoreWrites: 0,
    };
    const rejectionDiagnostics = {
      ...rejectionDiagnosticBody,
      diagnosticChecksum: sha256Json(rejectionDiagnosticBody),
    };
    const diagnosticsPath = path.join(outputDir, 'rejection-diagnostics.json');
    await fs.writeFile(mapPath, `${JSON.stringify(ordinalMap, null, 2)}\n`, { flag: 'wx' });
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
    await fs.writeFile(diagnosticsPath, `${JSON.stringify(rejectionDiagnostics, null, 2)}\n`, { flag: 'wx' });
    console.log(`SEALED LOCAL ARTIFACT ONLY: ${mapPath}`);
    console.log(`SEALED LOCAL RECEIPT: ${receiptPath}`);
    console.log(`LOCAL REJECTION DIAGNOSTICS ONLY: ${diagnosticsPath}`);
  } else {
    console.log('DRY RUN: Map and receipt computed successfully without writing.');
  }

  console.log('══════════════════════════════════════════════════════════');
  console.log(`Total Candidates:       ${candidates.length}`);
  console.log(`Snapshot Revision:      ${candidateSnapshotRevision}`);
  console.log(`Ordinal Map Checksum:   ${ordinalMapChecksum}`);
  console.log('══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('[materialize-candidate-ordinal-corpus] Fatal:', err);
  process.exit(1);
});
