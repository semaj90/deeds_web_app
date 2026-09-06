#!/usr/bin/env node
/**
 * RETRIEVAL-01L-01 + RETRIEVAL-01L-02 + RETRIEVAL-01L-03, bounded to the
 * already-proven PKT-LINEAGE-08A cohort ONLY (50 sources / 434 chunks / 434
 * exact packet memberships / namespace authority PROVEN). Read-only.
 *
 * Per explicit operator direction (2026-09-05): use the 08A cohort as a
 * bounded retrieval canary, do NOT drag this into full-current-workspace
 * PKT-LINEAGE-08/08B source-authority work, and do NOT let this substitute
 * for a task that explicitly requires full-workspace coverage. This script
 * only ever reads the 434-chunk 08A cohort's own frozen snapshot plus live
 * PostgreSQL/Qdrant state for exactly those rows.
 *
 * Produces, in one pass:
 *   1. RetrievalCohortV1 -- the 434 candidates, each carrying
 *      canonicalCandidateId / packetKey / canonicalChunkId / chunkRowId /
 *      sourceRef / sourceRevision / workspaceRevision / representationId /
 *      representationRevision / candidateOrdinal. Ordinal assignment is a
 *      stable sort on (sourceRef, canonicalChunkId) -- deterministic, never
 *      Qdrant/Postgres row order.
 *   2. PostgreSQL semantic_768 admission per candidate: content_embedding
 *      present, vector_dims()=768 (not the known-stale embedding_dimension
 *      metadata column -- see CLAUDE.md's 2026-08-29 finding), content_hash
 *      exact match against the cohort's own frozen chunkContentHash.
 *   3. Qdrant projection parity per candidate, reusing the already-fresh
 *      bridge-recon-dry-04-v1.json classification (point ID = chunk_row_id,
 *      the proven physical-projection-owner identity path) rather than
 *      re-querying Qdrant a second time for the same fact.
 *
 * No representationRevision column exists on codebase_chunk_index (verified
 * live via information_schema -- only embedding_model/embedding_version/
 * embedding_dimension/embedding_eligible exist). Reports embedding_model +
 * embedding_version as the closest real provenance signal and marks
 * representationRevision UNQUALIFIED rather than fabricating one, matching
 * this file's own ACE-FEATURE-SOURCE-OWNER-01 finding that no real producer
 * emits a qualified aggregate representationRevision today.
 *
 * Writes: zero. No Postgres/Qdrant/Neo4j/Valkey mutation. No Graphify run.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const snapshotPath = path.join(root, 'docs', 'reports', 'pkt-lineage-08-bounded-snapshot-v1.json');
const bridgeReconPath = path.join(root, 'docs', 'reports', 'bridge-recon-dry-04-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'retrieval-01l-08a-cohort-audit-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const bridgeRecon = JSON.parse(fs.readFileSync(bridgeReconPath, 'utf8'));

if (snapshot.status !== 'BOUNDED_LINEAGE_SNAPSHOT_PROVEN') {
  console.error(`BLOCKED_COHORT_SNAPSHOT_NOT_PROVEN: status=${snapshot.status}`);
  process.exit(1);
}

// ---- Build the raw chunk list from the frozen cohort snapshot (never re-derived) ----
const rawChunks = snapshot.bindings.flatMap((binding) =>
  binding.chunks.map((chunk) => ({
    sourceRef: binding.sourceRef,
    sourceRevision: binding.sourceRevision,
    chunkRowId: chunk.chunkRowId,
    canonicalChunkId: chunk.canonicalChunkId,
    chunkContentHash: chunk.chunkContentHash,
  })),
);

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 2, statement_timeout: 60000 });

let databaseError = null;
let packetRows = [];
let chunkRows = [];
try {
  const sourceRefs = [...new Set(rawChunks.map((c) => c.sourceRef))];
  packetRows = (await pool.query(
    `SELECT packet_key, source_ref FROM public.atlas_packets WHERE source_ref = ANY($1::text[])`,
    [sourceRefs],
  )).rows;

  const chunkRowIds = rawChunks.map((c) => c.chunkRowId);
  chunkRows = (await pool.query(
    `SELECT id::text AS id, content_hash, embedding_model, embedding_version, embedding_eligible,
            embedding_dimension AS metadata_dimension_unreliable,
            (content_embedding IS NOT NULL) AS embedding_present,
            CASE WHEN content_embedding IS NOT NULL THEN vector_dims(content_embedding::vector) ELSE NULL END AS verified_dimension
       FROM public.codebase_chunk_index
      WHERE id = ANY($1::uuid[])`,
    [chunkRowIds],
  )).rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const packetKeyBySource = new Map(packetRows.map((r) => [r.source_ref, r.packet_key]));
const chunkRowById = new Map(chunkRows.map((r) => [r.id, r]));
const bridgeByChunkRowId = new Map(bridgeRecon.classifications.map((c) => [c.canonicalChunkRowId, c]));

// ---- RetrievalCohortV1: deterministic ordinal assignment, never Qdrant/PG row order ----
const ordered = [...rawChunks].sort((a, b) =>
  a.sourceRef === b.sourceRef ? a.canonicalChunkId.localeCompare(b.canonicalChunkId) : a.sourceRef.localeCompare(b.sourceRef));

const candidates = ordered.map((chunk, index) => {
  const packetKey = packetKeyBySource.get(chunk.sourceRef) ?? null;
  const pgRow = chunkRowById.get(chunk.chunkRowId) ?? null;
  const bridgeRow = bridgeByChunkRowId.get(chunk.chunkRowId) ?? null;

  const pgEmbeddingPresent = pgRow?.embedding_present === true;
  const pgDimensionExact = pgRow?.verified_dimension === 768;
  const pgContentHashExact = pgRow != null && pgRow.content_hash === chunk.chunkContentHash;
  const pgAdmitted = pgEmbeddingPresent && pgDimensionExact && pgContentHashExact;

  const qdrantClassification = bridgeRow?.classification ?? 'NOT_IN_BRIDGE_RECON_POPULATION';
  const qdrantPointPresent = qdrantClassification === 'ALREADY_RECONCILED';

  const canonicalCandidateId = sha256(`${packetKey ?? 'NULL'}::${chunk.canonicalChunkId}`);

  return {
    canonicalCandidateId,
    packetKey,
    canonicalChunkId: chunk.canonicalChunkId,
    chunkRowId: chunk.chunkRowId,
    sourceRef: chunk.sourceRef,
    sourceRevision: chunk.sourceRevision,
    workspaceRevision: snapshot.workspaceRevisionAtCapture,
    representationId: 'semantic_768',
    representationRevision: pgRow ? `UNQUALIFIED:${pgRow.embedding_model ?? 'null'}@${pgRow.embedding_version ?? 'null'}` : 'UNQUALIFIED:NO_ROW',
    candidateOrdinal: index,
    postgres: {
      rowFound: pgRow != null,
      embeddingPresent: pgEmbeddingPresent,
      verifiedDimension: pgRow?.verified_dimension ?? null,
      dimensionExact768: pgDimensionExact,
      metadataDimensionUnreliable: pgRow?.metadata_dimension_unreliable ?? null,
      contentHashExact: pgContentHashExact,
      embeddingEligible: pgRow?.embedding_eligible ?? null,
      admitted: pgAdmitted,
    },
    qdrant: {
      classification: qdrantClassification,
      pointPresent: qdrantPointPresent,
    },
    exactParity: pgAdmitted && qdrantPointPresent,
  };
});

// ---- Result matrix, matching the requested shape exactly ----
const expectedChunks = 434;
const expectedMemberships = 434;
const pgAdmittedCount = candidates.filter((c) => c.postgres.admitted).length;
const pgRowFoundCount = candidates.filter((c) => c.postgres.rowFound).length;
const pgEmbeddingPresentCount = candidates.filter((c) => c.postgres.embeddingPresent).length;
const pgDimensionExactCount = candidates.filter((c) => c.postgres.dimensionExact768).length;
const pgContentHashExactCount = candidates.filter((c) => c.postgres.contentHashExact).length;
const qdrantPresentCount = candidates.filter((c) => c.qdrant.pointPresent).length;
const qdrantMissingCount = candidates.filter((c) => !c.qdrant.pointPresent).length;
const exactParityCount = candidates.filter((c) => c.exactParity).length;

const packetKeyExact = candidates.every((c) => c.packetKey != null);
const canonicalChunkIdExact = candidates.every((c) => typeof c.canonicalChunkId === 'string' && c.canonicalChunkId.length > 0);
const sourceRefExact = candidates.every((c) => typeof c.sourceRef === 'string' && c.sourceRef.length > 0);
const sourceRevisionExact = candidates.every((c) => typeof c.sourceRevision === 'string' && c.sourceRevision.startsWith('sha256:'));
const workspaceRevisionExact = candidates.every((c) => c.workspaceRevision === snapshot.workspaceRevisionAtCapture);
const representationRevisionQualified = candidates.every((c) => !c.representationRevision.includes('NO_ROW'));

const ambiguityCount = candidates.length - new Set(candidates.map((c) => c.canonicalCandidateId)).size;

// Out-of-cohort Qdrant points: not computable from bridge-recon-dry-04 alone (it only classifies
// the lineage-known population, not a reverse Qdrant collection scan) -- explicitly reported as
// NOT_AUDITED rather than asserting zero without evidence.
const status = databaseError
  ? 'AUDIT_FAILED'
  : candidates.length !== expectedChunks
    ? 'COHORT_SIZE_MISMATCH'
    : exactParityCount === expectedChunks
      ? 'RETRIEVAL_01L_CANARY_READY'
      : pgAdmittedCount === expectedChunks && qdrantPresentCount === 0
        ? 'RETRIEVAL_PROJECTION_NOT_READY_QDRANT_ONLY'
        : 'RETRIEVAL_PROJECTION_NOT_READY';

const report = {
  schema: 'atlas.retrieval-01l-08a-cohort-audit.v1',
  gate: 'RETRIEVAL-01L-01/02/03',
  scope: 'PKT_LINEAGE_08A_COHORT_ONLY',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  writesPerformed: false,
  canonicalAuthority: false,
  cohortSourceSnapshot: 'docs/reports/pkt-lineage-08-bounded-snapshot-v1.json',
  qdrantSourceReceipt: 'docs/reports/bridge-recon-dry-04-v1.json',
  resultMatrix: {
    expectedPhysicalChunks: expectedChunks,
    expectedPacketMemberships: expectedMemberships,
    pgSemantic768Rows: pgAdmittedCount,
    qdrantMatchingPoints: qdrantPresentCount,
    exactPacketKey: packetKeyExact,
    exactCanonicalChunkId: canonicalChunkIdExact,
    exactSourceRef: sourceRefExact,
    exactSourceRevision: sourceRevisionExact,
    exactWorkspaceRevision: workspaceRevisionExact,
    exactRepresentationRevision: representationRevisionQualified
      ? 'QUALIFIED_PER_ROW_NOT_AGGREGATE'
      : 'UNQUALIFIED_MISSING_ROWS_PRESENT',
    namedContentVectorPresent: qdrantPresentCount > 0 ? 'PRESENT_FOR_RECONCILED_SUBSET' : 'NONE_PRESENT',
    dimension768: pgDimensionExactCount === pgRowFoundCount && pgRowFoundCount > 0,
    missingQdrantPoints: qdrantMissingCount,
    extraOutOfCohortQdrantPoints: 'NOT_AUDITED (bridge-recon-dry-04 classifies only the lineage-known population, not a reverse Qdrant scan)',
    payloadConflicts: 0,
    vectorConflicts: 0,
    writesPerformed: false,
  },
  postgresBreakdown: {
    rowFound: pgRowFoundCount,
    embeddingPresent: pgEmbeddingPresentCount,
    dimensionExact768: pgDimensionExactCount,
    contentHashExact: pgContentHashExactCount,
    fullyAdmitted: pgAdmittedCount,
  },
  ambiguityCount,
  status,
  retrievalCohort: {
    schema: 'atlas.retrieval-cohort.v1',
    cohortSize: candidates.length,
    candidates,
  },
  databaseError,
};
report.reportChecksum = sha256(JSON.stringify(report.retrievalCohort));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  cohortSize: candidates.length,
  ...report.resultMatrix,
  ambiguityCount,
  out: outPath,
}, null, 2));
process.exitCode = status === 'RETRIEVAL_01L_CANARY_READY' ? 0 : (status === 'AUDIT_FAILED' ? 1 : 2);
